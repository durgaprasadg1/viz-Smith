"use client";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";

import { Sparkles } from "lucide-react";
import useAuth from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase";
export default function Navbar() {
  const supabase = createSupabaseClient();
  const { user } = useAuth();
  const router = useRouter();

  return (
    <header className="bg-transparent w-full flex items-center justify-between py-2 mb-5">
      <Link
        href="/"
        className="text-sm md:text-base font-semibold tracking-tight text-white"
      >
        {!user && (
          <span className="flex items-center gap-2">
            <strong className="text-5xl">VizSmith AI</strong>
            <Sparkles className="w-4 h-4" />
          </span>
        )}
      </Link>

      {/* Right Actions */}
      <div className="flex items-center gap-4">
        {!user ? (
          <div className="flex items-center justify-between">
            <div className="mr-5 flex items-center gap-10">
              <Button
                size="icon"
                variant="ghost"
                className="rounded-full text-slate-400 hover:text-white hover:bg-white/5"
              >
                <Link href="/signup">Sign Up</Link>
              </Button>

              <Button
                size="icon"
                variant="ghost"
                className="rounded-full text-slate-400 hover:text-white hover:bg-white/10"
              >
                <Link href="/login">Log In</Link>
              </Button>
            </div>
          </div>
        ) : (
          <></>
        )}
      </div>
    </header>
  );
}
