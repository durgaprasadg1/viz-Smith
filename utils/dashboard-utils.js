export function formatFileSize(bytes) {
  if (!Number.isFinite(Number(bytes))) return "Unknown size";
  const numeric = Number(bytes);
  if (numeric < 1024) return `${numeric} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = numeric / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`;
}

export function toDashboardStatus(status) {
  if (status === "ready") return "COMPLETE";
  if (status === "failed") return "FAILED";
  if (status === "processing" || status === "uploaded") return "PROCESSING";
  return String(status || "UNKNOWN").toUpperCase();
}

export function getDisplayName(user) {
  if (!user) return "there";
  const metadataName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.user_metadata?.display_name;
  if (metadataName) return metadataName;
  if (user.email) return user.email.split("@")[0];
  return "there";
}
