"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { createSupabaseClient } from "@/lib/supabase";
import Navbar from "@/app/Components/Home/Navbar";

const supabase = createSupabaseClient();

export default function LoginPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      if (data.session) {
        router.replace("/dashboard");
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session) {
          router.replace("/dashboard");
        }
      },
    );

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, [router]);

  const handleChange = (e) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword(formData);

      if (error) {
        toast.error(error.message ?? "Login failed");
        return;
      }

      toast.success("Logged in successfully");
      router.replace("/dashboard");
    } catch (error) {
      console.error("Login error:", error);
      toast.error(error?.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
   
    <div className="min-h-screen bg-[#0B1020] text-white flex items-center justify-center px-4 relative overflow-hidden">
      
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-[-120px] left-[-100px] w-[320px] h-[320px] bg-[#8B5CF6]/20 blur-[120px] rounded-full" />
        <div className="absolute top-[180px] right-[-100px] w-[280px] h-[280px] bg-[#22D3EE]/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-80px] left-[30%] w-[350px] h-[350px] bg-[#F472B6]/10 blur-[140px] rounded-full" />
      </div>

      <Card className="w-full max-w-md shadow-[0_30px_120px_-60px_rgba(34,211,238,0.6)] rounded-3xl border border-white/10 bg-white/5 backdrop-blur">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-3xl font-bold tracking-tight">
            Login
          </CardTitle>
          <CardDescription className="text-white/70">
            Enter your credentials to access your account
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-white/80">
                Email
              </Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                value={formData.email}
                onChange={handleChange}
                required
                className="bg-white/5 border-white/10 text-white placeholder:text-white/40 focus-visible:ring-[#22D3EE]/40"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-white/80">
                Password
              </Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="Enter your password"
                value={formData.password}
                onChange={handleChange}
                required
                className="bg-white/5 border-white/10 text-white placeholder:text-white/40 focus-visible:ring-[#22D3EE]/40"
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-[#22D3EE] via-[#8B5CF6] to-[#F472B6] text-slate-950 font-semibold hover:opacity-90"
              disabled={loading}
            >
              {loading ? "Logging in..." : "Login"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-white/70">
            Don&apos;t have an account?{" "}
            <Link
              href="/signup"
              className="font-medium text-white hover:text-[#22D3EE]"
            >
              Sign up
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
     </>
  );
}
