"use client";
import Navbar from "./Components/Home/Navbar";
import HeroSection from "./Components/Home/HeroSection";
import StatsStrip from "./Components/Home/HeroVisuals";
import Footer from "./Components/Home/Footer";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#050816] text-white overflow-hidden relative">
      {/* Background */}
      <div className="absolute inset-0 -z-10">
        {/* deep radial glows */}
        <div className="absolute top-[-100px] left-[-120px] w-[420px] h-[420px] bg-[#4F46E5]/20 blur-[140px] rounded-full" />
        <div className="absolute top-[120px] right-[-100px] w-[360px] h-[360px] bg-[#7C3AED]/20 blur-[140px] rounded-full" />
        <div className="absolute bottom-[-120px] left-[30%] w-[420px] h-[420px] bg-[#06B6D4]/10 blur-[160px] rounded-full" />

        {/* subtle center lighting */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(79,70,229,0.12),transparent_45%)]" />
      </div>

      <div className="max-w-7xl mx-auto px-4 md:px-8 lg:px-10 pt-6">
         <Navbar />
        <HeroSection />
        <Footer />
      </div>
    </main>
  );
}
