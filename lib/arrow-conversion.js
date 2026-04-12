import { Table, RecordBatchWriter } from "apache-arrow";

// Batch-based Arrow writer: accepts an async iterator of rows and writes
// RecordBatches incrementally to an in-memory IPC stream. This avoids
// building the entire dataset as column arrays at once.
// NOTE (hinglish): Yeh streaming writer batch-wise kam karta hai, memory
// per-batch hi lagegi. Agar bahut bada dataset hai toh batchSize badhao.

function makeEmptyColumnArrays(columns) {
  const cols = {};
  for (const c of columns) cols[c] = [];
  return cols;
}

function buildTableFromBatch(columns, batchRows) {
  const colArrays = makeEmptyColumnArrays(columns);
  for (const row of batchRows) {
    for (const col of columns) {
      colArrays[col].push(row?.[col] ?? null);
    }
  }
  return Table.new(colArrays);
}

export async function convertRowsToArrowStreamBuffer(
  rowAsyncIterator,
  columns = [],
  batchSize = 5000,
) {
  if (!rowAsyncIterator || !Array.isArray(columns) || !columns.length) {
    throw new Error("Invalid inputs for streaming Arrow conversion");
  }

  // create an async generator that yields Tables per batch
  async function* tableBatches() {
    let batch = [];
    for await (const row of rowAsyncIterator) {
      batch.push(row);
      if (batch.length >= batchSize) {
        yield buildTableFromBatch(columns, batch);
        batch = [];
      }
    }
    if (batch.length) yield buildTableFromBatch(columns, batch);
  }

  try {
    // RecordBatchWriter.writeAll accepts an async iterable of Tables and
    // returns a writer which can be converted to Uint8Array via toUint8Array()
    const writer = await RecordBatchWriter.writeAll(tableBatches());
    // writer is a RecordBatchWriter instance; serialize to Uint8Array
    if (typeof writer.toUint8Array === "function") {
      const uint8 = writer.toUint8Array();
      return Buffer.from(uint8);
    }

    // Fallback: try to get serialized chunks
    if (typeof writer.serialize === "function") {
      const uint8 = writer.serialize();
      return Buffer.from(uint8);
    }

    throw new Error("Unable to serialize Arrow writer output");
  } catch (err) {
    throw new Error(
      `Streaming Arrow conversion failed: ${err?.message || String(err)}`,
    );
  }
}

// Backwards-compatible simple converter (kept for safety).
export function convertRowsToArrowBuffer(columns = [], rows = []) {
  const table = Table.new(
    rows.reduce((acc, r) => {
      for (const k of columns) {
        (acc[k] = acc[k] || []).push(r?.[k] ?? null);
      }
      return acc;
    }, {}),
  );
  const uint8 = table.serialize();
  return Buffer.from(uint8);
}
