import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import PptxGenJS from "pptxgenjs";
import { format } from "date-fns";

const CHART_COLORS = [
  "#22D3EE",
  "#8B5CF6",
  "#F472B6",
  "#34D399",
  "#F59E0B",
  "#60A5FA",
];

let chartRendererPromise;

async function getChartRenderer() {
  if (!chartRendererPromise) {
    chartRendererPromise = (async () => {
      const [{ Chart, registerables }, { ChartJSNodeCanvas }] =
        await Promise.all([import("chart.js"), import("chartjs-node-canvas")]);

      Chart.register(...registerables);

      return new ChartJSNodeCanvas({
        width: 1200,
        height: 680,
        backgroundColour: "#091223",
        chartCallback: (ChartJS) => {
          ChartJS.register(...registerables);
        },
      });
    })();
  }

  return chartRendererPromise;
}

function toBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof ArrayBuffer) return Buffer.from(value);
  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }
  return Buffer.from([]);
}

function formatMoment(value) {
  if (!value) return "Unavailable";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";

  return format(date, "dd MMM yyyy, hh:mm a");
}

function formatCellValue(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return formatMoment(value);
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function chunkArray(items, size) {
  const chunks = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function createChartConfiguration(chart) {
  if (chart.renderType === "scatter") {
    return {
      type: "scatter",
      data: {
        datasets: [
          {
            label: chart.title,
            data: chart.chartData,
            backgroundColor: CHART_COLORS[4],
            borderColor: CHART_COLORS[4],
            pointRadius: 5,
          },
        ],
      },
      options: {
        responsive: false,
        plugins: {
          title: { display: true, text: chart.title, color: "#F8FAFC" },
          legend: { display: false },
        },
        scales: {
          x: {
            ticks: { color: "#CBD5E1" },
            grid: { color: "rgba(148, 163, 184, 0.14)" },
            title: {
              display: true,
              text: chart.primary || "X Axis",
              color: "#CBD5E1",
            },
          },
          y: {
            ticks: { color: "#CBD5E1" },
            grid: { color: "rgba(148, 163, 184, 0.14)" },
            title: {
              display: true,
              text: chart.secondary || "Y Axis",
              color: "#CBD5E1",
            },
          },
        },
      },
    };
  }

  if (chart.renderType === "pie" || chart.renderType === "donut") {
    return {
      type: chart.renderType === "donut" ? "doughnut" : "pie",
      data: {
        labels: chart.chartData.map((item) => item.name),
        datasets: [
          {
            label: chart.title,
            data: chart.chartData.map((item) => item.value),
            backgroundColor: chart.chartData.map(
              (_, index) => CHART_COLORS[index % CHART_COLORS.length],
            ),
            borderColor: "#091223",
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: false,
        plugins: {
          title: { display: true, text: chart.title, color: "#F8FAFC" },
          legend: {
            display: true,
            labels: { color: "#CBD5E1" },
          },
        },
      },
    };
  }

  if (chart.renderType === "multiLine") {
    return {
      type: "line",
      data: {
        labels: chart.chartData.map((item) => item.name),
        datasets: chart.seriesKeys.map((key, index) => ({
          label: key,
          data: chart.chartData.map((item) => item[key] ?? null),
          borderColor: CHART_COLORS[index % CHART_COLORS.length],
          backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
          fill: false,
          tension: 0.35,
          spanGaps: true,
        })),
      },
      options: {
        responsive: false,
        plugins: {
          title: { display: true, text: chart.title, color: "#F8FAFC" },
          legend: { display: true, labels: { color: "#CBD5E1" } },
        },
        scales: {
          x: {
            ticks: { color: "#CBD5E1" },
            grid: { color: "rgba(148, 163, 184, 0.14)" },
          },
          y: {
            ticks: { color: "#CBD5E1" },
            grid: { color: "rgba(148, 163, 184, 0.14)" },
          },
        },
      },
    };
  }

  if (chart.renderType === "stackedBar") {
    return {
      type: "bar",
      data: {
        labels: chart.chartData.map((item) => item.name),
        datasets: chart.seriesKeys.map((key, index) => ({
          label: key,
          data: chart.chartData.map((item) => item[key] ?? 0),
          backgroundColor: CHART_COLORS[index % CHART_COLORS.length],
        })),
      },
      options: {
        responsive: false,
        plugins: {
          title: { display: true, text: chart.title, color: "#F8FAFC" },
          legend: { display: true, labels: { color: "#CBD5E1" } },
        },
        scales: {
          x: {
            stacked: true,
            ticks: { color: "#CBD5E1" },
            grid: { color: "rgba(148, 163, 184, 0.14)" },
          },
          y: {
            stacked: true,
            ticks: { color: "#CBD5E1" },
            grid: { color: "rgba(148, 163, 184, 0.14)" },
          },
        },
      },
    };
  }

  const baseType =
    chart.renderType === "line" || chart.renderType === "area" ? "line" : "bar";
  const isHorizontal = chart.renderType === "horizontalBar";
  const isArea = chart.renderType === "area";

  return {
    type: baseType,
    data: {
      labels: chart.chartData.map((item) => item.name),
      datasets: [
        {
          label: chart.title,
          data: chart.chartData.map((item) => item.value),
          backgroundColor:
            chart.renderType === "histogram"
              ? CHART_COLORS[5]
              : CHART_COLORS[0],
          borderColor:
            chart.renderType === "line"
              ? CHART_COLORS[2]
              : chart.renderType === "area"
                ? CHART_COLORS[3]
                : isHorizontal
                  ? CHART_COLORS[1]
                  : CHART_COLORS[0],
          fill: isArea,
          tension: 0.35,
        },
      ],
    },
    options: {
      responsive: false,
      indexAxis: isHorizontal ? "y" : "x",
      plugins: {
        title: { display: true, text: chart.title, color: "#F8FAFC" },
        legend: { display: false },
      },
      scales: {
        x: {
          ticks: { color: "#CBD5E1" },
          grid: { color: "rgba(148, 163, 184, 0.14)" },
        },
        y: {
          ticks: { color: "#CBD5E1" },
          grid: { color: "rgba(148, 163, 184, 0.14)" },
        },
      },
    },
  };
}

async function createChartImages(charts) {
  if (!Array.isArray(charts) || !charts.length) return [];

  const chartRenderer = await getChartRenderer();
  const rendered = [];

  for (const chart of charts) {
    const config = createChartConfiguration(chart);
    const image = await chartRenderer.renderToBuffer(config, "image/png");
    rendered.push({
      ...chart,
      image,
      imageBase64: `data:image/png;base64,${image.toString("base64")}`,
    });
  }

  return rendered;
}

function applyPdfPageTheme(doc) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  doc.setFillColor(9, 18, 35);
  doc.rect(0, 0, pageWidth, pageHeight, "F");
}

function addPdfHeader(doc, title, subtitle) {
  applyPdfPageTheme(doc);
  doc.setTextColor(248, 250, 252);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.text(title, 32, 34);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(148, 163, 184);
  doc.text(subtitle, 32, 52);
}

async function createPdfBuffer({ dataset, columns, rows, charts }) {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "pt",
    format: "a4",
    compress: true,
  });

  addPdfHeader(
    doc,
    `${dataset.file_name} export`,
    `Uploaded ${formatMoment(dataset.uploaded_at || dataset.created_at)}`,
  );

  // NOTE: Data table printing removed per request — only include charts.
  // Keep a short summary page (header already added) then add chart pages.
  charts.forEach((chart, index) => {
    doc.addPage();
    addPdfHeader(
      doc,
      chart.title,
      chart.description || `Chart ${index + 1} of ${charts.length}`,
    );
    doc.addImage(chart.imageBase64, "PNG", 36, 86, 740, 420);
  });

  return Buffer.from(doc.output("arraybuffer"));
}

async function createPptBuffer({ dataset, columns, rows, charts }) {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "VizSmith AI";
  pptx.company = "VizSmith AI";
  pptx.subject = "Dataset export";
  pptx.title = `${dataset.file_name} export`;

  const cover = pptx.addSlide();
  cover.background = { color: "091223" };
  cover.addText(dataset.file_name, {
    x: 0.6,
    y: 0.8,
    w: 8.8,
    h: 0.5,
    fontFace: "Aptos",
    fontSize: 24,
    bold: true,
    color: "F8FAFC",
  });
  cover.addText(
    `Uploaded ${formatMoment(dataset.uploaded_at || dataset.created_at)}`,
    {
      x: 0.6,
      y: 1.35,
      w: 8.8,
      h: 0.35,
      fontFace: "Aptos",
      fontSize: 10,
      color: "94A3B8",
    },
  );
  cover.addText(
    `This export contains ${charts.length} chart visual${charts.length === 1 ? "" : "s"}.`,
    {
      x: 0.6,
      y: 1.85,
      w: 8.8,
      h: 0.4,
      fontFace: "Aptos",
      fontSize: 12,
      color: "E2E8F0",
    },
  );
  // NOTE: Removed data table slides — PPTX will include charts only.

  charts.forEach((chart, index) => {
    const slide = pptx.addSlide();
    slide.background = { color: "091223" };
    slide.addText(chart.title, {
      x: 0.5,
      y: 0.35,
      w: 12.2,
      h: 0.35,
      fontFace: "Aptos",
      fontSize: 18,
      bold: true,
      color: "F8FAFC",
    });
    slide.addText(chart.description || `Chart ${index + 1}`, {
      x: 0.5,
      y: 0.72,
      w: 12.2,
      h: 0.3,
      fontFace: "Aptos",
      fontSize: 10,
      color: "94A3B8",
    });
    slide.addImage({
      data: chart.imageBase64,
      x: 0.55,
      y: 1.1,
      w: 12.1,
      h: 5.9,
    });
  });

  const buffer = await pptx.write({ outputType: "nodebuffer" });
  return toBuffer(buffer);
}

async function createExcelBuffer({ dataset, columns, rows, charts }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "VizSmith AI";
  workbook.created = new Date();

  const summarySheet = workbook.addWorksheet("Summary");
  summarySheet.columns = [
    { header: "Field", key: "field", width: 24 },
    { header: "Value", key: "value", width: 50 },
  ];
  summarySheet.addRows([
    { field: "File name", value: dataset.file_name },
    {
      field: "Uploaded at",
      value: formatMoment(dataset.uploaded_at || dataset.created_at),
    },
    { field: "Rows", value: rows.length },
    { field: "Columns", value: columns.length },
    { field: "Charts", value: charts.length },
  ]);

  const dataSheet = workbook.addWorksheet("Data");
  dataSheet.columns = columns.map((column) => ({
    header: column,
    key: column,
    width: Math.min(Math.max(column.length + 4, 14), 28),
  }));
  rows.forEach((row) => {
    dataSheet.addRow(
      Object.fromEntries(
        columns.map((column) => [column, formatCellValue(row[column])]),
      ),
    );
  });
  dataSheet.views = [{ state: "frozen", ySplit: 1 }];

  const chartSheet = workbook.addWorksheet("Charts");
  chartSheet.columns = [
    { header: "Chart", key: "chart", width: 28 },
    { header: "Description", key: "description", width: 48 },
  ];
  chartSheet.addRow({
    chart: "Title",
    description: "Description",
  });

  let currentRow = 2;

  charts.forEach((chart) => {
    chartSheet.getCell(`A${currentRow}`).value = chart.title;
    chartSheet.getCell(`B${currentRow}`).value =
      chart.description || chart.chartType;
    currentRow += 1;

    const imageId = workbook.addImage({
      buffer: chart.image,
      extension: "png",
    });

    chartSheet.addImage(imageId, {
      tl: { col: 0, row: currentRow - 1 },
      ext: { width: 920, height: 520 },
    });

    currentRow += 26;
  });

  const value = await workbook.xlsx.writeBuffer();
  return toBuffer(value);
}

export async function buildExportFile({
  dataset,
  format,
  columns,
  rows,
  charts,
}) {
  const renderedCharts = await createChartImages(charts);

  if (format === "pdf") {
    return {
      buffer: await createPdfBuffer({
        dataset,
        columns,
        rows,
        charts: renderedCharts,
      }),
      contentType: "application/pdf",
      extension: "pdf",
    };
  }

  if (format === "ppt") {
    return {
      buffer: await createPptBuffer({
        dataset,
        columns,
        rows,
        charts: renderedCharts,
      }),
      contentType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      extension: "pptx",
    };
  }

  if (format === "excel") {
    return {
      buffer: await createExcelBuffer({
        dataset,
        columns,
        rows,
        charts: renderedCharts,
      }),
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      extension: "xlsx",
    };
  }

  throw new Error("Unsupported export format");
}
