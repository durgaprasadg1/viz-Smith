import Image from "next/image";

export default function HeroVisual() {
  return (
    <div className="relative w-full max-w-[620px] h-[520px] flex items-center justify-center">
      {/* Outer ambient glow */}
      <div className="absolute w-[480px] h-[480px] bg-[#8B5CF6]/20 blur-[120px] rounded-full" />
      <div className="absolute bottom-10 right-10 w-[240px] h-[240px] bg-[#06B6D4]/20 blur-[100px] rounded-full" />

      {/* Floating distorted shell */}
      <div
        className="
          relative w-[360px] md:w-[460px] h-[360px] md:h-[430px]
          rounded-[36%_64%_58%_42%/42%_34%_66%_58%]
          border border-white/10
          bg-gradient-to-br from-white/8 to-white/[0.03]
          backdrop-blur-xl
          shadow-[0_30px_100px_rgba(0,0,0,0.45)]
          rotate-[8deg]
          overflow-hidden
        "
      >
        {/* soft highlight overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.08),transparent_30%)]" />
        <div className="absolute inset-0 bg-gradient-to-tr from-[#8B5CF6]/10 via-transparent to-[#06B6D4]/10" />

        {/* image */}
        <div className="absolute inset-0 p-6 md:p-8 -rotate-[8deg] scale-95">
          <Image
            src="/image/dv.png"
            alt="AI Data Visualization"
            fill
            sizes="(max-width: 768px) 90vw, 460px"
            priority
            className="object-contain"
          />
        </div>
      </div>

      {/* floating tiny glass chips */}
      <div className="hero-chip hero-chip--up absolute top-12 left-8 md:left-2 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-lg px-4 py-2 text-sm text-slate-200 shadow-lg">
        AI Insights
      </div>

      <div className="hero-chip hero-chip--down absolute bottom-10 right-8 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-lg px-4 py-2 text-sm text-slate-200 shadow-lg">
        Smart Reports
      </div>

      <div className="hero-chip hero-chip--mid absolute top-1/2 -left-2 md:left-0 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-lg px-4 py-2 text-sm text-slate-200 shadow-lg">
        CSV / XLSX
      </div>
    </div>
  );
}
