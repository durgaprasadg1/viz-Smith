"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createSupabaseClient } from "@/lib/supabase";
import useAuth from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

const supabase = createSupabaseClient();
const UPLOAD_REQUEST_TIMEOUT_MS = 30000;

const CHART_COLORS = [
  "#22D3EE",
  "#8B5CF6",
  "#F472B6",
  "#34D399",
  "#F59E0B",
  "#60A5FA",
];

const EXPORT_OPTIONS = [
  {
    format: "pdf",
    title: "Export as PDF",
    subtitle: "Report style document with complete table and all charts",
  },
  {
    format: "ppt",
    title: "Export as PPT",
    subtitle: "Slides with full dataset table and chart visualizations",
  },
];

const CHART_INITIAL_DIMENSION = {
  width: 480,
  height: 256,
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

function parseFilenameFromDisposition(disposition) {
  if (!disposition) return null;

  const utfMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) {
    try {
      return decodeURIComponent(utfMatch[1]);
    } catch {
      return utfMatch[1];
    }
  }

  const regularMatch = disposition.match(/filename="?([^";]+)"?/i);
  if (regularMatch?.[1]) return regularMatch[1];

  return null;
}

function extensionFromFormat(format) {
  if (format === "ppt") return "pptx";
  return "pdf";
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
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
    .sort((a, b) => b.value - a.value)
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
    points.sort((a, b) => a.sort - b.sort);
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
        if (numeric !== null) {
          entry[key] = numeric;
          activeSeries.add(key);
          hasValue = true;
        }
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
  values.forEach((col) => {
    const value = normalizeLabel(col);
    if (!value) return;
    if (isIgnoredColumnName(value)) return;
    if (columnSet.size && !columnSet.has(value)) return;
    if (!deduped.includes(value)) deduped.push(value);
  });

  return deduped;
}

function buildPreparedCharts(relationships, rows, columns) {
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

function ChartViewport({ children }) {
  const containerRef = useRef(null);
  const [size, setSize] = useState(CHART_INITIAL_DIMENSION);

  useEffect(() => {
    if (!containerRef.current || typeof ResizeObserver === "undefined") return;

    const updateSize = (width, height) => {
      const nextWidth = Math.max(
        Math.round(width),
        CHART_INITIAL_DIMENSION.width,
      );
      const nextHeight = Math.max(
        Math.round(height),
        CHART_INITIAL_DIMENSION.height,
      );

      setSize((current) => {
        if (current.width === nextWidth && current.height === nextHeight) {
          return current;
        }

        return {
          width: nextWidth,
          height: nextHeight,
        };
      });
    };

    const initialRect = containerRef.current.getBoundingClientRect();
    if (initialRect.width > 0 || initialRect.height > 0) {
      updateSize(initialRect.width, initialRect.height);
    }

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      updateSize(entry.contentRect.width, entry.contentRect.height);
    });

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, []);

  return (
    <div ref={containerRef} className="h-64 w-full min-w-0">
      {children(size)}
    </div>
  );
}

function renderChartVisualization(chart, index, size) {
  const width = Math.max(size.width, CHART_INITIAL_DIMENSION.width);
  const height = Math.max(size.height, CHART_INITIAL_DIMENSION.height);
  const pieOuterRadius = Math.max(72, Math.min(width, height) * 0.28);
  const pieInnerRadius =
    chart.renderType === "donut" ? Math.max(40, pieOuterRadius * 0.56) : 0;

  if (chart.renderType === "bar") {
    return (
      <BarChart width={width} height={height} data={chart.chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
        <XAxis dataKey="name" stroke="#CBD5F5" />
        <YAxis stroke="#CBD5F5" />
        <Tooltip />
        <Bar dataKey="value" fill={CHART_COLORS[0]} radius={[6, 6, 0, 0]} />
      </BarChart>
    );
  }

  if (chart.renderType === "horizontalBar") {
    return (
      <BarChart
        width={width}
        height={height}
        data={chart.chartData}
        layout="vertical"
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
        <XAxis type="number" stroke="#CBD5F5" />
        <YAxis dataKey="name" type="category" stroke="#CBD5F5" />
        <Tooltip />
        <Bar dataKey="value" fill={CHART_COLORS[1]} radius={[0, 6, 6, 0]} />
      </BarChart>
    );
  }

  if (chart.renderType === "line") {
    return (
      <LineChart width={width} height={height} data={chart.chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
        <XAxis dataKey="name" stroke="#CBD5F5" />
        <YAxis stroke="#CBD5F5" />
        <Tooltip />
        <Line
          type="monotone"
          dataKey="value"
          stroke={CHART_COLORS[2]}
          strokeWidth={2}
        />
      </LineChart>
    );
  }

  if (chart.renderType === "area") {
    return (
      <AreaChart width={width} height={height} data={chart.chartData}>
        <defs>
          <linearGradient id={`area-${index}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART_COLORS[3]} stopOpacity={0.7} />
            <stop offset="95%" stopColor={CHART_COLORS[3]} stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
        <XAxis dataKey="name" stroke="#CBD5F5" />
        <YAxis stroke="#CBD5F5" />
        <Tooltip />
        <Area
          type="monotone"
          dataKey="value"
          stroke={CHART_COLORS[3]}
          fill={`url(#area-${index})`}
        />
      </AreaChart>
    );
  }

  if (chart.renderType === "scatter") {
    return (
      <ScatterChart width={width} height={height}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
        <XAxis dataKey="x" type="number" stroke="#CBD5F5" />
        <YAxis dataKey="y" type="number" stroke="#CBD5F5" />
        <Tooltip cursor={{ strokeDasharray: "3 3" }} />
        <Scatter data={chart.chartData} fill={CHART_COLORS[4]} />
      </ScatterChart>
    );
  }

  if (chart.renderType === "pie" || chart.renderType === "donut") {
    return (
      <PieChart width={width} height={height}>
        <Tooltip />
        <Pie
          data={chart.chartData}
          dataKey="value"
          nameKey="name"
          innerRadius={pieInnerRadius}
          outerRadius={pieOuterRadius}
          paddingAngle={2}
          cx="50%"
          cy="50%"
        >
          {chart.chartData.map((entry, idx) => (
            <Cell
              key={`slice-${idx}`}
              fill={CHART_COLORS[idx % CHART_COLORS.length]}
            />
          ))}
        </Pie>
      </PieChart>
    );
  }

  if (chart.renderType === "histogram") {
    return (
      <BarChart width={width} height={height} data={chart.chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
        <XAxis dataKey="name" stroke="#CBD5F5" />
        <YAxis stroke="#CBD5F5" />
        <Tooltip />
        <Bar dataKey="value" fill={CHART_COLORS[5]} radius={[6, 6, 0, 0]} />
      </BarChart>
    );
  }

  if (chart.renderType === "multiLine") {
    return (
      <LineChart width={width} height={height} data={chart.chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
        <XAxis dataKey="name" stroke="#CBD5F5" />
        <YAxis stroke="#CBD5F5" />
        <Tooltip />
        <Legend />
        {chart.seriesKeys.map((key, seriesIndex) => (
          <Line
            key={key}
            type="monotone"
            dataKey={key}
            stroke={CHART_COLORS[seriesIndex % CHART_COLORS.length]}
            strokeWidth={2}
          />
        ))}
      </LineChart>
    );
  }

  if (chart.renderType === "stackedBar") {
    return (
      <BarChart width={width} height={height} data={chart.chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1F2937" />
        <XAxis dataKey="name" stroke="#CBD5F5" />
        <YAxis stroke="#CBD5F5" />
        <Tooltip />
        <Legend />
        {chart.seriesKeys.map((key, seriesIndex) => (
          <Bar
            key={key}
            dataKey={key}
            stackId="stack"
            fill={CHART_COLORS[seriesIndex % CHART_COLORS.length]}
          />
        ))}
      </BarChart>
    );
  }

  return null;
}

function RelationshipSummaryCard({ relationship, index }) {
  const columns = Array.isArray(relationship?.columns)
    ? relationship.columns.map(normalizeLabel).filter(Boolean)
    : [];
  const chartType = normalizeChartType(relationship?.chartType);
  const description = normalizeLabel(
    relationship?.description ||
      relationship?.rationale ||
      "No description provided.",
  );

  return (
    <Card className="border border-cyan-300/20 bg-slate-950/50">
      <CardHeader className="space-y-1 pb-3">
        <CardTitle className="text-base font-semibold text-cyan-100">
          Recommendation {index + 1}
        </CardTitle>
        <p className="text-xs uppercase tracking-wide text-cyan-200/80">
          {chartType}
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {columns.length ? (
            columns.map((column, colIndex) => (
              <span
                key={`${column}-${colIndex}`}
                className="rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-white/80"
              >
                {column}
              </span>
            ))
          ) : (
            <span className="text-xs text-white/50">No columns detected</span>
          )}
        </div>
        <p className="text-sm leading-relaxed text-white/70">{description}</p>
      </CardContent>
    </Card>
  );
}

export default function UploadFile() {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [accessToken, setAccessToken] = useState(null);
  const [relationships, setRelationships] = useState([]);
  const [columns, setColumns] = useState([]);
  const [rows, setRows] = useState([]);
  const [analysisSummary, setAnalysisSummary] = useState({
    rowCount: 0,
    columnCount: 0,
    sheetName: null,
  });
  const [preparedCharts, setPreparedCharts] = useState({
    charts: [],
    skipped: 0,
  });
  const [latestDataset, setLatestDataset] = useState(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportingFormat, setExportingFormat] = useState("");

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setAccessToken(data.session?.access_token ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setAccessToken(session?.access_token ?? null);
      },
    );

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const canUpload = useMemo(() => {
    return !authLoading && Boolean(user) && Boolean(accessToken);
  }, [authLoading, user, accessToken]);

  const canExportReports = useMemo(() => {
    return (
      Boolean(accessToken) &&
      Boolean(latestDataset?.id) &&
      preparedCharts.charts.length > 0
    );
  }, [accessToken, latestDataset, preparedCharts]);

  async function handleUpload(e) {
    e.preventDefault();
    setMessage("");
    setRelationships([]);
    setColumns([]);
    setRows([]);
    setAnalysisSummary({ rowCount: 0, columnCount: 0, sheetName: null });
    setPreparedCharts({ charts: [], skipped: 0 });
    setLatestDataset(null);
    setExportDialogOpen(false);
    setExportingFormat("");

    if (!canUpload) {
      setMessage("Please sign in to upload files.");
      toast.error("Please sign in to upload files.");
      return;
    }

    setLoading(true);

    const form = e.currentTarget;
    const input = form.elements.namedItem("file");

    if (!input?.files?.[0]) {
      setMessage("Please select a file");
      toast.error("Please select a file.");
      setLoading(false);
      return;
    }

    const loadingToast = toast.loading(
      "Generating canvas from your dataset...",
    );

    const formData = new FormData();
    formData.append("file", input.files[0]);
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, UPLOAD_REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: accessToken
          ? {
              Authorization: `Bearer ${accessToken}`,
            }
          : {},
        body: formData,
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const errorMessage = data.error || "Upload failed";
        setMessage(errorMessage);
        toast.error(errorMessage, { id: loadingToast });
      } else {
        const nextRelationships = Array.isArray(data.relationships)
          ? data.relationships
          : [];
        const nextColumns = Array.isArray(data.columns) ? data.columns : [];
        const nextRows = Array.isArray(data.rows) ? data.rows : [];
        const fallbackPreview = buildPreparedCharts(
          nextRelationships,
          nextRows,
          nextColumns,
        );
        const hasServerPreparedCharts = Array.isArray(
          data?.processedCharts?.charts,
        );
        const serverPreparedCharts = {
          charts: hasServerPreparedCharts ? data.processedCharts.charts : [],
          skipped: Number.isFinite(Number(data?.processedCharts?.skipped))
            ? Number(data.processedCharts.skipped)
            : 0,
        };

        setMessage("Upload successful");
        setRelationships(nextRelationships);
        setColumns(nextColumns);
        setRows(nextRows);
        setAnalysisSummary({
          rowCount: Number.isFinite(Number(data?.rowCount))
            ? Number(data.rowCount)
            : nextRows.length,
          columnCount: Number.isFinite(Number(data?.columnCount))
            ? Number(data.columnCount)
            : nextColumns.length,
          sheetName:
            typeof data?.sheetName === "string" && data.sheetName.trim()
              ? data.sheetName.trim()
              : null,
        });
        setPreparedCharts(serverPreparedCharts);
        setLatestDataset(
          data?.dataset?.id
            ? {
                id: data.dataset.id,
                fileName:
                  data?.dataset?.file_name ||
                  data?.dataset?.fileName ||
                  file.name,
              }
            : null,
        );
        form.reset();

        if (!hasServerPreparedCharts && fallbackPreview.charts.length) {
          toast.warning(
            "Server response missed prepared charts, so rendering was skipped to avoid backend/frontend mismatch.",
          );
        }

        if (data?.ai?.error) {
          toast.warning(
            "AI analysis did not complete in time, so fallback relationships were used.",
          );
        }

        if (serverPreparedCharts.charts.length) {
          toast.success(
            `Canvas generated with ${serverPreparedCharts.charts.length} chart${serverPreparedCharts.charts.length > 1 ? "s" : ""}.`,
            { id: loadingToast },
          );
          if (serverPreparedCharts.skipped > 0) {
            toast.warning(
              `${serverPreparedCharts.skipped} chart suggestion${serverPreparedCharts.skipped > 1 ? "s were" : " was"} skipped due to empty or incompatible columns.`,
            );
          }
        } else {
          toast.error("No renderable charts were generated for this file.", {
            id: loadingToast,
          });
        }

        if (data?.persistence?.warning) {
          toast.warning(
            `Charts generated, but dataset save failed: ${data.persistence.warning}`,
          );
        }
      }
    } catch (error) {
      const errorMessage =
        error?.name === "AbortError"
          ? "Upload took too long. Analysis was stopped before the server responded."
          : "Something went wrong";
      setMessage(errorMessage);
      toast.error("Something went wrong while generating charts.", {
        id: loadingToast,
      });
    } finally {
      clearTimeout(timeout);
      setLoading(false);
    }
  }

  async function handleExport(format) {
    if (!latestDataset?.id) {
      toast.error("Upload and render charts before exporting.");
      return;
    }

    if (!accessToken) {
      toast.error("Please sign in again before exporting.");
      return;
    }

    setExportingFormat(format);

    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          datasetId: latestDataset.id,
          format,
        }),
      });

      if (!response.ok) {
        let errorMessage = "Export failed";
        try {
          const payload = await response.json();
          errorMessage = payload?.error || errorMessage;
        } catch {
          // ignore json parse failure
        }
        throw new Error(errorMessage);
      }

      const blob = await response.blob();
      const disposition = response.headers.get("content-disposition");
      const headerFileName = parseFilenameFromDisposition(disposition);

      const fallbackBaseName = String(latestDataset.fileName || "dataset")
        .replace(/\.[^/.]+$/, "")
        .replace(/[^a-zA-Z0-9._-]/g, "_");

      const downloadName =
        headerFileName || `${fallbackBaseName}.${extensionFromFormat(format)}`;

      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = downloadName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);

      toast.success(`Exported ${downloadName}`);
      setExportDialogOpen(false);
    } catch (error) {
      toast.error(error?.message || "Unable to export this dataset.");
    } finally {
      setExportingFormat("");
    }
  }

  return (
    <div className="min-h-screen bg-[#0B1020] text-white flex flex-col items-center px-4 py-12 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-[-140px] left-[-120px] w-[360px] h-[360px] bg-[#22D3EE]/15 blur-[140px] rounded-full" />
        <div className="absolute top-[160px] right-[-120px] w-[320px] h-[320px] bg-[#F472B6]/15 blur-[140px] rounded-full" />
        <div className="absolute bottom-[-100px] left-[25%] w-[360px] h-[360px] bg-[#8B5CF6]/10 blur-[160px] rounded-full" />
      </div>

      <Card className="w-full max-w-xl border border-white/10 bg-white/5 backdrop-blur rounded-3xl shadow-[0_30px_120px_-60px_rgba(34,211,238,0.6)]">
        <CardHeader className="space-y-2">
          <CardTitle className="text-3xl font-bold tracking-tight">
            Upload dataset
          </CardTitle>
          <p className="text-sm text-white/70">
            Upload a CSV or XLSX file to start analyzing your data.
          </p>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleUpload} className="space-y-5">
            <div className="space-y-2">
              <Input
                type="file"
                name="file"
                accept=".csv,.xlsx"
                className="bg-white/5 border-white/10 text-white file:text-white file:bg-white/10 file:border-0 file:rounded file:px-3 file:py-1"
              />
              <p className="text-xs text-white/60">
                Supported: .csv, .xlsx. Max size: 50MB.
              </p>
            </div>

            <Button
              type="submit"
              disabled={loading || !canUpload}
              className="w-full bg-gradient-to-r from-[#22D3EE] via-[#8B5CF6] to-[#F472B6] text-slate-950 font-semibold hover:opacity-90"
            >
              {loading ? "Uploading..." : "Upload File"}
            </Button>

            <Button
              type="button"
              variant="outline"
              disabled={
                !canExportReports || loading || Boolean(exportingFormat)
              }
              className="w-full border-white/20 bg-white/5 text-white hover:bg-white/10"
              onClick={() => setExportDialogOpen(true)}
            >
              {exportingFormat ? "Exporting..." : "Export Reports"}
            </Button>

            <p className="text-xs text-white/60">
              {canExportReports
                ? "Canvas is ready. Export to PDF or PPT."
                : "Export button unlocks after charts are generated."}
            </p>

            {!canUpload && !authLoading ? (
              <p className="text-sm text-amber-200/90">
                Sign in to enable uploads.
              </p>
            ) : null}

            {message ? (
              <p className="text-sm text-white/80">{message}</p>
            ) : null}
          </form>
        </CardContent>
      </Card>

      <div className="mt-10 w-full max-w-6xl">
        {relationships.length || preparedCharts.charts.length ? (
          <div className="space-y-6">
            <div>
              <h2 className="text-2xl font-semibold">Suggested charts</h2>
              <p className="text-sm text-white/70">
                Based on the uploaded dataset and AI analysis.
              </p>
              <p className="mt-2 text-xs text-white/60">
                Rows: {analysisSummary.rowCount.toLocaleString()} | Columns:{" "}
                {analysisSummary.columnCount.toLocaleString()}
                {analysisSummary.sheetName
                  ? ` | Sheet: ${analysisSummary.sheetName}`
                  : ""}
              </p>
              {preparedCharts.skipped > 0 ? (
                <p className="mt-2 text-xs text-amber-200/90">
                  {preparedCharts.skipped} suggestion
                  {preparedCharts.skipped > 1 ? "s were" : " was"} skipped due
                  to empty or incompatible data columns.
                </p>
              ) : null}
            </div>

            {preparedCharts.charts.length ? (
              <div className="space-y-6">
                {relationships.length ? (
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {relationships.map((relationship, relationshipIndex) => {
                      const columnsKey = Array.isArray(relationship?.columns)
                        ? relationship.columns.join("-")
                        : "none";

                      return (
                        <RelationshipSummaryCard
                          key={`${columnsKey}-${relationship?.chartType || "bar"}-${relationshipIndex}`}
                          relationship={relationship}
                          index={relationshipIndex}
                        />
                      );
                    })}
                  </div>
                ) : null}

                <div className="grid gap-6 lg:grid-cols-2">
                  {preparedCharts.charts.map((chart, index) => (
                    <Card
                      key={chart.key}
                      className="min-w-0 border border-white/10 bg-white/5"
                    >
                      <CardHeader className="space-y-2">
                        <CardTitle className="text-lg font-semibold">
                          {chart.title}
                        </CardTitle>
                        <p className="text-sm text-white/70">
                          {chart.description}
                        </p>
                      </CardHeader>
                      <CardContent className="min-w-0 space-y-4">
                        <Separator className="bg-white/10" />

                        <ChartViewport>
                          {(size) =>
                            renderChartVisualization(chart, index, size)
                          }
                        </ChartViewport>

                        <div className="flex flex-wrap gap-2 text-xs text-white/60">
                          <span>Type: {chart.chartType}</span>
                          {chart.primary ? (
                            <span>Primary: {chart.primary}</span>
                          ) : null}
                          {chart.secondary ? (
                            <span>Secondary: {chart.secondary}</span>
                          ) : null}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ) : (
              <Card className="border border-white/10 bg-white/5">
                <CardContent className="py-8 text-center text-sm text-white/70">
                  AI suggestions were received, but none had enough valid data
                  to render. Try uploading a file with more non-empty values.
                </CardContent>
              </Card>
            )}
          </div>
        ) : (
          <Card className="border border-white/10 bg-white/5">
            <CardContent className="py-8 text-center text-sm text-white/70">
              Upload a dataset to see AI-generated chart recommendations here.
            </CardContent>
          </Card>
        )}
      </div>

      <Dialog
        open={exportDialogOpen}
        onOpenChange={(open) => {
          if (exportingFormat) return;
          setExportDialogOpen(open);
        }}
      >
        <DialogContent className="border border-white/10 bg-[#0a1328] text-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Export report</DialogTitle>
            <DialogDescription className="text-white/65">
              Choose a format. Each export includes the complete table and all
              generated chart visualizations.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">
            <p className="font-medium text-white">
              {latestDataset?.fileName || "Current upload"}
            </p>
            <p className="text-xs text-white/55">
              Choose PDF or PPT for this rendered canvas.
            </p>
          </div>

          <div className="grid gap-3">
            {EXPORT_OPTIONS.map((option) => {
              const isCurrent = exportingFormat === option.format;

              return (
                <Button
                  key={option.format}
                  type="button"
                  variant="outline"
                  className="h-auto justify-start border-white/10 bg-white/5 px-4 py-3 text-left text-white hover:bg-white/10"
                  disabled={Boolean(exportingFormat) || !canExportReports}
                  onClick={() => handleExport(option.format)}
                >
                  <span className="flex flex-col items-start">
                    <span className="text-sm font-medium">
                      {isCurrent ? "Exporting..." : option.title}
                    </span>
                    <span className="text-xs text-white/60">
                      {option.subtitle}
                    </span>
                  </span>
                </Button>
              );
            })}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="text-white/70 hover:bg-white/10 hover:text-white"
              onClick={() => setExportDialogOpen(false)}
              disabled={Boolean(exportingFormat)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
