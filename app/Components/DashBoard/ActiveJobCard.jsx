export default function ActiveJobsCard() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <p className="text-xs uppercase tracking-[0.2em] text-white/50">Active Jobs</p>

      <div className="mt-6 space-y-6">
        <div>
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Market_Trend_A.json</span>
            <span className="text-cyan-400">74%</span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full w-[74%] bg-cyan-400 rounded-full" />
          </div>
          <p className="mt-2 text-xs text-white/50">Processing tensors...</p>
        </div>

        <div>
          <p className="font-medium text-white/70">User_Feedback_Queue</p>
          <p className="text-xs text-white/50 mt-1">In queue (Pos #3)</p>
        </div>
      </div>
    </div>
  );
}