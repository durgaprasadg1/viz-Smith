import createSupabaseClient from "@/lib/supabase";
import {
  convertRowsToArrowStreamBuffer,
  convertRowsToArrowBuffer,
} from "@/lib/arrow-conversion";
import {
  streamDatasetRows,
  parseDatasetBuffer,
  analyzeDatasetBuffer,
} from "@/lib/dataset-analysis";
import { Worker } from "bullmq";
import { getEnvVar } from "@/lib/supabase";

// Worker that processes uploaded files. It runs in a separate process (node)
// and performs heavy work: assembling chunks (if present), analysis, arrow conversion,
// and updates dataset metadata in Supabase.

const QUEUE_NAME = "upload-processing";

function getRedisOptions() {
  const redisUrl = process.env.REDIS_URL || null;
  if (redisUrl) return { connection: redisUrl };

  const host = process.env.REDIS_HOST || "127.0.0.1";
  const port = Number(process.env.REDIS_PORT || 6379);
  const password = process.env.REDIS_PASSWORD || undefined;
  return { connection: { host, port, password } };
}

async function assembleChunksToBuffer(supabase, userId, uploadId, totalChunks) {
  const parts = [];
  for (let i = 0; i < totalChunks; i += 1) {
    const chunkPath = `${userId}/uploads/${String(uploadId)}/chunks/${String(i).padStart(6, "0")}`;
    const { data: chunkData, error: downloadErr } = await supabase.storage
      .from("user-uploads")
      .download(chunkPath);
    if (downloadErr || !chunkData) {
      throw new Error(`Missing chunk ${i}`);
    }
    const arrayBuffer = await chunkData.arrayBuffer();
    parts.push(Buffer.from(arrayBuffer));
  }
  return Buffer.concat(parts);
}

export function startWorker() {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const supabase = createSupabaseClient();
      const {
        userId,
        storagePath,
        fileName,
        fileSize,
        uploadId,
        totalChunks,
        datasetId,
      } = job.data;

      try {
        let buffer = null;

        // If job includes uploadId and totalChunks, assemble
        if (uploadId && totalChunks) {
          buffer = await assembleChunksToBuffer(
            supabase,
            userId,
            uploadId,
            totalChunks,
          );
          // Optionally cleanup chunks
          const paths = [];
          for (let i = 0; i < totalChunks; i += 1) {
            paths.push(
              `${userId}/uploads/${String(uploadId)}/chunks/${String(i).padStart(6, "0")}`,
            );
          }
          await supabase.storage
            .from("user-uploads")
            .remove(paths)
            .catch(() => undefined);

          // upload assembled file to main storage path
          const { error: assembledUploadErr } = await supabase.storage
            .from("user-uploads")
            .upload(storagePath, buffer, {
              contentType: fileName.toLowerCase().endsWith(".xlsx")
                ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                : "text/csv",
              upsert: true,
            });
          if (assembledUploadErr) {
            throw new Error(
              assembledUploadErr.message || "Failed to upload assembled file",
            );
          }
        } else {
          // download existing file from storage
          const { data: fileData, error: downloadErr } = await supabase.storage
            .from("user-uploads")
            .download(storagePath);
          if (downloadErr || !fileData)
            throw new Error("Failed to download file for processing");
          const arrayBuffer = await fileData.arrayBuffer();
          buffer = Buffer.from(arrayBuffer);
        }

        // Run analysis (uses streaming and sampling internally)
        const analysis = await analyzeDatasetBuffer({
          buffer,
          fileName,
          fileSize: buffer.length,
          includeFullData: false,
        });

        // Convert to Arrow using streaming iterator
        const rowsIter = streamDatasetRows({ buffer, fileName });
        let arrowBuf = null;
        try {
          arrowBuf = await convertRowsToArrowStreamBuffer(
            rowsIter,
            analysis.columns,
            5000,
          );
        } catch (e) {
          // fallback to in-memory conversion
          const fullParsed = await parseDatasetBuffer({
            buffer,
            fileName,
            includeFullData: true,
          });
          arrowBuf = convertRowsToArrowBuffer(
            fullParsed.columns,
            fullParsed.data,
          );
        }

        // upload arrow
        const arrowPath = `${storagePath}.arrow`;
        const { error: arrowUploadErr } = await supabase.storage
          .from("user-uploads")
          .upload(arrowPath, arrowBuf, {
            contentType: "application/vnd.apache.arrow.stream",
            upsert: true,
          });
        const finalColumnar = arrowUploadErr ? null : arrowPath;

        // Prepare processedCharts
        // We can't import buildPreparedCharts here due to worker context unknown; instead store relationships and let frontend build charts, or import if available.
        const metadata = {
          ...analysis,
          columnar: finalColumnar,
        };

        // Update dataset row in DB
        const updates = {
          metadata,
          status: "ready",
        };

        if (datasetId) {
          await supabase.from("datasets").update(updates).eq("id", datasetId);
        } else {
          // No dataset row existed; insert one
          await supabase.from("datasets").insert({
            user_id: userId,
            file_name: fileName,
            storage_bucket: "user-uploads",
            storage_path: storagePath,
            file_type: fileName.toLowerCase().endsWith(".xlsx")
              ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              : "text/csv",
            file_size: buffer.length,
            row_count: analysis.rowCount,
            column_count: analysis.columnCount,
            status: "ready",
            metadata,
          });
        }

        return { success: true };
      } catch (err) {
        // update dataset status to failed if datasetId provided
        try {
          if (datasetId)
            await supabase
              .from("datasets")
              .update({
                status: "failed",
                "metadata->ai": { error: err.message },
              })
              .eq("id", datasetId);
        } catch (e) {
          // ignore
        }
        throw err;
      }
    },
    getRedisOptions(),
  );

  worker.on("completed", (job) => {
    console.log(`Upload job ${job.id} completed`);
  });
  worker.on("failed", (job, err) => {
    console.error(`Upload job ${job.id} failed:`, err);
  });

  return worker;
}

// If this file is run directly, start the worker
if (require.main === module) {
  startWorker();
}
