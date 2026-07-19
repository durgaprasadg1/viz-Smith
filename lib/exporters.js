import { jsPDF } from "jspdf";

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

function formatMoment(value) {
  if (!value) return "Unavailable";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";

  return format(date, "dd MMM yyyy, hh:mm a");
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

  
  throw new Error("Unsupported export format");
}
