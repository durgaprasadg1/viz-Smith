import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { buildPreparedCharts } from "@/lib/chart-preparation";
import { analyzeDatasetBuffer } from "@/lib/dataset-analysis";
import { buildExportFile } from "@/lib/exporters";
import {
  CACHE_TTL_SECONDS,
  getDatasetCacheKey,
  getOrSetCachedJson,
  invalidateUserDatasetCaches,
} from "@/lib/redis-cache";
import { getEnvVar } from "@/lib/supabase";

const ALLOWED_EXPORT_FORMATS = new Set(["pdf", "ppt"]);

export const runtime = "nodejs";

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function stripLeadingSlash(value) {
  return String(value || "").replace(/^\/+/, "");
}

function extractObjectPathFromUrl(rawValue) {
  try {
    const url = new URL(String(rawValue || ""));
    const pathname = decodeURIComponent(url.pathname || "");
    const markers = [
      "/storage/v1/object/public/",
      "/storage/v1/object/authenticated/",
      "/storage/v1/object/sign/",
      "/storage/v1/object/",
    ];

    for (const marker of markers) {
      const index = pathname.indexOf(marker);
      if (index !== -1) {
        return stripLeadingSlash(pathname.slice(index + marker.length));
      }
    }

    return stripLeadingSlash(pathname);
  } catch {
    return null;
  }
}

function getAccessTokenFromRequest(req) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice("Bearer ".length).trim() || null;
}

function createAuthorizedSupabaseClient(token) {
  const { supabaseURL, supabaseAnonKey } = getEnvVar();
  return createClient(supabaseURL, supabaseAnonKey, {
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
}

function getStorageDownloadCandidates(dataset) {
  const metadata =
    dataset?.metadata && typeof dataset.metadata === "object"
      ? dataset.metadata
      : {};

  const buckets = unique([
    dataset?.storage_bucket,
    metadata?.storage_bucket,
    metadata?.storageBucket,
    "user-uploads",
    "raw-uploads",
  ]);

  const rawPaths = unique([
    dataset?.storage_path,
    metadata?.storage_path,
    metadata?.storagePath,
    metadata?.file_path,
    metadata?.filePath,
    metadata?.upload_path,
    metadata?.uploadPath,
  ]);

  const paths = new Set();

  rawPaths.forEach((candidate) => {
    const raw = String(candidate || "").trim();
    if (!raw) return;

    const fromUrl = extractObjectPathFromUrl(raw);
    const baseCandidates = unique([raw, stripLeadingSlash(raw), fromUrl]);

    baseCandidates.forEach((value) => {
      const normalized = String(value || "").trim();
      if (!normalized) return;
      paths.add(normalized);

      buckets.forEach((bucket) => {
        const prefix = `${bucket}/`;
        if (normalized.startsWith(prefix)) {
          paths.add(normalized.slice(prefix.length));
        }
      });
    });
  });

  return {
    buckets,
    paths: unique(Array.from(paths)),
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
    const token = getAccessTokenFromRequest(req);

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

    const supabase = createAuthorizedSupabaseClient(token);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const datasetCacheKey = getDatasetCacheKey(user.id, datasetId);
    const { value: dataset, cacheStatus: datasetCacheStatus } =
      await getOrSetCachedJson({
        key: datasetCacheKey,
        ttlSeconds: CACHE_TTL_SECONDS.dataset,
        loader: async () => {
          const { data, error } = await supabase
            .from("datasets")
            .select(
              "id, user_id, file_name, file_size, file_type, storage_bucket, storage_path, metadata, created_at, uploaded_at",
            )
            .eq("id", datasetId)
            .eq("user_id", user.id)
            .single();

          if (error) {
            const normalizedMessage = String(error.message || "").toLowerCase();
            const isNotFoundError =
              error.code === "PGRST116" ||
              normalizedMessage.includes("no rows");

            if (isNotFoundError) {
              return null;
            }

            throw new Error(
              error.message || "Unable to fetch dataset metadata",
            );
          }

          return data || null;
        },
      });

    if (!dataset) {
      await invalidateUserDatasetCaches({
        userId: user.id,
        datasetIds: [datasetId],
      }).catch(() => undefined);

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

    const { supabaseURL } = getEnvVar();
    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;
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
      skipAi: true,
    });

    const persistedProcessedCharts = dataset?.metadata?.processedCharts;
    const preparedCharts = Array.isArray(persistedProcessedCharts?.charts)
      ? {
          charts: persistedProcessedCharts.charts,
          skipped: Number(persistedProcessedCharts.skipped || 0),
        }
      : buildPreparedCharts(
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

    const safeBaseName = String(dataset.file_name || "dataset")
      .replace(/\.[^/.]+$/, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_");

    // Export log insert is best-effort so export response is not blocked
    await supabase
      .from("dataset_exports")
      .insert({
        dataset_id: dataset.id,
        user_id: user.id,
        format: normalizedFormat,
        file_name: `${safeBaseName}.${exportFile.extension}`,
        file_size: exportFile.buffer.length,
        storage_bucket: null,
        storage_path: null,
      })
      .then(() => undefined)
      .catch(() => undefined);

    return new NextResponse(exportFile.buffer, {
      status: 200,
      headers: {
        "Content-Type": exportFile.contentType,
        "Content-Disposition": `attachment; filename="${safeBaseName}.${exportFile.extension}"`,
        "Cache-Control": "no-store",
        "X-Redis-Dataset": datasetCacheStatus,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Something went wrong" },
      { status: 500 },
    );
  }
}
