// export default function UsageBanner({ used = 0, limit = 10 }) {
//   const safeLimit = Math.max(limit, 1);
//   const percent = Math.min(Math.round((used / safeLimit) * 100), 100);

//   return (
//     <div className="rounded-2xl border border-white/10 bg-white/5 px-6 py-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
//       <div className="flex items-center gap-4 w-full">
//         <div className="w-40 h-2 rounded-full bg-white/10 overflow-hidden">
//           <div
//             className="h-full bg-cyan-400 rounded-full transition-all"
//             style={{ width: `${percent}%` }}
//           />
//         </div>
//         <p className="text-white/80">
//           You&apos;re at{" "}
//           <span className="text-cyan-400 font-semibold">{percent}%</span> of
//           your free tier limits.
//           <span className="text-white/55"> {used} of {safeLimit} uploads used.</span>
//         </p>
//       </div>

//       <button className="rounded-xl border border-white/20 px-5 py-3 text-sm font-medium hover:bg-white/10 transition">
//         Upgrade Soon
//       </button>
//     </div>
//   );
// }
