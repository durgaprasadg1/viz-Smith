import Link from "next/link";
import { Separator } from "@/components/ui/separator";

export default function Footer() {
  return (
    <footer className="mt-10 mb-6">
      <div className="rounded-[28px] border border-white/10 bg-white/5 backdrop-blur-xl px-6 md:px-8 py-6 shadow-[0_15px_50px_rgba(0,0,0,0.28)]">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-white">VizSmith</h3>
            <p className="text-sm text-slate-400 mt-1">
              AI-powered visual analytics for modern teams.
            </p>
          </div>

          <div className="flex flex-wrap gap-5 text-sm text-slate-300">
            <Link href="/privacy" className="hover:text-white transition">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-white transition">
              Terms
            </Link>
            <Link href="/support" className="hover:text-white transition">
              Support
            </Link>
            <Link href="/contact" className="hover:text-white transition">
              Contact
            </Link>
          </div>
        </div>

        <Separator className="my-5 bg-white/10" />

        <p className="text-xs text-slate-500 text-center md:text-left">
          © {new Date().getFullYear()} VizSmith. All rights reserved.
        </p>
      </div>
    </footer>
  );
}