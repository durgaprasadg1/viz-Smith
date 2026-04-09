export default function UsageBanner() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
      <div className="flex items-center gap-4 w-full">
        <div className="w-40 h-2 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full w-[80%] bg-cyan-400 rounded-full" />
        </div>
        <p className="text-white/80">
          You&apos;re at <span className="text-cyan-400 font-semibold">80%</span> of your free tier limits.
          Upgrade for unlimited exports.
        </p>
      </div>

      <button className="rounded-xl border border-white/20 px-5 py-3 text-sm font-medium hover:bg-white/10 transition">
        Upgrade Now
      </button>
    </div>
  );
}