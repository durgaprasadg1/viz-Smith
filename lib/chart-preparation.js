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

function normalizeLabel(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function isIgnoredColumnName(value) {
  const name = normalizeLabel(value);
  if (!name) return true;

  return INVALID_COLUMN_HEADER_PATTERNS.some((pattern) => pattern.test(name));
}

function normalizeChartType(value) {
  const normalized = String(value || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  return CHART_TYPE_ALIAS[normalized] || "bar";
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const numeric = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function buildBarData(rows, categoryKey, valueKey) {
  if (!categoryKey) return [];

  const countTotals = new Map();
  const numericTotals = new Map();
  let numericHits = 0;

  rows.forEach((row) => {
    const category = normalizeLabel(row?.[categoryKey]);
    if (!category) return;

    countTotals.set(category, (countTotals.get(category) || 0) + 1);

    if (!valueKey) return;

    const numeric = toNumber(row?.[valueKey]);
    if (numeric === null) return;

    numericHits += 1;
    numericTotals.set(category, (numericTotals.get(category) || 0) + numeric);
  });

  const source = valueKey && numericHits > 0 ? numericTotals : countTotals;

  return Array.from(source.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((left, right) => right.value - left.value)
    .slice(0, 24);
}

function buildTimeSeriesData(rows, xKey, yKey) {
  if (!xKey || !yKey) return [];

  const points = rows
    .map((row) => {
      const xValue = row?.[xKey];
      const yValue = toNumber(row?.[yKey]);

      if (
        xValue === null ||
        xValue === undefined ||
        xValue === "" ||
        yValue === null
      ) {
        return null;
      }

      const parsed = Date.parse(String(xValue));

      return {
        name: String(xValue),
        value: yValue,
        sort: Number.isNaN(parsed) ? null : parsed,
      };
    })
    .filter(Boolean);

  const hasDates = points.every((point) => point.sort !== null);
  if (hasDates) {
    points.sort((left, right) => left.sort - right.sort);
  }

  return points.map(({ name, value }) => ({ name, value }));
}

function buildScatterData(rows, xKey, yKey) {
  if (!xKey || !yKey) return [];

  return rows
    .map((row) => {
      const xValue = toNumber(row?.[xKey]);
      const yValue = toNumber(row?.[yKey]);

      if (xValue === null || yValue === null) return null;

      return { x: xValue, y: yValue };
    })
    .filter(Boolean);
}

function buildHistogramData(rows, valueKey, binCount = 8) {
  if (!valueKey) return [];

  const values = rows
    .map((row) => toNumber(row?.[valueKey]))
    .filter((value) => value !== null);

  if (!values.length) return [];

  const min = Math.min(...values);
  const max = Math.max(...values);

  if (min === max) {
    return [{ name: `${min}`, value: values.length }];
  }

  const step = (max - min) / binCount;
  const bins = Array.from({ length: binCount }, (_, index) => ({
    min: min + index * step,
    max: min + (index + 1) * step,
    count: 0,
  }));

  values.forEach((value) => {
    let index = Math.floor((value - min) / step);

    if (index < 0) index = 0;
    if (index >= binCount) index = binCount - 1;

    bins[index].count += 1;
  });

  return bins.map((bin) => ({
    name: `${bin.min.toFixed(2)}-${bin.max.toFixed(2)}`,
    value: bin.count,
  }));
}

function buildMultiSeriesData(rows, keys) {
  const [xKey, ...seriesKeys] = keys;
  if (!xKey || !seriesKeys.length) return { data: [], seriesKeys: [] };

  const activeSeries = new Set();

  const data = rows
    .map((row) => {
      const nameValue = normalizeLabel(row?.[xKey]);
      if (!nameValue) return null;

      const entry = { name: nameValue };
      let hasValue = false;

      seriesKeys.forEach((key) => {
        const numeric = toNumber(row?.[key]);
        if (numeric === null) return;

        entry[key] = numeric;
        activeSeries.add(key);
        hasValue = true;
      });

      return hasValue ? entry : null;
    })
    .filter(Boolean);

  return {
    data,
    seriesKeys: seriesKeys.filter((key) => activeSeries.has(key)),
  };
}

function normalizeRelationshipColumns(rawColumns, columnSet) {
  const values = Array.isArray(rawColumns)
    ? rawColumns
    : typeof rawColumns === "string"
      ? rawColumns.split(",")
      : [];

  const deduped = [];

  values.forEach((column) => {
    const value = normalizeLabel(column);
    if (!value) return;
    if (isIgnoredColumnName(value)) return;
    if (columnSet.size && !columnSet.has(value)) return;
    if (!deduped.includes(value)) deduped.push(value);
  });

  return deduped;
}

export function buildPreparedCharts(relationships, rows, columns) {
  const safeRelationships = Array.isArray(relationships) ? relationships : [];
  const safeRows = Array.isArray(rows) ? rows : [];
  const columnSet = new Set(Array.isArray(columns) ? columns : []);
  const prepared = [];
  let skipped = 0;

  safeRelationships.forEach((relationship, index) => {
    const relColumns = normalizeRelationshipColumns(
      relationship?.columns,
      columnSet,
    );
    const primary = relColumns[0];
    const secondary = relColumns[1];
    const chartType = normalizeChartType(relationship?.chartType);

    let renderType = chartType;
    let chartData = [];
    let seriesKeys = [];

    if (chartType === "bar" || chartType === "horizontalBar") {
      chartData = buildBarData(safeRows, primary, secondary);
    } else if (chartType === "line" || chartType === "area") {
      chartData = buildTimeSeriesData(safeRows, primary, secondary);
      if (!chartData.length) {
        chartData = buildBarData(safeRows, primary, secondary);
        renderType = "bar";
      }
    } else if (chartType === "scatter") {
      chartData = buildScatterData(safeRows, primary, secondary);
      if (!chartData.length) {
        chartData = buildBarData(safeRows, primary, secondary);
        renderType = "bar";
      }
    } else if (chartType === "pie" || chartType === "donut") {
      chartData = buildBarData(safeRows, primary, secondary);
    } else if (chartType === "histogram") {
      chartData = buildHistogramData(safeRows, secondary || primary);
      if (!chartData.length) {
        chartData = buildBarData(safeRows, primary, secondary);
        renderType = "bar";
      }
    } else if (chartType === "multiLine" || chartType === "stackedBar") {
      const multi = buildMultiSeriesData(safeRows, relColumns);
      chartData = multi.data;
      seriesKeys = multi.seriesKeys;

      if (!chartData.length || !seriesKeys.length) {
        chartData = buildBarData(safeRows, primary, secondary);
        renderType = "bar";
        seriesKeys = [];
      }
    } else {
      chartData = buildBarData(safeRows, primary, secondary);
      renderType = "bar";
    }

    if (!chartData.length) {
      skipped += 1;
      return;
    }

    prepared.push({
      key: `${chartType}-${primary || "na"}-${secondary || "na"}-${index}`,
      title: relationship?.title || relColumns.join(" vs ") || "Untitled",
      description: relationship?.description || relationship?.rationale || "",
      chartType,
      renderType,
      primary,
      secondary,
      chartData,
      seriesKeys,
    });
  });

  return {
    charts: prepared,
    skipped,
  };
}
