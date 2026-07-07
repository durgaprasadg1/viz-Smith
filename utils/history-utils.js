import { format, formatDistanceToNow } from "date-fns";

export function formatDate(value) {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? format(date, "dd MMM yyyy") : "Unavailable";
}

export function formatUploadMoment(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "Unavailable";
  return `${format(date, "hh:mm a")} · ${formatDistanceToNow(date, { addSuffix: true })}`;
}

export function parseFilenameFromDisposition(disposition) {
  if (!disposition) return null;
  const utfMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) {
    try { return decodeURIComponent(utfMatch[1]); } catch { return utfMatch[1]; }
  }
  return disposition.match(/filename="?([^";]+)"?/i)?.[1] || null;
}

export function extensionFromFormat(format) {
  return format === "ppt" ? "pptx" : "pdf";
}

export function mapHistoryItem(item) {
  return {
    id: item.id,
    date: item.created_at || item.uploaded_at || "",
    uploadedAt: item.uploaded_at || item.created_at || "",
    fileName: item.file_name,
    dateLabel: formatDate(item.created_at || item.uploaded_at),
    uploadedLabel: formatUploadMoment(item.uploaded_at || item.created_at),
    statusLabel: item.status ? String(item.status).toUpperCase() : "READY",
  };
}


