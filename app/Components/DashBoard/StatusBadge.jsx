export default function StatusBadge({ status }) {
  const styles = {
    COMPLETE: "bg-emerald-500/15 text-emerald-400",
    PROCESSING: "bg-indigo-500/15 text-indigo-300",
    FAILED: "bg-rose-500/15 text-rose-300",
  };

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-medium ${styles[status] || "bg-white/10 text-white/70"}`}>
      {status}
    </span>
  );
}