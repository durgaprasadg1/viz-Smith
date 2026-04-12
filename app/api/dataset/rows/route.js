import { NextResponse } from "next/server";
import { getAuthorizedUserFromRequest } from "@/lib/api-route-auth";
import { Table, RecordBatchReader } from "apache-arrow";

const STORAGE_BUCKET = "user-uploads";

export async function GET(req) {
  try {
    const { errorResponse, supabase, user } =
      await getAuthorizedUserFromRequest(req, {
        missingTokenMessage: "Please sign in to access datasets.",
        invalidTokenMessage: "Unauthorized",
      });
    if (errorResponse) return errorResponse;

    const url = new URL(req.url);
    const datasetId = url.searchParams.get("datasetId");
    if (!datasetId)
      return NextResponse.json({ error: "Missing datasetId" }, { status: 400 });

    const columnsParam = url.searchParams.get("columns");
    const limitParam = Number(url.searchParams.get("limit") || 250);
    const cursorParam = url.searchParams.get("cursor");
    const limit = Math.max(1, Math.min(1000, Number(limitParam || 250)));
    const cursor = cursorParam ? Number(cursorParam) : 0;

    const { data: datasetRows, error: fetchErr } = await supabase
      .from("datasets")
      .select("id, storage_bucket, storage_path, metadata")
      .eq("id", datasetId)
      .maybeSingle();

    if (fetchErr || !datasetRows)
      return NextResponse.json({ error: "Dataset not found" }, { status: 404 });

    const metadata = datasetRows.metadata || {};
    const columnarPath = metadata?.columnar || null;
    const requestedCols = Array.isArray(columnsParam && columnsParam.split)
      ? columnsParam
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean)
      : null;

    // Try to read Arrow columnar if available
    if (columnarPath) {
      try {
        const { data: fileData, error: downloadErr } = await supabase.storage
          .from(STORAGE_BUCKET)
          .download(columnarPath);
        if (!downloadErr && fileData) {
          const arrayBuffer = await fileData.arrayBuffer();
          const uint8 = new Uint8Array(arrayBuffer);

          // Create reader from buffer
          const reader = await RecordBatchReader.from(uint8);
          const table = await Table.from(reader);

          const total = table.length;
          const start = Number.isFinite(cursor) ? Math.max(0, cursor) : 0;
          const end = Math.min(total, start + limit);

          const rows = [];
          for (let i = start; i < end; i += 1) {
            const obj = {};
            const colNames =
              requestedCols && requestedCols.length
                ? requestedCols
                : table.schema.fields.map((f) => f.name);
            for (const col of colNames) {
              const colVector = table.getColumn(col);
              if (!colVector) {
                obj[col] = null;
                continue;
              }
              obj[col] = colVector.get(i);
            }
            rows.push(obj);
          }

          const nextCursor = end >= total ? null : end;
          return NextResponse.json({ rows, nextCursor, total });
        }
      } catch (e) {
        // fallback to CSV parsing below
        console.warn("Arrow read failed, falling back:", e?.message || e);
      }
    }

    // Fallback: stream CSV/XLSX and return requested columns with pagination
    // We'll download the raw file and parse front rows up to (cursor + limit)
    const { data: rawFile, error: rawErr } = await supabase.storage
      .from(STORAGE_BUCKET)
      .download(datasetRows.storage_path);
    if (rawErr || !rawFile)
      return NextResponse.json(
        { error: "Unable to access stored dataset" },
        { status: 500 },
      );

    const ab = await rawFile.arrayBuffer();
    const buffer = Buffer.from(ab);

    // Simple CSV parse for small slices — reuse existing parse logic if available
    // For now, we'll fall back to a full parse (but only return requested slice)
    // NOTE: This is not ideal for very large files; recommended: read Arrow.
    const { parse } = await import("csv-parse/sync");
    const records = parse(buffer.toString("utf-8"), {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
    });
    const total = records.length;
    const start = Number.isFinite(cursor) ? Math.max(0, cursor) : 0;
    const end = Math.min(total, start + limit);
    const slice = records.slice(start, end).map((row) => {
      if (!requestedCols || !requestedCols.length) return row;
      const out = {};
      for (const c of requestedCols) out[c] = row?.[c] ?? null;
      return out;
    });

    const nextCursor = end >= total ? null : end;
    return NextResponse.json({ rows: slice, nextCursor, total });
  } catch (err) {
    return NextResponse.json(
      { error: err?.message || "Something went wrong" },
      { status: 500 },
    );
  }
}
