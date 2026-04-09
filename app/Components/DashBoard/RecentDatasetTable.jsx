import Link from "next/link";
import StatusBadge from "./StatusBadge";

export default function RecentDatasetsTable({ datasets = [], loading = false }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-5 border-b border-white/10">
        <h2 className="text-3xl font-semibold">Recent Datasets</h2>
        <Link href="/history" className="text-sm text-white/70 hover:text-white transition">
          View All
        </Link>
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
            {loading ? (
              Array.from({ length: 4 }).map((_, index) => (
                <tr key={index} className="border-t border-white/10">
                  <td className="px-6 py-5">
                    <div className="space-y-2">
                      <div className="h-4 w-44 rounded bg-white/10" />
                      <div className="h-3 w-20 rounded bg-white/10" />
                    </div>
                  </td>
                  <td className="px-6 py-5">
                    <div className="h-6 w-24 rounded-full bg-white/10" />
                  </td>
                  <td className="px-6 py-5">
                    <div className="h-4 w-24 rounded bg-white/10" />
                  </td>
                </tr>
              ))
            ) : datasets.length ? (
              datasets.map((file) => (
                <tr
                  key={file.id || file.name}
                  className="border-t border-white/10 hover:bg-white/[0.03] transition"
                >
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
              ))
            ) : (
              <tr className="border-t border-white/10">
                <td className="px-6 py-10 text-sm text-white/55" colSpan={3}>
                  No uploaded datasets yet. Your recent files will appear here.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
