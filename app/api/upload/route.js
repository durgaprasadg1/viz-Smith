import { NextResponse } from "next/server";

import { getAuthorizedUserFromRequest } from "@/lib/api-route-auth";
import {
  ALLOWED_TYPES,
  MAX_FILE_SIZE,
  analyzeDatasetBuffer,
} from "@/lib/dataset-analysis";
import { parseDatasetBuffer } from "@/lib/dataset-analysis";
import { invalidateUserDatasetCaches } from "@/lib/redis-cache";
import { uploadQueue } from "@/lib/queue";

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

function buildStoragePath(userId, fileName) {
  const safeFileName = sanitizeFileName(fileName);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const random = Math.random().toString(36).slice(2, 10);
  return `${userId}/${timestamp}-${random}-${safeFileName}`;
}

export async function POST(req) {
  try {
    const { errorResponse, supabase, user } =
      await getAuthorizedUserFromRequest(req, {
        missingTokenMessage: "Please sign in before uploading a dataset.",
        invalidTokenMessage: "Unauthorized",
      });

    if (errorResponse) {
      return errorResponse;
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const uploadId = formData.get("uploadId");
    const chunkIndexRaw = formData.get("chunkIndex");
    const totalChunksRaw = formData.get("totalChunks");

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    // Helper: upload an individual chunk to Supabase storage under a temp folder
    async function uploadChunkToStorage(uploadIdValue, index, buf) {
      const chunkPath = `${user.id}/uploads/${String(uploadIdValue)}/chunks/${String(index).padStart(6, "0")}`;
      const { error: chunkErr } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(chunkPath, buf, {
          contentType: "application/octet-stream",
          upsert: true,
        });
      if (chunkErr) throw new Error(chunkErr.message || "Chunk upload failed");
      return chunkPath;
    }

    // Helper: assemble all chunks (0..totalChunks-1) into a single Buffer
    async function assembleChunksToBuffer(uploadIdValue, totalChunks) {
      const parts = [];
      for (let i = 0; i < totalChunks; i += 1) {
        const chunkPath = `${user.id}/uploads/${String(uploadIdValue)}/chunks/${String(i).padStart(6, "0")}`;
        const { data: chunkData, error: downloadErr } = await supabase.storage
          .from(STORAGE_BUCKET)
          .download(chunkPath);
        if (downloadErr || !chunkData) {
          throw new Error(`Missing chunk ${i}`);
        }

        // chunkData is a ReadableStream/Blob in some runtimes; convert to Buffer
        let buf;
        try {
          const arrayBuffer = await chunkData.arrayBuffer();
          buf = Buffer.from(arrayBuffer);
        } catch (e) {
          // node-fetch style
          buf = Buffer.from(await chunkData.arrayBuffer());
        }
        parts.push(buf);
      }
      return Buffer.concat(parts);
    }

    // Helper: remove chunk files
    async function removeChunkFiles(uploadIdValue, totalChunks) {
      const paths = [];
      for (let i = 0; i < totalChunks; i += 1) {
        paths.push(
          `${user.id}/uploads/${String(uploadIdValue)}/chunks/${String(i).padStart(6, "0")}`,
        );
      }
      try {
        await supabase.storage.from(STORAGE_BUCKET).remove(paths);
      } catch (e) {
        // ignore cleanup errors
      }
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

    // If this is a chunked upload, store the chunk and assemble when final chunk arrives.
    const isChunked = Boolean(
      uploadId && chunkIndexRaw !== null && chunkIndexRaw !== undefined,
    );

    let buffer = Buffer.from(await file.arrayBuffer());

    if (isChunked) {
      const chunkIndex = Number(chunkIndexRaw);
      const totalChunks = totalChunksRaw ? Number(totalChunksRaw) : null;
      if (Number.isNaN(chunkIndex) || chunkIndex < 0) {
        return NextResponse.json(
          { error: "Invalid chunkIndex" },
          { status: 400 },
        );
      }

      try {
        await uploadChunkToStorage(uploadId, chunkIndex, buffer);
      } catch (e) {
        return NextResponse.json(
          { error: e?.message || "Chunk upload failed" },
          { status: 500 },
        );
      }

      // If we know totalChunks and this is the last chunk, assemble and continue
      const isLast = totalChunks !== null && chunkIndex === totalChunks - 1;
      if (!isLast) {
        // return early acknowledging chunk upload
        return NextResponse.json(
          { success: true, chunkUploaded: true, index: chunkIndex },
          { status: 200 },
        );
      }

      // Assemble chunks into buffer for downstream processing
      try {
        buffer = await assembleChunksToBuffer(uploadId, totalChunks);
        // cleanup chunk files (best-effort)
        removeChunkFiles(uploadId, totalChunks).catch(() => undefined);
      } catch (e) {
        return NextResponse.json(
          { error: e?.message || "Chunk assembly failed" },
          { status: 500 },
        );
      }
      // For assembled uploads, set file.size to assembled size and proceed
      file.size = buffer.length;
    }

    // Light-weight parse to collect preview/sample rows and columns for UI feedback.
    let parsedSummary = null;
    try {
      parsedSummary = await parseDatasetBuffer({
        buffer,
        fileName: file.name,
        includeFullData: false,
      });
    } catch (err) {
      // parsing failed - still allow upload but mark dataset processing failed
      parsedSummary = null;
    }

    const rowCount = parsedSummary?.rowCount ?? null;
    const columnCount = parsedSummary?.columnCount ?? 0;
    const sheetName = parsedSummary?.sheetName ?? null;
    const columns = parsedSummary?.columns ?? [];
    const previewRows = parsedSummary?.previewRows ?? [];

    // Build storage path and upload original file now (before background processing)
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

    // Enqueue background job to assemble/process/convert. Do NOT assume a
    // dataset row exists here; worker will create or update the dataset row.
    try {
      await uploadQueue.add("process-upload", {   // Bhai Yaha se apn background jobs ke liye queue me daaal rhe hai 
        userId: user.id,
        storagePath,
        fileName: file.name,
        fileSize: file.size,
        uploadId: uploadId || null,
        totalChunks: totalChunksRaw ? Number(totalChunksRaw) : null,
      });
    } catch (qerr) {
      return NextResponse.json(
        { error: qerr?.message || "Unable to enqueue processing job" },
        { status: 500 },
      );
    }

    await invalidateUserDatasetCaches({ userId: user.id }).catch(
      () => undefined,
    );

    return NextResponse.json({
      success: true,
      dataset,
      rows: previewRows,
      message: "Upload saved and processing queued",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Something went wrong" },
      { status: 500 },
    );
  }
}
