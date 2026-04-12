import { Readable } from "node:stream";
import { parse as parseStream } from "csv-parse";
import * as XLSX from "xlsx";

export const ALLOWED_TYPES = [
  "text/csv",
  "application/csv",
  "text/plain",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

export const MAX_FILE_SIZE = 50 * 1024 * 1024;
export const AI_SAMPLE_ROWS = 12;
export const TYPE_INFERENCE_ROWS = 50;
export const FRONTEND_RENDER_ROWS = 250;
const SCHEMA_DETECTION_ROWS = 1000;

const AI_MAX_COMPLETION_TOKENS = 2000;
const AI_REQUEST_TIMEOUT_MS = Math.max(
  Number.parseInt(
    process.env.AI_REQUEST_TIMEOUT_MS || process.env.GROK_TIMEOUT_MS || "18000",
    10,
  ) || 18000,
  1000,
);
const RELATIONSHIP_LIMIT = Math.max(
  Number.parseInt(process.env.AI_RELATIONSHIP_TARGET || "40", 10) || 40,
  1,
);

const GROK_API_KEY = process.env.GROK_API_KEY || "";
const DEFAULT_GROK_MODEL = "grok-4-0709";

const REQUESTED_JSON_FORMAT = [
  {
    cols: ["col_a", "col_b"],
    chartType: "bar",
    desc: "Compares col_b across col_a groups",
    rationale: "Category vs numeric",
    confidence: 0.72,
    priority: 1,
  },
];

const CHART_TYPE_ALIAS = {
  bar: "bar",
  barchart: "bar",
  column: "bar",
  columnchart: "bar",
  verticalbar: "bar",
  horizontalbar: "horizontalBar",
  horizontalbarchart: "horizontalBar",
  rankingbar: "horizontalBar",
  line: "line",
  linechart: "line",
  trend: "line",
  timeseries: "line",
  area: "area",
  areachart: "area",
  scatter: "scatter",
  scatterplot: "scatter",
  bubble: "scatter",
  pie: "pie",
  piechart: "pie",
  donut: "donut",
  doughnut: "donut",
  donutchart: "donut",
  histogram: "histogram",
  hist: "histogram",
  multiline: "multiLine",
  multilinechart: "multiLine",
  multiseriesline: "multiLine",
  stackedbar: "stackedBar",
  stackedbarchart: "stackedBar",
};

const INVALID_COLUMN_HEADER_PATTERNS = [
  /^__EMPTY(?:_\d+)?$/i,
  /^Unnamed(?::\s*\d+)?$/i,
];

function normalizeColumnName(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

// Stream rows as an async iterator to support streaming conversions.
export async function* streamDatasetRows({ buffer, fileName }) {
  const lowerCaseName = String(fileName || "").toLowerCase();

  if (lowerCaseName.endsWith(".csv")) {
    // reuse parseCSVStream internals but yield rows directly
    const detected = detectCsvDelimiter(buffer);
    const source = Readable.from([buffer]);
    const parser = source.pipe(
      parseStream({
        bom: true,
        columns: true,
        delimiter: detected,
        trim: true,
        skip_empty_lines: true,
        relax_column_count: true,
        relax_quotes: true,
        skip_records_with_error: true,
      }),
    );

    for await (const row of parser) {
      yield row;
    }
    return;
  }

  if (lowerCaseName.endsWith(".xlsx")) {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const records = XLSX.utils.sheet_to_json(sheet, { defval: null });
    for (const row of records) yield row;
    return;
  }

  throw new Error("Unsupported extension for streaming rows");
}

function isIgnoredColumnName(value) {
  const name = normalizeColumnName(value);
  if (!name) return true;

  return INVALID_COLUMN_HEADER_PATTERNS.some((pattern) => pattern.test(name));
}

function getRawColumns(parsedResult) {
  if (Array.isArray(parsedResult?.columns) && parsedResult.columns.length) {
    return parsedResult.columns;
  }

  if (Array.isArray(parsedResult?.data) && parsedResult.data.length) {
    return Object.keys(parsedResult.data[0]);
  }

  return [];
}

function sanitizeColumns(rawColumns) {
  const deduped = [];

  (Array.isArray(rawColumns) ? rawColumns : []).forEach((column) => {
    const name = normalizeColumnName(column);
    if (isIgnoredColumnName(name)) return;
    if (deduped.includes(name)) return;
    deduped.push(name);
  });

  return deduped;
}

function projectRowsToColumns(rows, columns) {
  if (!Array.isArray(rows) || !rows.length) return [];
  if (!Array.isArray(columns) || !columns.length) return [];

  return rows.map((row) =>
    Object.fromEntries(
      columns.map((column) => [column, row?.[column] ?? null]),
    ),
  );
}

function normalizeValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  return value;
}

function isNumericValue(value) {
  if (value === null || value === undefined || value === "") return false;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "string") return false;
  const numeric = Number(String(value).replace(/,/g, ""));
  return !Number.isNaN(numeric) && Number.isFinite(numeric);
}

function isDateValue(value) {
  if (value === null || value === undefined || value === "") return false;
  if (value instanceof Date) return !Number.isNaN(value.getTime());
  if (typeof value !== "string") return false;
  const time = Date.parse(value);
  return !Number.isNaN(time);
}

function inferColumnType(values) {
  const cleaned = values.filter(
    (value) => value !== null && value !== undefined && value !== "",
  );

  if (!cleaned.length) return "unknown";

  const numericCount = cleaned.filter(isNumericValue).length;
  const dateCount = cleaned.filter(isDateValue).length;
  const uniqueCount = new Set(cleaned.map((value) => String(value))).size;
  const total = cleaned.length;

  if (numericCount / total >= 0.8) return "numeric";
  if (dateCount / total >= 0.8) return "date";
  if (uniqueCount <= Math.max(20, Math.floor(total * 0.3))) {
    return "categorical";
  }

  return "text";
}

function buildColumnProfiles(data, columns) {
  return columns.map((column) => {
    const values = data.map((row) => normalizeValue(row[column]));
    const nonNull = values.filter((value) => value !== null);
    const uniqueValues = [
      ...new Set(nonNull.map((value) => String(value))),
    ].slice(0, 6);

    const inferredType = inferColumnType(values);
    let min = null;
    let max = null;

    if (inferredType === "numeric") {
      const numericVals = nonNull
        .map((v) => {
          if (typeof v === "number") return v;
          if (typeof v === "string") return Number(String(v).replace(/,/g, ""));
          return NaN;
        })
        .filter((v) => Number.isFinite(v));

      if (numericVals.length) {
        min = Math.min(...numericVals);
        max = Math.max(...numericVals);
      }
    }

    const nullCount = values.length - nonNull.length;
    const nullPercent = values.length ? nullCount / values.length : 0;

    return {
      name: column,
      inferredType,
      nullCount,
      nullPercent,
      uniqueCount: new Set(nonNull.map((value) => String(value))).size,
      sampleValues: uniqueValues,
      min,
      max,
    };
  });
}

function estimateUsefulRelationships(columnProfiles) {
  const numeric = columnProfiles.filter(
    (column) => column.inferredType === "numeric",
  ).length;
  const categorical = columnProfiles.filter(
    (column) => column.inferredType === "categorical",
  ).length;
  const date = columnProfiles.filter(
    (column) => column.inferredType === "date",
  ).length;

  return (
    categorical * numeric +
    date * numeric +
    (numeric * (numeric - 1)) / 2 +
    numeric
  );
}

function getRecommendedRelationshipCount(columnProfiles) {
  const possible = estimateUsefulRelationships(columnProfiles);
  return Math.max(1, Math.min(Math.ceil(possible), RELATIONSHIP_LIMIT));
}

function buildFallbackRelationships(columnProfiles, maxRelationships) {
  const relationships = [];
  const numeric = columnProfiles.filter(
    (column) => column.inferredType === "numeric",
  );
  const categorical = columnProfiles.filter(
    (column) => column.inferredType === "categorical",
  );
  const date = columnProfiles.filter(
    (column) => column.inferredType === "date",
  );

  date.forEach((dateColumn) => {
    numeric.forEach((numericColumn) => {
      relationships.push({
        columns: [dateColumn.name, numericColumn.name],
        chartType: "line",
        rationale: "Time-based trend over numeric metric",
        description: `Shows how ${numericColumn.name} changes over ${dateColumn.name}.`,
        confidence: 0.62,
        priority: relationships.length + 1,
      });
    });
  });

  categorical.forEach((categoryColumn) => {
    numeric.forEach((numericColumn) => {
      relationships.push({
        columns: [categoryColumn.name, numericColumn.name],
        chartType: "bar",
        rationale: "Category comparison for numeric metric",
        description: `Compares ${numericColumn.name} across ${categoryColumn.name}.`,
        confidence: 0.6,
        priority: relationships.length + 1,
      });
    });
  });

  for (let index = 0; index < numeric.length; index += 1) {
    for (let subIndex = index + 1; subIndex < numeric.length; subIndex += 1) {
      relationships.push({
        columns: [numeric[index].name, numeric[subIndex].name],
        chartType: "scatter",
        rationale: "Numeric relationship",
        description: `Relationship between ${numeric[index].name} and ${numeric[subIndex].name}.`,
        confidence: 0.52,
        priority: relationships.length + 1,
      });
    }
  }

  numeric.forEach((numericColumn) => {
    relationships.push({
      columns: [numericColumn.name],
      chartType: "histogram",
      rationale: "Distribution",
      description: `Distribution of ${numericColumn.name}.`,
      confidence: 0.45,
      priority: relationships.length + 1,
    });
  });

  categorical.forEach((categoryColumn) => {
    // Use pie chart for simple categorical frequency distributions
    relationships.push({
      columns: [categoryColumn.name],
      chartType: "pie",
      rationale: "Frequency",
      description: `Distribution (frequency) of ${categoryColumn.name} values.`,
      confidence: 0.6,
      priority: relationships.length + 1,
    });
  });

  return relationships.slice(0, maxRelationships);
}

function normalizeChartType(value) {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  return CHART_TYPE_ALIAS[normalized] || "bar";
}

function clampConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (numeric < 0) return 0;
  if (numeric > 1) return 1;
  return numeric;
}

function sanitizeRelationshipColumns(rawColumns, allowedColumns) {
  const values = Array.isArray(rawColumns)
    ? rawColumns
    : typeof rawColumns === "string"
      ? rawColumns.split(",")
      : [];

  const deduped = [];

  values.forEach((column) => {
    if (typeof column !== "string") return;
    const value = column.trim();
    if (!value || !allowedColumns.has(value) || deduped.includes(value)) return;
    deduped.push(value);
  });

  return deduped;
}

export function sanitizeAiRelationships(
  relationships,
  columns,
  maxRelationships,
) {
  if (!Array.isArray(relationships)) return [];

  const allowedColumns = new Set(columns);
  const dedupe = new Set();
  const sanitized = [];

  relationships.forEach((item, index) => {
    const relColumns = sanitizeRelationshipColumns(
      item?.columns ?? item?.cols ?? item?.column ?? item?.col,
      allowedColumns,
    );
    if (!relColumns.length) return;

    let chartType = normalizeChartType(
      item?.chartType || item?.type || item?.chart,
    );

    if (chartType === "scatter" && relColumns.length < 2) return;
    if (
      (chartType === "line" || chartType === "area") &&
      relColumns.length < 2
    ) {
      chartType = "bar";
    }
    if (
      (chartType === "multiLine" || chartType === "stackedBar") &&
      relColumns.length < 3
    ) {
      chartType = "bar";
    }

    const key = `${chartType}:${relColumns.join("|")}`;
    if (dedupe.has(key)) return;
    dedupe.add(key);

    sanitized.push({
      columns: relColumns,
      chartType,
      rationale:
        typeof item?.rationale === "string"
          ? item.rationale.trim()
          : typeof item?.reason === "string"
            ? item.reason.trim()
            : "",
      description:
        typeof item?.description === "string"
          ? item.description.trim()
          : typeof item?.desc === "string"
            ? item.desc.trim()
            : "",
      confidence: clampConfidence(item?.confidence ?? item?.score),
      priority: Number.isFinite(Number(item?.priority))
        ? Number(item.priority)
        : Number.isFinite(Number(item?.rank))
          ? Number(item.rank)
          : index + 1,
    });
  });

  return sanitized
    .sort((left, right) => {
      if (left.priority !== right.priority)
        return left.priority - right.priority;
      return (right.confidence ?? 0) - (left.confidence ?? 0);
    })
    .slice(0, maxRelationships);
}

function mergeRelationships(...relationshipSets) {
  const merged = [];
  const dedupe = new Set();

  relationshipSets.forEach((relationshipSet) => {
    if (!Array.isArray(relationshipSet)) return;

    relationshipSet.forEach((item) => {
      const rawColumns =
        item?.columns ?? item?.cols ?? item?.column ?? item?.col ?? [];
      const columns = Array.isArray(rawColumns)
        ? rawColumns
        : typeof rawColumns === "string"
          ? rawColumns.split(",")
          : [];
      const chartType = normalizeChartType(
        item?.chartType || item?.type || item?.chart,
      );
      const key = `${chartType}:${columns.join("|")}`;
      if (dedupe.has(key)) return;
      dedupe.add(key);
      merged.push(item);
    });
  });

  return merged;
}

function buildAiPrompt(payload, maxRelationships) {
  return `
You are an expert data analyst and chart recommendation engine.

Return ONLY valid JSON array. No markdown, no code fences, no extra text.

Goal:
- Inspect dataset metadata.
- Suggest meaningful chart relationships.
- Use existing column names only.

Output rules:
- Return up to ${maxRelationships} items.
- Use this shape exactly:
${JSON.stringify(REQUESTED_JSON_FORMAT, null, 2)}

Chart type must be one of:
bar|horizontalBar|line|area|scatter|pie|donut|histogram|stackedBar|multiLine

Dataset metadata:
${JSON.stringify(payload, null, 2)}
`.trim();
}

function extractJson(text) {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    // continue
  }

  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");

  if (objectStart !== -1 && objectEnd !== -1 && objectEnd > objectStart) {
    const objectSlice = text.slice(objectStart, objectEnd + 1);
    try {
      return JSON.parse(objectSlice);
    } catch {
      // continue
    }
  }

  const arrayStart = text.indexOf("[");
  const arrayEnd = text.lastIndexOf("]");

  if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
    const arraySlice = text.slice(arrayStart, arrayEnd + 1);
    try {
      return JSON.parse(arraySlice);
    } catch {
      // continue
    }
  }

  return null;
}

function normalizeAiRelationshipsPayload(parsed) {
  if (!parsed) return [];

  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed?.relationships)) return parsed.relationships;
  if (Array.isArray(parsed?.charts)) return parsed.charts;
  if (Array.isArray(parsed?.items)) return parsed.items;
  if (Array.isArray(parsed?.data)) return parsed.data;

  if (
    parsed &&
    typeof parsed === "object" &&
    (Array.isArray(parsed?.cols) ||
      Array.isArray(parsed?.columns) ||
      typeof parsed?.cols === "string" ||
      typeof parsed?.columns === "string")
  ) {
    return [parsed];
  }

  return [];
}

function getMessageText(content) {
  if (typeof content === "string") return content;

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item?.type === "text" && typeof item?.text === "string") {
          return item.text;
        }
        return "";
      })
      .join("\n")
      .trim();
  }

  if (content && typeof content === "object") {
    if (typeof content.text === "string") return content.text;
  }

  return "";
}

async function getGrokChartSuggestions(payload, maxRelationships) {
  const prompt = buildAiPrompt(payload, maxRelationships);
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, AI_REQUEST_TIMEOUT_MS);

  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROK_API_KEY}`,
    },
    body: JSON.stringify({
      model: DEFAULT_GROK_MODEL,
      temperature: 0.2,
      max_tokens: AI_MAX_COMPLETION_TOKENS,
      stream: false,
      messages: [
        {
          role: "system",
          content:
            "You are a strict JSON-only analytics engine. Always return valid JSON only.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
    signal: controller.signal,
  }).finally(() => {
    clearTimeout(timeout);
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Grok request failed (${response.status}): ${errorText || response.statusText}`,
    );
  }

  const result = await response.json();
  const content = getMessageText(result?.choices?.[0]?.message?.content);
  const parsed = extractJson(content);

  return {
    provider: "grok",
    model: DEFAULT_GROK_MODEL,
    raw: content,
    parsed,
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getGrokChartSuggestionsWithRetries(
  payload,
  maxRelationships,
  attempts = 3, // 3 baar dekhege hua to theek nhi to theek
) {
  let lastErr = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await getGrokChartSuggestions(payload, maxRelationships);
      const parsed = normalizeAiRelationshipsPayload(result?.parsed);
      if (Array.isArray(parsed) && parsed.length > 0) {
        result.attempts = attempt;
        return result;
      }

      // If parsed is empty, record and retry
      lastErr = new Error("Empty AI response parsed payload");
      // small backoff before next attempt
      await sleep(300 * attempt);
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      await sleep(300 * attempt);
    }
  }

  return {
    provider: "grok",
    model: DEFAULT_GROK_MODEL,
    raw: "",
    parsed: null,
    error: lastErr ? lastErr.message : "AI analysis failed after retries",
  };
}

function detectCsvDelimiter(buffer, maxLines = 20) {
  const sampleText = buffer
    .subarray(0, Math.min(buffer.length, 512 * 1024))
    .toString("utf-8");

  const lines = sampleText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, maxLines);

  const candidates = [",", ";", "\t", "|"];
  const scores = new Map(candidates.map((candidate) => [candidate, 0]));

  lines.forEach((line) => {
    candidates.forEach((candidate) => {
      const escaped = candidate === "\t" ? "\\t" : `\\${candidate}`;
      const matches = line.match(new RegExp(escaped, "g"));
      scores.set(
        candidate,
        (scores.get(candidate) || 0) + (matches?.length || 0),
      );
    });
  });

  return [...scores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || ",";
}

async function parseCSVStream(buffer, options = {}) {
  const { includeFullData = false } = options;
  const delimiter = detectCsvDelimiter(buffer);
  const source = Readable.from([buffer]);

  const parsed = {
    data: [],
    rowCount: 0,
    columnCount: 0,
    sheetName: null,
    columns: [],
    previewRows: [],
    sampleRows: [],
    aiSampleRows: [],
    schemaRows: [],
    skippedRows: 0,
    delimiter,
  };

  const parser = source.pipe(
    parseStream({
      bom: true,
      columns: true,
      delimiter,
      trim: true,
      skip_empty_lines: true,
      relax_column_count: true,
      relax_quotes: true,
      skip_records_with_error: true,
      on_skip: () => {
        parsed.skippedRows += 1;
      },
    }),
  );

  for await (const row of parser) {
    if (!parsed.columns.length) {
      parsed.columns = Object.keys(row || {});
      parsed.columnCount = parsed.columns.length;
    }

    parsed.rowCount += 1;

    if (includeFullData) {
      parsed.data.push(row);
    }

    if (parsed.previewRows.length < FRONTEND_RENDER_ROWS) {
      parsed.previewRows.push(row);
    }

    if (parsed.sampleRows.length < AI_SAMPLE_ROWS) {
      parsed.sampleRows.push(row);
    }

    if (parsed.aiSampleRows.length < Math.max(AI_SAMPLE_ROWS, 50)) {
      parsed.aiSampleRows.push(row);
    }

    if (parsed.schemaRows.length < SCHEMA_DETECTION_ROWS) {
      parsed.schemaRows.push(row);
    }
  }

  return parsed;
}

function parseXLSX(buffer, options = {}) {
  const { includeFullData = false } = options;
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const records = XLSX.utils.sheet_to_json(sheet, { defval: null });
  const previewRows = records.slice(0, FRONTEND_RENDER_ROWS);
  const sampleRows = records.slice(0, AI_SAMPLE_ROWS);
  const aiSampleRows = records.slice(0, Math.max(AI_SAMPLE_ROWS, 50));
  const schemaRows = records.slice(0, SCHEMA_DETECTION_ROWS);

  return {
    data: includeFullData ? records : previewRows,
    rowCount: records.length,
    columnCount: records.length > 0 ? Object.keys(records[0]).length : 0,
    sheetName,
    columns: records.length > 0 ? Object.keys(records[0]) : [],
    previewRows,
    sampleRows,
    aiSampleRows,
    schemaRows,
    skippedRows: 0,
    delimiter: null,
  };
}

export async function parseDatasetBuffer({
  buffer,
  fileName,
  includeFullData = false,
}) {
  const lowerCaseName = String(fileName || "").toLowerCase();

  if (lowerCaseName.endsWith(".csv")) {
    return parseCSVStream(buffer, { includeFullData });
  }

  if (lowerCaseName.endsWith(".xlsx")) {
    return parseXLSX(buffer, { includeFullData });
  }

  throw new Error("Unsupported file extension");
}

export async function analyzeDatasetBuffer({
  buffer,
  fileName,
  fileSize = buffer.length,
  existingRelationships,
  skipAi = false,
  includeFullData = false,
}) {
  const parsedResult = await parseDatasetBuffer({
    buffer,
    fileName,
    includeFullData,
  });
  const columns = sanitizeColumns(getRawColumns(parsedResult));
  const projectedData = projectRowsToColumns(parsedResult.data, columns);
  const previewRows = projectRowsToColumns(parsedResult.previewRows, columns);
  const sampleRows = projectRowsToColumns(parsedResult.sampleRows, columns);
  const aiSampleRows = projectRowsToColumns(parsedResult.aiSampleRows, columns);
  const schemaRows = projectRowsToColumns(parsedResult.schemaRows, columns);
  const rowCount = parsedResult.rowCount;
  const sheetName = parsedResult.sheetName;
  const columnCount = columns.length;

  if (columnCount === 0) {
    throw new Error(
      "No valid column headers found. Please ensure the first row contains column names.",
    );
  }

  const inferenceRows = schemaRows.slice(0, TYPE_INFERENCE_ROWS);
  const columnProfiles = buildColumnProfiles(inferenceRows, columns);
  const schemaProfiles = buildColumnProfiles(schemaRows, columns);
  const maxRelationships = getRecommendedRelationshipCount(columnProfiles);

  const fallbackRelationships = sanitizeAiRelationships(
    buildFallbackRelationships(columnProfiles, maxRelationships),
    columns,
    maxRelationships,
  );

  let relationships = sanitizeAiRelationships(
    existingRelationships,
    columns,
    maxRelationships,
  );

  let aiResult = null;

  if (!relationships.length) {
    relationships = fallbackRelationships;
  }

  if (GROK_API_KEY && !skipAi && fallbackRelationships.length) {
    const aiPayload = {
      fileName,
      fileSize,
      rowCount,
      columnCount,
      sheetName,
      columns,
      columnProfiles,
      sampleRows: aiSampleRows,
    };

    try {
      // Try AI analysis with multiple attempts before falling back
      aiResult = await getGrokChartSuggestionsWithRetries(
        aiPayload,
        maxRelationships,
        3,
      );
      const aiRelationships = normalizeAiRelationshipsPayload(aiResult?.parsed);
      relationships = sanitizeAiRelationships(
        mergeRelationships(
          aiRelationships,
          relationships,
          fallbackRelationships,
        ),
        columns,
        maxRelationships,
      );
    } catch (error) {
      aiResult = {
        provider: "grok",
        model: DEFAULT_GROK_MODEL,
        raw: "",
        parsed: null,
        error: error instanceof Error ? error.message : "AI analysis failed",
      };
    }
  }

  // Post-process to prefer pie/donut charts when relationship is a single
  // categorical column with a small number of unique values.
  function adjustChartTypes(relList, profiles) {
    if (!Array.isArray(relList) || !Array.isArray(profiles)) return relList;
    const profileMap = Object.fromEntries(profiles.map((p) => [p.name, p]));

    return relList.map((rel) => {
      try {
        if (
          (rel.chartType === "bar" || !rel.chartType) &&
          Array.isArray(rel.columns) &&
          rel.columns.length === 1
        ) {
          const prof = profileMap[rel.columns[0]];
          if (prof && prof.inferredType === "categorical") {
            const uniq = Number.isFinite(Number(prof.uniqueCount))
              ? Number(prof.uniqueCount)
              : Infinity;
            if (uniq <= 12) {
              return { ...rel, chartType: "pie" };
            }
          }
        }
      } catch (e) {
        // ignore and return original
      }
      return rel;
    });
  }

  relationships = adjustChartTypes(relationships, columnProfiles);

  return {
    aiResult,
    columns,
    columnCount,
    columnProfiles,
    data: includeFullData ? projectedData : previewRows,
    parsing: {
      mode: String(fileName || "")
        .toLowerCase()
        .endsWith(".csv")
        ? "stream"
        : "buffer",
      skippedRows: parsedResult.skippedRows || 0,
      delimiter: parsedResult.delimiter || null,
      schemaSampleRows: schemaRows.length,
      schemaProfiles,
    },
    previewRows,
    relationships,
    rowCount,
    sampleRows,
    sheetName,
  };
}
