"use client";
import React, { useState, useRef } from "react";

// Resumable uploader component
// - Uses 5MB chunks
// - Calls GET /api/upload/status?uploadId=... to skip already-uploaded chunks
// - Posts chunks to POST /api/upload with form fields: file, uploadId, chunkIndex, totalChunks
// - Retries each chunk up to 3 times with backoff
// - Hinglish comments added inline for clarity

export default function ResumableUploader({ onComplete } = {}) {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("idle");
  const inputRef = useRef(null);

  // Use smaller chunks to avoid server "Payload Too Large" (413)
  const CHUNK_SIZE = 1 * 1024 * 1024; // 1MB
  const CONCURRENCY = 3; // number of parallel chunk uploads (adjust as needed)

  function makeUploadId() {
    try {
      return crypto.randomUUID();
    } catch (e) {
      return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    }
  }

  async function getUploadedChunks(uploadId) {
    const res = await fetch(
      `/api/upload/status?uploadId=${encodeURIComponent(uploadId)}`,
      { credentials: "same-origin" },
    );
    if (!res.ok) return new Set();
    try {
      const json = await res.json();
      return new Set((json.uploadedChunks || []).map(Number));
    } catch (e) {
      return new Set();
    }
  }

  async function postChunk({
    chunkBlob,
    fileName,
    uploadId,
    chunkIndex,
    totalChunks,
  }) {
    const form = new FormData();
    form.append("file", chunkBlob, fileName);
    form.append("uploadId", uploadId);
    form.append("chunkIndex", String(chunkIndex));
    form.append("totalChunks", String(totalChunks));

    const maxRetries = 3;
    let attempt = 0;
    while (attempt < maxRetries) {
      try {
        const res = await fetch("/api/upload", {
          method: "POST",
          body: form,
          credentials: "same-origin",
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Upload chunk failed (${res.status}): ${text}`);
        }

        const json = await res.json();
        return json;
      } catch (err) {
        attempt += 1;
        const wait = 300 * Math.pow(2, attempt);
        // retry with exponential backoff
        await new Promise((r) => setTimeout(r, wait));
      }
    }

    throw new Error("Chunk upload failed after retries");
  }

  async function handleFile(file) {
    if (!file) return;
    setStatus("starting");

    const uploadId = makeUploadId();
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    // check which chunks already uploaded
    setStatus("checking");
    const uploadedSet = await getUploadedChunks(uploadId);

    let uploadedCount = uploadedSet.size;
    setProgress(Math.floor((uploadedCount / totalChunks) * 100));

    // Build list of chunk indices to upload
    const pending = [];
    for (let i = 0; i < totalChunks; i += 1) {
      if (!uploadedSet.has(i)) pending.push(i);
    }

    setStatus(
      `uploading ${pending.length} chunks (concurrency ${CONCURRENCY})`,
    );

    // Parallel uploader worker pool
    let pointer = 0;
    let inFlight = 0;
    let failed = false;

    await new Promise((resolve, reject) => {
      const schedule = () => {
        if (failed) return;
        if (pointer >= pending.length && inFlight === 0) return resolve();

        while (inFlight < CONCURRENCY && pointer < pending.length) {
          const idx = pending[pointer++];
          inFlight += 1;
          (async () => {
            const start = idx * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, file.size);
            const chunk = file.slice(start, end);
            setStatus(`uploading chunk ${idx + 1}/${totalChunks}`);
            try {
              const res = await postChunk({
                chunkBlob: chunk,
                fileName: file.name,
                uploadId,
                chunkIndex: idx,
                totalChunks,
              });
              uploadedCount += 1;
              setProgress(Math.floor((uploadedCount / totalChunks) * 100));

              // if this was the final chunk and server returned dataset info, call onComplete
              if (idx === totalChunks - 1 && res?.dataset) {
                setStatus("uploaded and queued");
                if (typeof onComplete === "function") onComplete(res);
              }
            } catch (err) {
              failed = true;
              setStatus("error");
              console.error("Chunk upload error:", err);
              return reject(err);
            } finally {
              inFlight -= 1;
              schedule();
            }
          })();
        }
      };

      schedule();
    });

    setStatus("done");
    setProgress(100);
  }

  function handleSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    handleFile(file).catch((err) => console.error(err));
  }

  return (
    <div className="resumable-uploader">
      <label className="block">
        <span className="text-sm">Upload dataset</span>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx"
          onChange={handleSelect}
          className="mt-2"
        />
      </label>

      <div className="mt-3">
        <div>Progress: {progress}%</div>
        <div>Status: {status}</div>
      </div>
    </div>
  );
}
