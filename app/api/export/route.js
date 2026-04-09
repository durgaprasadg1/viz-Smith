import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { buildPreparedCharts } from "@/lib/chart-preparation";
import { analyzeDatasetBuffer } from "@/lib/dataset-analysis";
import { buildExportFile } from "@/lib/exporters";
import { getEnvVar } from "@/lib/supabase";

const ALLOWED_EXPORT_FORMATS = new Set(["pdf", "ppt", "excel"]);

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function getStorageDownloadCandidates(dataset) {
  const primaryPath =
    typeof dataset?.storage_path === "string"
      ? dataset.storage_path.trim()
      : "";

  return {
    buckets: unique([dataset?.storage_bucket, "user-uploads", "raw-uploads"]),
    paths: unique([primaryPath, primaryPath.replace(/^\/+/, "")]),
  };
}

async function downloadStoredDataset(storageClient, dataset) {
  const { buckets, paths } = getStorageDownloadCandidates(dataset);
  let lastError = null;

  for (const bucket of buckets) {
    for (const path of paths) {
      const { data, error } = await storageClient.storage
        .from(bucket)
        .download(path);

      if (!error && data) {
        return {
          file: data,
          bucket,
          path,
        };
      }

      lastError = error || lastError;
    }
  }

  return {
    file: null,
    bucket: null,
    path: null,
    error: lastError,
  };
}

export async function POST(req) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { datasetId, format } = await req.json();
    const normalizedFormat =
      typeof format === "string" ? format.toLowerCase() : format;

    if (!datasetId || typeof datasetId !== "string") {
      return NextResponse.json(
        { error: "Dataset id is required" },
        { status: 400 },
      );
    }

    if (!ALLOWED_EXPORT_FORMATS.has(normalizedFormat)) {
      return NextResponse.json(
        { error: "Unsupported export format" },
        { status: 400 },
      );
    }

    const { supabaseURL, supabaseAnonKey } = getEnvVar();
    const supabase = createClient(supabaseURL, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: dataset, error: datasetError } = await supabase
      .from("datasets")
      .select(
        "id, user_id, file_name, file_size, file_type, storage_bucket, storage_path, metadata, created_at, uploaded_at",
      )
      .eq("id", datasetId)
      .single();

    if (datasetError || !dataset || dataset.user_id !== user.id) {
      return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
    }

    if (!dataset.storage_path) {
      return NextResponse.json(
        {
          error:
            "This dataset has no source file reference. Please upload it again and retry export.",
        },
        { status: 400 },
      );
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const storageClient = serviceRoleKey
      ? createClient(supabaseURL, serviceRoleKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
          },
        })
      : supabase;

    const { file: storedFile, error: storageError } =
      await downloadStoredDataset(storageClient, dataset);

    if (storageError || !storedFile) {
      const message = String(storageError?.message || "").toLowerCase();
      const missingObject =
        message.includes("object") && message.includes("not")
          ? true
          : message.includes("not found");

      return NextResponse.json(
        {
          error: missingObject
            ? "Original uploaded file was not found in storage. Please re-upload this dataset and try export again."
            : storageError?.message || "Unable to download dataset",
        },
        { status: missingObject ? 404 : 500 },
      );
    }

    const buffer = Buffer.from(await storedFile.arrayBuffer());
    const analysis = await analyzeDatasetBuffer({
      buffer,
      fileName: dataset.file_name,
      fileSize: dataset.file_size,
      existingRelationships: dataset.metadata?.relationships,
    });

    const preparedCharts = buildPreparedCharts(
      analysis.relationships,
      analysis.previewRows,
      analysis.columns,
    );

    const exportFile = await buildExportFile({
      dataset,
      format: normalizedFormat,
      columns: analysis.columns,
      rows: analysis.data,
      charts: preparedCharts.charts,
    });

    const safeBaseName = dataset.file_name
      .replace(/\.[^/.]+$/, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_");

    return new NextResponse(exportFile.buffer, {
      status: 200,
      headers: {
        "Content-Type": exportFile.contentType,
        "Content-Disposition": `attachment; filename="${safeBaseName}.${exportFile.extension}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Something went wrong" },
      { status: 500 },
    );
  }
}
