function toLabel(status) {
  if (status === "processing" || status === "uploaded") return "PROCESSING";
  if (status === "ready") return "COMPLETE";
  if (status === "failed") return "FAILED";
  return String(status || "UNKNOWN").toUpperCase();
}

export default function ActiveJobsCard({
  loading = false,
  processingDatasets = [],
  failedCount = 0,
}) {
  const topProcessing = processingDatasets.slice(0, 2);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <p className="text-xs uppercase tracking-[0.2em] text-white/50">Active Jobs</p>

      <div className="mt-6 space-y-6">
        {loading ? (
          <div className="space-y-3">
            <div className="h-4 w-32 rounded bg-white/10" />
            <div className="h-2 w-full rounded bg-white/10" />
            <div className="h-4 w-40 rounded bg-white/10" />
          </div>
        ) : topProcessing.length ? (
          topProcessing.map((dataset, index) => (
            <div key={dataset.id || `${dataset.file_name}-${index}`}>
              <div className="flex items-center justify-between text-sm gap-4">
                <span className="font-medium truncate">{dataset.file_name}</span>
                <span className="text-cyan-400">{toLabel(dataset.status)}</span>
              </div>
              <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
                <div className="h-full w-[68%] bg-cyan-400 rounded-full" />
              </div>
              <p className="mt-2 text-xs text-white/50">
                Processing dataset for charts and export assets.
              </p>
            </div>
          ))
        ) : (
          <div>
            <p className="font-medium text-white/80">No active jobs</p>
            <p className="text-xs text-white/50 mt-1">
              New uploads will appear here while they are processing.
            </p>
          </div>
        )}

        <div>
          <p className="font-medium text-white/70">Failed jobs</p>
          <p className="text-xs text-white/50 mt-1">
            {failedCount} dataset{failedCount === 1 ? "" : "s"} need attention.
          </p>
        </div>
      </div>
    </div>
  );
}
