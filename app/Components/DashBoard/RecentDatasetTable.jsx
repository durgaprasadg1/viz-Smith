import StatusBadge from "./StatusBadge";

const datasets = [
  {
    name: "Q4_Revenue_Forecast_v2.csv",
    size: "12.4 MB",
    status: "COMPLETE",
    modified: "2 hours ago",
  },
  {
    name: "Customer_Retention_Raw.json",
    size: "8.1 MB",
    status: "PROCESSING",
    modified: "5 hours ago",
  },
  {
    name: "Alpha_Testing_Metrics.csv",
    size: "1.2 GB",
    status: "COMPLETE",
    modified: "Yesterday",
  },
  {
    name: "Log_Anomalies_June.log",
    size: "450 KB",
    status: "FAILED",
    modified: "Jun 12, 2024",
  },
];

export default function RecentDatasetsTable() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
        <h2 className="text-3xl font-semibold">Recent Datasets</h2>
        <button className="text-sm text-white/70 hover:text-white transition">
          View All
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="text-xs uppercase tracking-[0.18em] text-white/40">
            <tr>
              <th className="px-6 py-4">File Name</th>
              <th className="px-6 py-4">Status</th>
              <th className="px-6 py-4">Modified</th>
            </tr>
          </thead>

          <tbody>
            {datasets.map((file) => (
              <tr key={file.name} className="border-t border-white/10 hover:bg-white/[0.03] transition">
                <td className="px-6 py-5">
                  <div>
                    <p className="font-medium">{file.name}</p>
                    <p className="text-sm text-white/50">{file.size}</p>
                  </div>
                </td>
                <td className="px-6 py-5">
                  <StatusBadge status={file.status} />
                </td>
                <td className="px-6 py-5 text-white/70">{file.modified}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}