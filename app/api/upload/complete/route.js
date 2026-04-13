import { after } from "next/server";
import { NextResponse } from "next/server";

import { getAuthorizedUserFromRequest } from "@/lib/api-route-auth";
import { classifyUploadError } from "@/lib/upload-errors";
import {
  createProcessingDataset,
  finalizeUploadSession,
  processCompletedUpload,
} from "@/lib/upload-optimization";

export const runtime = "nodejs";

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

    const body = await req.json();
    const sessionId = String(body?.sessionId || "").trim();

    if (!sessionId) {
      return NextResponse.json(
        {
          error: "Missing session id",
          code: "UPLOAD_SESSION_ID_REQUIRED",
        },
        { status: 400 },
      );
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
        console.error(
          "Background upload processing failed:",
          error?.message || error,
        );
      }
    });

    return NextResponse.json({
      success: true,
      dataset,
      processing: true,
    });
  } catch (error) {
    const normalizedError = classifyUploadError(error, {
      defaultStatus: 500,
      defaultCode: "UPLOAD_COMPLETE_FAILED",
      defaultMessage: "Unable to finalize upload right now. Please retry.",
    });

    if (normalizedError.status >= 500) {
      console.error("[upload/complete]", normalizedError.code, {
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
