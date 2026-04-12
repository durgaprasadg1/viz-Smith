import { NextResponse } from "next/server";

import { getAuthorizedUserFromRequest } from "@/lib/api-route-auth";
import { saveUploadChunk } from "@/lib/upload-optimization";

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
      return NextResponse.json({ error: "Missing session id" }, { status: 400 });
    }

    if (!chunk || typeof chunk?.arrayBuffer !== "function") {
      return NextResponse.json({ error: "Missing upload chunk" }, { status: 400 });
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
    return NextResponse.json(
      { error: error?.message || "Unable to upload chunk" },
      { status: 400 },
    );
  }
}
