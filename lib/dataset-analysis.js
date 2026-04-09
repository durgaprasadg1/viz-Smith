import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";
import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

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

const REQUESTED_JSON_FORMAT = {
  relationships: [
    {
      columns: ["col_a", "col_b"],
      chartType: "bar",
      rationale: "Short explanation",
      description: "What this relationship shows in plain language",
      confidence: 0.72,
      priority: 1,
    },
  ],
};

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
  return Math.min(Math.max(Math.ceil(possible * 0.35), 4), 12);
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
        rationale: "Time-based trend over a numeric metric",
        description: `Shows how ${numericColumn.name} changes over time by ${dateColumn.name}.`,
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
        rationale: "Category comparison for a numeric metric",
        description: `Compares ${numericColumn.name} across ${categoryColumn.name} categories.`,
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
        rationale: "Numeric relationship between two metrics",
        description: `Highlights the relationship between ${numeric[index].name} and ${numeric[subIndex].name}.`,
        confidence: 0.52,
        priority: relationships.length + 1,
      });
    }
  }

  numeric.forEach((numericColumn) => {
    relationships.push({
      columns: [numericColumn.name],
      chartType: "histogram",
      rationale: "Distribution of a numeric column",
      description: `Shows the distribution of ${numericColumn.name}.`,
      confidence: 0.45,
      priority: relationships.length + 1,
    });
  });

  categorical.forEach((categoryColumn) => {
    relationships.push({
      columns: [categoryColumn.name],
      chartType: "bar",
      rationale: "Category frequency",
      description: `Shows the frequency of ${categoryColumn.name} values.`,
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
      item?.columns,
      allowedColumns,
    );
    if (!relColumns.length) return;

    let chartType = normalizeChartType(item?.chartType);

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
        typeof item?.rationale === "string" ? item.rationale.trim() : "",
      description:
        typeof item?.description === "string" ? item.description.trim() : "",
      confidence: clampConfidence(item?.confidence),
      priority: Number.isFinite(Number(item?.priority))
        ? Number(item.priority)
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

function buildAiPrompt(payload, maxRelationships) {
  return `
You are an expert data analyst, exploratory data visualization strategist, and BI chart recommendation engine.

Your job is to inspect dataset structure and identify the BEST chartable relationships for a modern dashboard or analytics interface.

You are NOT generating charts.
You are ONLY recommending the most useful chart relationships.

Your recommendations should help a frontend app decide:
- which columns can be visualized together
- what chart type should be used
- which relationships are most important first

You must think like:
- a business analyst
- a dashboard designer
- a data storyteller
- a chart recommendation engine

Your output must help discover:
- comparisons
- rankings
- trends
- distributions
- proportions
- category breakdowns
- grouped comparisons
- time series relationships
- meaningful numeric pairings

Rules:
- Return ONLY valid JSON
- No markdown
- No code fences
- No comments
- No explanation outside JSON
- No prose outside the JSON object

Chart recommendation rules:
- Use "line" for time-based trends
- Use "bar" for category vs value comparisons
- Use "horizontalBar" for ranking / long labels
- Use "pie" or "donut" only for limited category share comparisons
- Use "scatter" for numeric vs numeric relationships
- Use "histogram" for single numeric distribution
- Use "area" for cumulative or trend-like progression
- Use "stackedBar" for grouped category comparisons
- Use "multiLine" for multiple series across time if clearly valid
- Avoid weak or meaningless chart suggestions

Column pairing rules:
- Prefer strong analytical relationships
- Avoid pairing unrelated text columns
- Prefer numeric + categorical
- Prefer numeric + date
- Prefer numeric + numeric
- Prefer date + numeric
- Prefer low-cardinality category columns over noisy text columns
- Do not recommend nonsense combinations

Priority rules:
- priority 1 = most useful and most likely to produce a meaningful chart
- higher priority number = less useful

Confidence rules:
- confidence must be between 0 and 1
- use higher confidence only when relationship is clearly meaningful

Description rules:
- Include a short human-readable description for each relationship
- The description should explain what the relationship shows
- Keep it concise (1 sentence)

Output brevity rules:
- Keep rationale under 10 words
- Keep description under 16 words

You MUST return up to ${maxRelationships} relationships.
Return exactly ${maxRelationships} only if enough meaningful relationships exist.
If fewer strong relationships exist, return fewer.
Never invent weak or nonsense relationships just to reach the count.

Return EXACTLY this JSON shape:
${JSON.stringify(REQUESTED_JSON_FORMAT, null, 2)}

Dataset payload:
${JSON.stringify(payload, null, 2)}
`.trim();
}

function extractJson(text) {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {}

  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");

  if (objectStart !== -1 && objectEnd !== -1 && objectEnd > objectStart) {
    const objectSlice = text.slice(objectStart, objectEnd + 1);
    try {
      return JSON.parse(objectSlice);
    } catch {}
  }

  const arrayStart = text.indexOf("[");
  const arrayEnd = text.lastIndexOf("]");

  if (arrayStart !== -1 && arrayEnd !== -1 && arrayEnd > arrayStart) {
    const arraySlice = text.slice(arrayStart, arrayEnd + 1);
    try {
      return JSON.parse(arraySlice);
    } catch {}
  }

  const relationshipsKeyIndex = text.indexOf('"relationships"');
  const relationshipsArrayStart =
    relationshipsKeyIndex === -1
      ? -1
      : text.indexOf("[", relationshipsKeyIndex);

  if (relationshipsArrayStart !== -1) {
    const recoveredRelationships = [];
    let objectStart = -1;
    let depth = 0;
    let inString = false;
    let escaping = false;

    for (
      let index = relationshipsArrayStart + 1;
      index < text.length;
      index += 1
    ) {
      const char = text[index];

      if (escaping) {
        escaping = false;
        continue;
      }

      if (char === "\\" && inString) {
        escaping = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (inString) continue;

      if (char === "{") {
        if (depth === 0) {
          objectStart = index;
        }
        depth += 1;
        continue;
      }

      if (char === "}") {
        if (depth === 0) continue;
        depth -= 1;

        if (depth === 0 && objectStart !== -1) {
          const objectSlice = text.slice(objectStart, index + 1);
          try {
            recoveredRelationships.push(JSON.parse(objectSlice));
          } catch {}
          objectStart = -1;
        }
      }
    }

    if (recoveredRelationships.length) {
      return { relationships: recoveredRelationships };
    }
  }

  return null;
}

async function getGroqChartSuggestions(payload, maxRelationships) {
  const prompt = buildAiPrompt(payload, maxRelationships);

  const result = await groq.chat.completions.create({
    model: "openai/gpt-oss-20b",
    temperature: 0.2,
    max_completion_tokens: AI_MAX_COMPLETION_TOKENS,
    response_format: { type: "json_object" },
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
  });

  const content = result?.choices?.[0]?.message?.content || "";
  const parsed = extractJson(content);

  return {
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

  let relationships = sanitizeAiRelationships(
    existingRelationships,
    columns,
    maxRelationships,
  );

  let aiResult = null;

  if (!relationships.length) {
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
      aiResult = await getGroqChartSuggestions(aiPayload, maxRelationships);
      relationships = sanitizeAiRelationships(
        aiResult?.parsed?.relationships,
        columns,
        maxRelationships,
      );
    } catch (error) {
      aiResult = {
        raw: "",
        parsed: null,
        error: error instanceof Error ? error.message : "AI analysis failed",
      };
    }
  }

  if (!relationships.length) {
    relationships = sanitizeAiRelationships(
      buildFallbackRelationships(columnProfiles, maxRelationships),
      columns,
      maxRelationships,
    );
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
