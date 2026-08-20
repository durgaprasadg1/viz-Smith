import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import HeroVisual from "./HeroVisuals";

export default function HeroSection() {
  return (
    <section className="relative min-h-[calc(100vh-90px)] flex items-center">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center w-full">
        {/* Left Content */}
        <div className="max-w-3xl pt-10 md:pt-16 lg:pt-0">
          <Badge className="mb-6 rounded-full border border-cyan-400/20 bg-cyan-400/10 text-cyan-300 hover:bg-cyan-400/10 px-3 py-1 text-[11px] tracking-wide uppercase">
            ✦ Now in AI Visualization Beta
          </Badge>

          <h1 className="text-3xl sm:text-5xl md:text-6xl xl:text-5xl font-bold tracking-tight leading-[1.05] text-white">
            Transform Raw Data into
            <span className="block bg-gradient-to-r from-[#C4B5FD] via-[#8B5CF6] to-[#6366F1] bg-clip-text text-transparent">
              Board-Ready Insights
            </span>
          </h1>

          <p className="mt-7 max-w-2xl text-slate-300 text-base md:text-lg leading-8">
            The AI-powered visualization layer for modern teams. Upload your
            spreadsheets, uncover meaningful relationships, and convert raw data
            into polished executive-ready charts and reports.
          </p>

          <div className="mt-10 flex flex-wrap gap-4">
            <Button
              asChild
              size="lg"
              className="h-12 px-7 rounded-xl bg-gradient-to-r from-[#A78BFA] to-[#6366F1] text-white shadow-[0_0_40px_rgba(139,92,246,0.35)] hover:opacity-95"
            >
              <Link href="/dashboard">Start Free Analysis</Link>
            </Button>

            
          </div>
        </div>

        {/* Right Visual */}
        <div className="relative flex justify-center lg:justify-end">
          <HeroVisual />
        </div>
      </div>
    </section>
  );
}