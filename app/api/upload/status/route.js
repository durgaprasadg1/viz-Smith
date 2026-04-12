import { NextResponse } from "next/server";

import { getAuthorizedUserFromRequest } from "@/lib/api-route-auth";
import { getDatasetProcessingStatus } from "@/lib/upload-optimization";

const STORAGE_BUCKET = "user-uploads";

export const runtime = "nodejs";

export async function GET(req) {
  try {
    const { errorResponse, supabase, user } =
      await getAuthorizedUserFromRequest(req, {
        missingTokenMessage: "Please sign in before checking upload status.",
        invalidTokenMessage: "Unauthorized",
      });

    if (errorResponse) return errorResponse;

    const url = req.nextUrl || new URL(req.url);

    // Branch: uploaded chunk listing
    const uploadId = String(url.searchParams.get("uploadId") || "").trim();
    if (uploadId) {
      const prefix = `${user.id}/uploads/${uploadId}/chunks/`;

      const limit = 1000;
      let offset = 0;
      const found = [];

      while (true) {
        const { data, error } = await supabase.storage
          .from(STORAGE_BUCKET)
          .list(prefix, {
            limit,
            offset,
            sortBy: { column: "name", order: "asc" },
          });

        if (error) {
          return NextResponse.json(
            { error: error.message || "Storage list failed" },
            { status: 500 },
          );
        }

        if (!Array.isArray(data) || data.length === 0) break;

        for (const item of data) {
          const name = String(item.name || "");
          const idx = parseInt(name, 10);
          if (!Number.isNaN(idx)) found.push(idx);
        }

        if (data.length < limit) break;
        offset += data.length;
      }

      found.sort((a, b) => a - b);

      return NextResponse.json({
        uploadId,
        uploadedChunks: found,
        count: found.length,
      });
    }

    // Branch: dataset processing status
    const datasetId = String(url.searchParams.get("datasetId") || "").trim();
    if (datasetId) {
      const dataset = await getDatasetProcessingStatus({
        supabase,
        userId: user.id,
        datasetId,
      });

      const metadata =
        dataset.metadata && typeof dataset.metadata === "object"
          ? dataset.metadata
          : {};

      return NextResponse.json({
        success: true,
        status: dataset.status,
        dataset: {
          id: dataset.id,
          file_name: dataset.file_name,
          status: dataset.status,
          uploaded_at: dataset.uploaded_at,
          storage_bucket: dataset.storage_bucket,
          storage_path: dataset.storage_path,
          row_count: dataset.row_count,
          column_count: dataset.column_count,
        },
        relationships: Array.isArray(metadata.relationships)
          ? metadata.relationships
          : [],
        columns: Array.isArray(metadata.columns) ? metadata.columns : [],
        rowCount: Number.isFinite(Number(dataset.row_count))
          ? Number(dataset.row_count)
          : 0,
        columnCount: Number.isFinite(Number(dataset.column_count))
          ? Number(dataset.column_count)
          : 0,
        sheetName:
          typeof dataset.xlsx_sheet_name === "string" &&
          dataset.xlsx_sheet_name.trim()
            ? dataset.xlsx_sheet_name
            : null,
        rows: Array.isArray(metadata.previewRows) ? metadata.previewRows : [],
        processedCharts:
          metadata?.processedCharts &&
          typeof metadata.processedCharts === "object"
            ? metadata.processedCharts
            : { charts: [], skipped: 0 },
        ai:
          metadata?.ai && typeof metadata.ai === "object"
            ? metadata.ai
            : { provider: null, model: null, error: null },
        error:
          typeof metadata?.processingError === "string"
            ? metadata.processingError
            : null,
      });
    }

    return NextResponse.json(
      { error: "Either uploadId or datasetId query parameter is required" },
      { status: 400 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Unable to load upload status" },
      { status: 500 },
    );
  }
}
