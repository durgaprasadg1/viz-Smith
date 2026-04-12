import { after } from "next/server";
import { NextResponse } from "next/server";

import { getAuthorizedUserFromRequest } from "@/lib/api-route-auth";
import {
  createProcessingDataset,
  finalizeUploadSession,
  processCompletedUpload,
} from "@/lib/upload-optimization";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const { errorResponse, supabase, user } = await getAuthorizedUserFromRequest(
      req,
      {
        missingTokenMessage: "Please sign in before uploading a dataset.",
        invalidTokenMessage: "Unauthorized",
      },
    );

    if (errorResponse) {
      return errorResponse;
    }

    const body = await req.json();
    const sessionId = String(body?.sessionId || "").trim();

    if (!sessionId) {
      return NextResponse.json({ error: "Missing session id" }, { status: 400 });
    }

    const session = await finalizeUploadSession({
      userId: user.id,
      sessionId,
    });

    const dataset = await createProcessingDataset({
      supabase,
      userId: user.id,
      session,
    });

    after(async () => {
      try {
        await processCompletedUpload({
          supabase,
          userId: user.id,
          datasetId: dataset.id,
          sessionId: session.sessionId,
        });
      } catch (error) {
        console.error("Background upload processing failed:", error?.message || error);
      }
    });

    return NextResponse.json({
      success: true,
      dataset,
      processing: true,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Unable to finalize upload" },
      { status: 400 },
    );
  }
}
