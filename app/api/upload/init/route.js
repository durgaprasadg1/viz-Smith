import { NextResponse } from "next/server";

import { getAuthorizedUserFromRequest } from "@/lib/api-route-auth";
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

    const fileKey = clientFileKey ||
      getFileKey({
        fileName,
        fileSize,
        lastModified,
      });

    const { session, uploadedChunkIndexes } = await createOrResumeUploadSession({
      userId: user.id,
      fileName,
      fileSize,
      fileType,
      totalChunks,
      chunkSize,
      fileKey,
      existingSessionId:
        typeof body?.sessionId === "string" ? body.sessionId : null,
    });

    return NextResponse.json({
      success: true,
      sessionId: session.sessionId,
      fileKey,
      totalChunks: session.totalChunks,
      chunkSize: session.chunkSize,
      uploadedChunkIndexes,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Unable to initialize upload session" },
      { status: 400 },
    );
  }
}
