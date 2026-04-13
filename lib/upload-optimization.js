import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

import { buildPreparedCharts } from "@/lib/chart-preparation";
import {
  ALLOWED_TYPES,
  MAX_FILE_SIZE,
  analyzeDatasetBuffer,
} from "@/lib/dataset-analysis";
import { invalidateUserDatasetCaches } from "@/lib/redis-cache";

const STORAGE_BUCKET = "user-uploads";

const SUPPORTED_EXTENSIONS = [".csv", ".xlsx", ".csv.gz"];
const GENERIC_BINARY_TYPES = new Set([
  "application/octet-stream",
  "binary/octet-stream",
]);
const GZIP_TYPES = new Set([
  "application/gzip",
  "application/x-gzip",
  "application/gzip-compressed",
]);

export const CHUNK_SIZE_BYTES = 5 * 1024 * 1024;
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;
const UPLOAD_SESSIONS_ROOT =
  process.env.UPLOAD_SESSIONS_ROOT?.trim() ||
  path.join(os.tmpdir(), "vizsmith-upload-sessions");

function nowIso() {
  return new Date().toISOString();
}

function hashText(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

export function hasSupportedExtension(fileName) {
  const lower = String(fileName || "").toLowerCase();
  return SUPPORTED_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

export function sanitizeFileName(fileName) {
  const value = String(fileName || "").trim();
  if (!value) return "dataset.csv";
  return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export function getExtension(fileName) {
  const lower = String(fileName || "").toLowerCase();
  if (lower.endsWith(".csv.gz")) return "csv.gz";
  if (lower.endsWith(".xlsx")) return "xlsx";
  return "csv";
}

export function hasSupportedMimeType(fileType, fileName) {
  if (!fileType) return true;
  if (ALLOWED_TYPES.includes(fileType)) return true;
  if (GENERIC_BINARY_TYPES.has(fileType)) return true;

  const extension = getExtension(fileName);
  if (extension === "csv.gz") {
    return GZIP_TYPES.has(fileType);
  }

  return false;
}

export function getFileContentType(fileName, explicitType) {
  const extension = getExtension(fileName);

  if (extension === "csv.gz") {
    if (explicitType && GZIP_TYPES.has(explicitType)) return explicitType;
    return "application/gzip";
  }

  if (explicitType && ALLOWED_TYPES.includes(explicitType)) return explicitType;

  return extension === "xlsx"
    ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    : "text/csv";
}

export function getFileKey({ fileName, fileSize, lastModified }) {
  return hashText(
    `${sanitizeFileName(fileName)}:${fileSize}:${lastModified || 0}`,
  );
}

function buildStoragePath(userId, fileName) {
  const safeFileName = sanitizeFileName(fileName);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const random = Math.random().toString(36).slice(2, 10);
  return `${userId}/${timestamp}-${random}-${safeFileName}`;
}

function getUserRoot(userId) {
  return path.join(UPLOAD_SESSIONS_ROOT, String(userId));
}

function getSessionRoot(userId, sessionId) {
  return path.join(getUserRoot(userId), "sessions", sessionId);
}

function getSessionMetaPath(userId, sessionId) {
  return path.join(getSessionRoot(userId, sessionId), "session.json");
}

function getSessionChunksPath(userId, sessionId) {
  return path.join(getSessionRoot(userId, sessionId), "chunks");
}

function getSessionIndexPath(userId, fileKey) {
  const safeKey = String(fileKey || "").replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(getUserRoot(userId), "indexes", `${safeKey}.json`);
}

async function ensureSessionDirs(userId, sessionId) {
  await fs.mkdir(getSessionChunksPath(userId, sessionId), { recursive: true });
  await fs.mkdir(path.dirname(getSessionIndexPath(userId, "_")), {
    recursive: true,
  });
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf-8");
  return JSON.parse(raw);
}

async function writeJson(filePath, payload) {
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(payload, null, 2), "utf-8");
  await fs.rename(tempPath, filePath);
}

async function readSession(userId, sessionId) {
  const metaPath = getSessionMetaPath(userId, sessionId);
  if (!(await fileExists(metaPath))) return null;
  return readJson(metaPath);
}

async function writeSession(userId, sessionId, payload) {
  const metaPath = getSessionMetaPath(userId, sessionId);
  await writeJson(metaPath, payload);
}

async function getUploadedChunkIndexes(userId, sessionId) {
  const chunksPath = getSessionChunksPath(userId, sessionId);

  if (!(await fileExists(chunksPath))) {
    return [];
  }

  const files = await fs.readdir(chunksPath, { withFileTypes: true });

  return files
    .filter((entry) => entry.isFile() && /^\d+\.part$/.test(entry.name))
    .map((entry) => Number.parseInt(entry.name.replace(/\.part$/, ""), 10))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
}

async function loadIndexedSessionId(userId, fileKey) {
  const indexPath = getSessionIndexPath(userId, fileKey);
  if (!(await fileExists(indexPath))) return null;

  try {
    const data = await readJson(indexPath);
    return typeof data?.sessionId === "string" ? data.sessionId : null;
  } catch {
    return null;
  }
}

async function writeSessionIndex(userId, fileKey, sessionId) {
  const indexPath = getSessionIndexPath(userId, fileKey);
  await writeJson(indexPath, {
    fileKey,
    sessionId,
    updatedAt: nowIso(),
  });
}

function validateSessionFreshness(session) {
  const expiresAt = new Date(session?.expiresAt || 0).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

function validateChunkCount(fileSize, totalChunks, chunkSize) {
  const expected = Math.max(1, Math.ceil(fileSize / chunkSize));
  return expected === totalChunks;
}

export async function createOrResumeUploadSession({
  userId,
  fileName,
  fileSize,
  fileType,
  totalChunks,
  chunkSize = CHUNK_SIZE_BYTES,
  fileKey,
  existingSessionId,
}) {
  if (!hasSupportedExtension(fileName)) {
    throw new Error("Unsupported file extension");
  }

  if (!hasSupportedMimeType(fileType, fileName)) {
    throw new Error("Only CSV, CSV.GZ and XLSX files are allowed");
  }

  if (fileSize > MAX_FILE_SIZE) {
    throw new Error("File size must be less than 50MB");
  }

  if (!Number.isFinite(totalChunks) || totalChunks <= 0) {
    throw new Error("Invalid total chunks");
  }

  if (!validateChunkCount(fileSize, totalChunks, chunkSize)) {
    throw new Error("Chunk count mismatch");
  }

  let sessionId =
    typeof existingSessionId === "string" ? existingSessionId : null;
  let session = null;

  if (sessionId) {
    session = await readSession(userId, sessionId);
    if (
      !session ||
      session.fileKey !== fileKey ||
      session.fileSize !== fileSize ||
      session.fileName !== sanitizeFileName(fileName)
    ) {
      session = null;
      sessionId = null;
    }
  }

  if (!session) {
    const indexedSessionId = await loadIndexedSessionId(userId, fileKey);
    if (indexedSessionId) {
      const indexedSession = await readSession(userId, indexedSessionId);
      if (indexedSession && validateSessionFreshness(indexedSession)) {
        session = indexedSession;
        sessionId = indexedSessionId;
      }
    }
  }

  if (!session) {
    sessionId = crypto.randomUUID();
    session = {
      sessionId,
      userId,
      fileKey,
      fileName: sanitizeFileName(fileName),
      fileSize,
      fileType,
      totalChunks,
      chunkSize,
      status: "uploading",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    };

    await ensureSessionDirs(userId, sessionId);
    await writeSession(userId, sessionId, session);
    await writeSessionIndex(userId, fileKey, sessionId);
  }

  const uploadedChunkIndexes = await getUploadedChunkIndexes(userId, sessionId);

  return {
    session,
    uploadedChunkIndexes,
  };
}

export async function saveUploadChunk({
  userId,
  sessionId,
  chunkIndex,
  totalChunks,
  chunkBuffer,
}) {
  const session = await readSession(userId, sessionId);

  if (!session) {
    throw new Error("Upload session not found");
  }

  if (!validateSessionFreshness(session)) {
    throw new Error("Upload session expired. Please restart upload.");
  }

  if (session.status !== "uploading") {
    throw new Error("Upload session is not accepting chunks");
  }

  if (session.totalChunks !== totalChunks) {
    throw new Error("Chunk metadata mismatch");
  }

  if (
    !Number.isFinite(chunkIndex) ||
    chunkIndex < 0 ||
    chunkIndex >= totalChunks
  ) {
    throw new Error("Invalid chunk index");
  }

  await ensureSessionDirs(userId, sessionId);

  const chunksPath = getSessionChunksPath(userId, sessionId);
  const chunkPath = path.join(chunksPath, `${chunkIndex}.part`);
  const tempChunkPath = `${chunkPath}.tmp`;

  if (await fileExists(chunkPath)) {
    return {
      stored: false,
      session,
    };
  }

  await fs.writeFile(tempChunkPath, chunkBuffer);
  await fs.rename(tempChunkPath, chunkPath);

  session.updatedAt = nowIso();
  await writeSession(userId, sessionId, session);

  return {
    stored: true,
    session,
  };
}

export async function finalizeUploadSession({ userId, sessionId }) {
  const session = await readSession(userId, sessionId);
  if (!session) {
    throw new Error("Upload session not found");
  }

  if (!validateSessionFreshness(session)) {
    throw new Error("Upload session expired. Please restart upload.");
  }

  const uploadedChunkIndexes = await getUploadedChunkIndexes(userId, sessionId);
  if (uploadedChunkIndexes.length !== session.totalChunks) {
    throw new Error("Upload is incomplete. Missing chunk(s).");
  }

  session.status = "uploaded";
  session.updatedAt = nowIso();
  await writeSession(userId, sessionId, session);

  return session;
}

async function readUploadedFileBuffer(session) {
  const chunksPath = getSessionChunksPath(session.userId, session.sessionId);
  const buffers = [];
  let totalLength = 0;

  for (let index = 0; index < session.totalChunks; index += 1) {
    const chunkPath = path.join(chunksPath, `${index}.part`);
    const chunk = await fs.readFile(chunkPath);
    buffers.push(chunk);
    totalLength += chunk.length;
  }

  return Buffer.concat(buffers, totalLength);
}

function getAnalysisInputBuffer(fileName, inputBuffer) {
  const extension = getExtension(fileName);
  if (extension !== "csv.gz") {
    return {
      analysisBuffer: inputBuffer,
      analysisFileName: fileName,
    };
  }

  const unzipped = zlib.gunzipSync(inputBuffer);
  const analysisFileName = String(fileName).replace(/\.gz$/i, "");

  return {
    analysisBuffer: unzipped,
    analysisFileName,
  };
}

async function cleanupSessionArtifacts(session) {
  const sessionRoot = getSessionRoot(session.userId, session.sessionId);
  await fs.rm(sessionRoot, { recursive: true, force: true });
}

function buildPendingStoragePath(userId, sessionId) {
  return `pending/${userId}/${sessionId}`;
}

export async function createProcessingDataset({ supabase, userId, session }) {
  const { data, error } = await supabase
    .from("datasets")
    .insert({
      user_id: userId,
      file_name: sanitizeFileName(session.fileName),
      storage_bucket: STORAGE_BUCKET,
      storage_path: buildPendingStoragePath(userId, session.sessionId),
      file_type: getFileContentType(session.fileName, session.fileType),
      file_size: session.fileSize,
      status: "processing",
      metadata: {
        upload: {
          sessionId: session.sessionId,
          totalChunks: session.totalChunks,
          chunkSize: session.chunkSize,
        },
      },
    })
    .select(
      "id, file_name, status, uploaded_at, storage_bucket, storage_path, row_count, column_count",
    )
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Unable to create processing dataset");
  }

  return data;
}

export async function processCompletedUpload({
  supabase,
  userId,
  datasetId,
  sessionId,
}) {
  const session = await readSession(userId, sessionId);

  if (!session) {
    throw new Error("Upload session is not available for processing");
  }

  try {
    const uploadedBuffer = await readUploadedFileBuffer(session);

    const { analysisBuffer, analysisFileName } = getAnalysisInputBuffer(
      session.fileName,
      uploadedBuffer,
    );

    const analysis = await analyzeDatasetBuffer({
      buffer: analysisBuffer,
      fileName: analysisFileName,
      fileSize: analysisBuffer.length,
    });

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

    const processedCharts = buildPreparedCharts(
      relationships,
      previewRows,
      columns,
    );

    const storagePath = buildStoragePath(userId, session.fileName);
    const contentType = getFileContentType(session.fileName, session.fileType);

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, uploadedBuffer, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      throw new Error(uploadError.message || "Unable to store uploaded file");
    }

    const { error: updateError } = await supabase
      .from("datasets")
      .update({
        file_type: contentType,
        file_size: session.fileSize,
        storage_bucket: STORAGE_BUCKET,
        storage_path: storagePath,
        row_count: rowCount,
        column_count: columnCount,
        xlsx_sheet_name: sheetName,
        status: "ready",
        metadata: {
          columns,
          columnProfiles,
          relationships,
          previewRows,
          processedCharts,
          ai: {
            provider: aiResult?.provider || null,
            model: aiResult?.model || null,
            error: aiResult?.error || null,
          },
          upload: {
            sessionId: session.sessionId,
            processedAt: nowIso(),
          },
        },
      })
      .eq("id", datasetId)
      .eq("user_id", userId);

    if (updateError) {
      await supabase.storage.from(STORAGE_BUCKET).remove([storagePath]);
      throw new Error(updateError.message || "Unable to update dataset status");
    }

    await invalidateUserDatasetCaches({ userId }).catch(() => undefined);

    session.status = "processed";
    session.updatedAt = nowIso();
    await writeSession(userId, session.sessionId, session);

    await cleanupSessionArtifacts(session);

    return {
      success: true,
      datasetId,
    };
  } catch (error) {
    await supabase
      .from("datasets")
      .update({
        status: "failed",
        metadata: {
          upload: {
            sessionId,
            failedAt: nowIso(),
          },
          processingError: error?.message || "Dataset processing failed",
        },
      })
      .eq("id", datasetId)
      .eq("user_id", userId);

    await invalidateUserDatasetCaches({ userId }).catch(() => undefined);

    throw error;
  }
}

export async function getDatasetProcessingStatus({
  supabase,
  userId,
  datasetId,
}) {
  const { data, error } = await supabase
    .from("datasets")
    .select(
      "id, file_name, status, uploaded_at, storage_bucket, storage_path, row_count, column_count, xlsx_sheet_name, metadata",
    )
    .eq("id", datasetId)
    .eq("user_id", userId)
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Dataset not found");
  }

  return data;
}
