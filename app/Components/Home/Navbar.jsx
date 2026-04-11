"use client";
import { usePathname } from "next/navigation";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Sparkles } from "lucide-react";
import useAuth from "@/hooks/useAuth";
import { useRouter } from "next/navigation";
import { createSupabaseClient } from "@/lib/supabase";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export default function Navbar() {
  const supabase = createSupabaseClient();
  const pathname = usePathname();
  const { user } = useAuth();
  const router = useRouter();
  const [logoutOpen, setLogoutOpen] = useState(false);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("Logout failed:", error.message);
      return;
    }

    router.push("/login");
    router.refresh();
    setLogoutOpen(false);
  };

  if (pathname !== "/") return null;

  return (
    <header className="bg-transparent w-full flex items-center justify-between py-2 mb-5">
      <Link
        href="/"
        className="text-sm md:text-base font-semibold tracking-tight text-white"
      >
        <span className="flex items-center gap-2">
          <strong className="text-5xl">VizSmith AI</strong>
          <Sparkles className="w-4 h-4" />
        </span>
      </Link>

      {/* Right Actions */}
      <div className="flex items-center gap-4">
        {!user ? (
          <div className="flex items-center justify-between">
            <div className="mr-5 flex items-center gap-10">
              <Button
                size="icon"
                variant="ghost"
                className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/5"
              >
                <Link href="/signup">Sign Up</Link>
              </Button>

              <Button
                size="icon"
                variant="ghost"
                className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-white/10"
              >
                <Link href="/login">Log In</Link>
              </Button>
            </div>
          </div>
        ) : (
          <>
            <Dialog open={logoutOpen} onOpenChange={setLogoutOpen}>
              <DialogTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="p-2 w-full rounded-xl  text-white py-3 font-medium  transition"
                >
                  Log Out
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Confirm logout</DialogTitle>
                  <DialogDescription>
                    Are you sure you want to log out?
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Cancel</Button>
                  </DialogClose>
                  <Button variant="destructive" onClick={handleLogout}>
                    Log Out
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
      </div>
    </header>
  );
}
