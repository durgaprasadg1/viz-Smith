import { NextResponse } from "next/server";

import { getAuthorizedUserFromRequest } from "@/lib/api-route-auth";
import { classifyUploadError } from "@/lib/upload-errors";
import {
  CHUNK_SIZE_BYTES,
  createOrResumeUploadSession,
  getFileKey,
} from "@/lib/upload-optimization";

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

    const body = await req.json();
    const fileName = String(body?.fileName || "");
    const fileType = String(body?.fileType || "");
    const fileSize = Number(body?.fileSize || 0);
    const totalChunks = Number(body?.totalChunks || 0);
    const lastModified = Number(body?.lastModified || 0);
    const chunkSize = Number(body?.chunkSize || CHUNK_SIZE_BYTES);

    const clientFileKey =
      typeof body?.fileKey === "string" && body.fileKey.trim()
        ? body.fileKey.trim()
        : null;

    const fileKey =
      clientFileKey ||
      getFileKey({
        fileName,
        fileSize,
        lastModified,
      });

    const { session, uploadedChunkIndexes } = await createOrResumeUploadSession(
      {
        userId: user.id,
        fileName,
        fileSize,
        fileType,
        totalChunks,
        chunkSize,
        fileKey,
        existingSessionId:
          typeof body?.sessionId === "string" ? body.sessionId : null,
      },
    );

    return NextResponse.json({
      success: true,
      sessionId: session.sessionId,
      fileKey,
      totalChunks: session.totalChunks,
      chunkSize: session.chunkSize,
      uploadedChunkIndexes,
    });
  } catch (error) {
    const normalizedError = classifyUploadError(error, {
      defaultStatus: 500,
      defaultCode: "UPLOAD_INIT_FAILED",
      defaultMessage:
        "Unable to initialize upload session right now. Please try again.",
    });

    if (normalizedError.status >= 500) {
      console.error("[upload/init]", normalizedError.code, {
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
