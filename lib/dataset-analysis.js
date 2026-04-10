import { parse } from "csv-parse/sync";
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
const DEFAULT_GROK_MODEL = process.env.GROK_MODEL || "grok-4-0709";

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

    return {
      name: column,
      inferredType: inferColumnType(values),
      nullCount: values.length - nonNull.length,
      uniqueCount: new Set(nonNull.map((value) => String(value))).size,
      sampleValues: uniqueValues,
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
    relationships.push({
      columns: [categoryColumn.name],
      chartType: "bar",
      rationale: "Frequency",
      description: `Frequency of ${categoryColumn.name} values.`,
      confidence: 0.45,
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

function parseCSV(buffer) {
  const text = buffer.toString("utf-8");

  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_column_count: true,
  });

  return {
    data: records,
    rowCount: records.length,
    columnCount: records.length > 0 ? Object.keys(records[0]).length : 0,
    sheetName: null,
    columns: records.length > 0 ? Object.keys(records[0]) : [],
  };
}

function parseXLSX(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const records = XLSX.utils.sheet_to_json(sheet, { defval: null });

  return {
    data: records,
    rowCount: records.length,
    columnCount: records.length > 0 ? Object.keys(records[0]).length : 0,
    sheetName,
    columns: records.length > 0 ? Object.keys(records[0]) : [],
  };
}

export function parseDatasetBuffer({ buffer, fileName }) {
  const lowerCaseName = String(fileName || "").toLowerCase();

  if (lowerCaseName.endsWith(".csv")) {
    return parseCSV(buffer);
  }

  if (lowerCaseName.endsWith(".xlsx")) {
    return parseXLSX(buffer);
  }

  throw new Error("Unsupported file extension");
}

export async function analyzeDatasetBuffer({
  buffer,
  fileName,
  fileSize = buffer.length,
  existingRelationships,
  skipAi = false,
}) {
  const parsedResult = parseDatasetBuffer({ buffer, fileName });
  const columns = sanitizeColumns(getRawColumns(parsedResult));
  const data = projectRowsToColumns(parsedResult.data, columns);
  const rowCount = data.length;
  const sheetName = parsedResult.sheetName;
  const columnCount = columns.length;

  if (columnCount === 0) {
    throw new Error(
      "No valid column headers found. Please ensure the first row contains column names.",
    );
  }

  const inferenceRows = data.slice(0, TYPE_INFERENCE_ROWS);
  const sampleRows = data.slice(0, AI_SAMPLE_ROWS);
  const previewRows = data.slice(0, FRONTEND_RENDER_ROWS);
  const columnProfiles = buildColumnProfiles(inferenceRows, columns);
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
      sampleRows,
    };

    try {
      aiResult = await getGrokChartSuggestions(aiPayload, maxRelationships);
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

  return {
    aiResult,
    columns,
    columnCount,
    columnProfiles,
    data,
    previewRows,
    relationships,
    rowCount,
    sampleRows,
    sheetName,
  };
}

