export default function StatCard({ title, value, extra, suffix }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <p className="text-xs uppercase tracking-[0.2em] text-white/50">{title}</p>

      <div className="mt-4 flex items-end gap-2">
        <h3 className="text-5xl font-bold">{value}</h3>
        {suffix && <span className="text-white/50 text-lg mb-1">{suffix}</span>}
        {extra && <span className="text-cyan-400 text-sm mb-2">{extra}</span>}
      </div>
    </div>
  );
}