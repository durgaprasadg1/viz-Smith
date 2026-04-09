"use client";
import {
  LayoutDashboard,
  Upload,
  History,
  Share2,
  Settings,
  HelpCircle,
  LogOut,
  Sparkles,
} from "lucide-react";
import SidebarNavItem from "../DashBoard/SidebarNavItem";
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

import { Button } from "@/components/ui/button";
import { createSupabaseClient } from "@/lib/supabase";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/dashboard" },
  { icon: Upload, label: "Upload", href: "/upload" },
  { icon: History, label: "History", href: "/history" },
  { icon: Share2, label: "Export Center", href: "/exports" },
];

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createSupabaseClient();
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
  return (
    <aside className="w-[280px] min-h-screen border-r border-white/10 bg-[#040918] px-6 py-6 flex flex-col">
      <div>
        <span className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">VizSmith AI</h1>
          <Sparkles className="w-4 h-4" />
        </span>
      </div>

      <nav className="mt-8 space-y-2">
        {navItems.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);

          return <SidebarNavItem key={item.label} {...item} active={active} />;
        })}
      </nav>

      <Dialog open={logoutOpen} onOpenChange={setLogoutOpen}>
        <DialogTrigger asChild>
          <Button
            size="icon"
            variant="ghost"
            className="mt-8 w-full rounded-xl bg-gray-600 text-white py-3 font-medium hover:bg-black transition"
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

      <div className="mt-auto space-y-2 pt-10"></div>
    </aside>
  );
}
