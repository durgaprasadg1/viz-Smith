import Image from "next/image";
import { Badge } from "@/components/ui/badge";

export default function DistortedImageCard() {
  return (
    <div className="relative w-full max-w-[520px] h-[420px] flex items-center justify-center">
      {/* Glow */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#8B5CF6]/25 via-[#22D3EE]/15 to-[#F472B6]/20 blur-3xl rounded-full scale-90" />

      {/* Distorted Shell */}
      <div
        className="
          relative w-[360px] md:w-[420px] h-[320px] md:h-[360px]
          rounded-[38%_62%_52%_48%/42%_38%_62%_58%]
          border border-white/10
          bg-gradient-to-br from-white/10 to-white/5
          backdrop-blur-2xl
          shadow-[0_20px_80px_rgba(0,0,0,0.35)]
          rotate-[10deg]
          overflow-hidden
        "
      >
        {/* Soft overlay */}
        <div className="absolute inset-0 bg-gradient-to-tr from-[#8B5CF6]/10 via-transparent to-[#22D3EE]/10" />

        {/* Decorative blobs */}
        <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full border border-white/10 bg-white/5 blur-sm" />
        <div className="absolute -bottom-10 -left-10 w-28 h-28 rounded-full border border-white/10 bg-white/5 blur-sm" />

        {/* Image */}
        <div className="absolute inset-0 p-6 rotate-[-10deg] scale-105">
          <Image
            src="/image/dv.png"
            alt="AI Data Visualization"
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
            className="object-contain"
            priority
          />
        </div>
      </div>

      {/* Floating Badges */}
      <Badge className="absolute top-6 left-6 rounded-2xl border border-white/10 bg-[#11182D]/80 text-slate-200 backdrop-blur-lg px-4 py-2 hover:bg-[#11182D]/80">
        AI Insights
      </Badge>

      <Badge className="absolute bottom-6 right-6 rounded-2xl border border-white/10 bg-[#11182D]/80 text-slate-200 backdrop-blur-lg px-4 py-2 hover:bg-[#11182D]/80">
        Smart Exports
      </Badge>
    </div>
  );
}