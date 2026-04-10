import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import {
  ALLOWED_TYPES,
  MAX_FILE_SIZE,
  analyzeDatasetBuffer,
} from "@/lib/dataset-analysis";
import { buildPreparedCharts } from "@/lib/chart-preparation";
import { invalidateUserDatasetCaches } from "@/lib/redis-cache";
import { getEnvVar } from "@/lib/supabase";

const SUPPORTED_EXTENSIONS = [".csv", ".xlsx"];
const STORAGE_BUCKET = "user-uploads";
const GENERIC_BINARY_TYPES = new Set([
  "application/octet-stream",
  "binary/octet-stream",
]);

export const runtime = "nodejs";

function hasSupportedExtension(fileName) {
  const lower = String(fileName || "").toLowerCase();
  return SUPPORTED_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

function sanitizeFileName(fileName) {
  const value = String(fileName || "").trim();
  if (!value) return "dataset.csv";
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function getExtension(fileName) {
  const lower = String(fileName || "").toLowerCase();
  if (lower.endsWith(".xlsx")) return "xlsx";
  return "csv";
}

function getFileContentType(fileName, explicitType) {
  if (explicitType && ALLOWED_TYPES.includes(explicitType)) return explicitType;
  return getExtension(fileName) === "xlsx"
    ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    : "text/csv";
}

function hasSupportedMimeType(fileType) {
  if (!fileType) return true;
  if (ALLOWED_TYPES.includes(fileType)) return true;
  return GENERIC_BINARY_TYPES.has(fileType);
}

function getAccessTokenFromRequest(req) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  return authHeader.slice("Bearer ".length).trim() || null;
}

function buildStoragePath(userId, fileName) {
  const safeFileName = sanitizeFileName(fileName);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const random = Math.random().toString(36).slice(2, 10);
  return `${userId}/${timestamp}-${random}-${safeFileName}`;
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

export async function POST(req) {
  try {
    const token = getAccessTokenFromRequest(req);

    if (!token) {
      return NextResponse.json(
        { error: "Please sign in before uploading a dataset." },
        { status: 401 },
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

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    if (!hasSupportedExtension(file.name)) {
      return NextResponse.json(
        { error: "Unsupported file extension" },
        { status: 400 },
      );
    }

    if (!hasSupportedMimeType(file.type)) {
      return NextResponse.json(
        { error: "Only CSV and XLSX files are allowed" },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File size must be less than 50MB" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    let analysis;
    try {
      analysis = await analyzeDatasetBuffer({
        buffer,
        fileName: file.name,
        fileSize: file.size,
      });
    } catch (analysisError) {
      return NextResponse.json(
        { error: analysisError?.message || "Unable to parse dataset" },
        { status: 400 },
      );
    }

    const {
      rowCount,
      columnCount,
      sheetName,
      columns,
      columnProfiles,
      relationships,
      previewRows,
      aiResult,
    } = analysis;

    if (!columnCount) {
      return NextResponse.json(
        {
          error:
            "No valid columns found for analysis. Please check your file headers.",
        },
        { status: 400 },
      );
    }

    const processedCharts = buildPreparedCharts(
      relationships,
      previewRows,
      columns,
    );

    const storagePath = buildStoragePath(user.id, file.name);
    const contentType = getFileContentType(file.name, file.type);

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, buffer, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json(
        { error: uploadError.message || "Unable to store uploaded file" },
        { status: 500 },
      );
    }

    const insertPayload = {
      user_id: user.id,
      file_name: sanitizeFileName(file.name),
      storage_bucket: STORAGE_BUCKET,
      storage_path: storagePath,
      file_type: contentType,
      file_size: file.size,
      row_count: rowCount,
      column_count: columnCount,
      xlsx_sheet_name: sheetName,
      status: "ready",
      metadata: {
        columns,
        columnProfiles,
        relationships,
        processedCharts,
        ai: {
          provider: aiResult?.provider || null,
          model: aiResult?.model || null,
          error: aiResult?.error || null,
        },
      },
    };

    const { data: dataset, error: insertError } = await supabase
      .from("datasets")
      .insert(insertPayload)
      .select(
        "id, file_name, status, uploaded_at, storage_bucket, storage_path, row_count, column_count",
      )
      .single();

    if (insertError) {
      await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
      return NextResponse.json(
        { error: insertError.message || "Unable to save dataset metadata" },
        { status: 500 },
      );
    }

    await invalidateUserDatasetCaches({ userId: user.id }).catch(
      () => undefined,
    );

    return NextResponse.json({
      success: true,
      relationships,
      columns,
      rowCount,
      columnCount,
      sheetName,
      rows: previewRows,
      processedCharts,
      dataset,
      persistence: {
        saved: true,
        warning: null,
      },
      ai: {
        provider:
          aiResult?.provider || (process.env.GROK_API_KEY ? "grok" : null),
        model: aiResult?.model || process.env.GROK_MODEL || null,
        error: aiResult?.error || null,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Something went wrong" },
      { status: 500 },
    );
  }
}
