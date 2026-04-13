import { NextResponse } from "next/server";

import { getAuthorizedUserFromRequest } from "@/lib/api-route-auth";
import { classifyUploadError } from "@/lib/upload-errors";
import { CHUNK_SIZE_BYTES, saveUploadChunk } from "@/lib/upload-optimization";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const { errorResponse, user } = await getAuthorizedUserFromRequest(req, {
      missingTokenMessage: "Please sign in before uploading a dataset.",
      invalidTokenMessage: "Unauthorized",
    });

    if (errorResponse) {
      return errorResponse;
    }

    const formData = await req.formData();
    const sessionId = String(formData.get("sessionId") || "").trim();
    const chunkIndex = Number(formData.get("chunkIndex"));
    const totalChunks = Number(formData.get("totalChunks"));
    const chunk = formData.get("chunk");

    if (!sessionId) {
      return NextResponse.json(
        {
          error: "Missing session id",
          code: "UPLOAD_SESSION_ID_REQUIRED",
        },
        { status: 400 },
      );
    }

    if (
      !Number.isInteger(chunkIndex) ||
      !Number.isInteger(totalChunks) ||
      chunkIndex < 0 ||
      totalChunks <= 0 ||
      chunkIndex >= totalChunks
    ) {
      return NextResponse.json(
        {
          error: "Invalid chunk metadata",
          code: "UPLOAD_INVALID_CHUNK_DATA",
        },
        { status: 400 },
      );
    }

    if (!chunk || typeof chunk?.arrayBuffer !== "function") {
      return NextResponse.json(
        {
          error: "Missing upload chunk",
          code: "UPLOAD_CHUNK_REQUIRED",
        },
        { status: 400 },
      );
    }

    if (Number(chunk.size || 0) > CHUNK_SIZE_BYTES) {
      return NextResponse.json(
        {
          error: "Chunk size exceeds server limit",
          code: "UPLOAD_CHUNK_TOO_LARGE",
        },
        { status: 413 },
      );
    }

    const chunkBuffer = Buffer.from(await chunk.arrayBuffer());

    const result = await saveUploadChunk({
      userId: user.id,
      sessionId,
      chunkIndex,
      totalChunks,
      chunkBuffer,
    });

    return NextResponse.json({
      success: true,
      stored: result.stored,
      chunkIndex,
    });
  } catch (error) {
    const normalizedError = classifyUploadError(error, {
      defaultStatus: 500,
      defaultCode: "UPLOAD_CHUNK_FAILED",
      defaultMessage: "Unable to upload chunk right now. Please retry.",
    });

    if (normalizedError.status >= 500) {
      console.error("[upload/chunk]", normalizedError.code, {
        message: normalizedError.debugMessage,
      });
    }

    return NextResponse.json(
      {
        error: normalizedError.message,
        code: normalizedError.code,
      },
      { status: normalizedError.status },
    );
  }
}
