"use client";

import Navbar from "./Components/Home/Navbar";
import HeroSection from "./Components/Home/HeroSection";
import Footer from "./Components/Home/Footer";
import AnimatedCharts from "./Components/AnimatedCharts";

export default function HomePage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050816] text-white">
      <div className="absolute inset-0 -z-10">
        <div className="absolute left-[-120px] top-[-100px] h-[420px] w-[420px] rounded-full bg-[#4F46E5]/20 blur-[140px]" />
        <div className="absolute right-[-100px] top-[120px] h-[360px] w-[360px] rounded-full bg-[#7C3AED]/20 blur-[140px]" />
        <div className="absolute bottom-[-120px] left-[30%] h-[420px] w-[420px] rounded-full bg-[#06B6D4]/10 blur-[160px]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(79,70,229,0.12),transparent_45%)]" />
      </div>

      <AnimatedCharts
        layout="landing"
        className="pointer-events-none absolute inset-0 z-0"
      />

      <div className="relative z-10 mx-auto max-w-7xl px-4 pb-8 pt-6 md:px-8 lg:px-10">
        <Navbar />
        <HeroSection />
        <Footer />
      </div>
    </main>
  );
}
