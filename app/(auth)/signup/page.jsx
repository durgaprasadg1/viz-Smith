"use client";

import { useState } from "react";
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
import { createSupabaseClient, providers } from "@/lib/supabase";
import AnimatedCharts from "@/app/Components/AnimatedCharts";
import { ChevronLeft } from "lucide-react";
import { FcGoogle } from "react-icons/fc";
import { FaGithub } from "react-icons/fa";
import useAuthenticatedRedirect from "@/hooks/useAuthenticatedRedirect";
import { getErrorMessage, updateFormField } from "../../../utils/auth-form-utils";

const supabase = createSupabaseClient();

export default function SignupPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
  });
  const [loading, setLoading] = useState(false);

  useAuthenticatedRedirect(supabase, router);

  const handleChange = (event) => updateFormField(setFormData, event);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
        }),
      });

      const payload = await res.json();

      if (!res.ok) {
        toast.error(payload?.error ?? "Signup failed");
        return;
      }

      if (payload?.requiresEmailConfirmation) {
        toast.success("Check your email to confirm your account");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });

      if (signInError) {
        toast.error(signInError.message ?? "Login failed after signup");
        return;
      }

      toast.success("Account created and signed in");
      router.replace("/");
    } catch (error) {
      console.error("Signup error:", error);
      toast.error(getErrorMessage(error, "Something went wrong"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0B1020] px-4 text-white">
      <div className="absolute inset-0 -z-10">
        <div className="absolute left-[-120px] top-[-90px] h-[330px] w-[330px] rounded-full bg-[#8B5CF6]/20 blur-[120px]" />
        <div className="absolute right-[-100px] top-[170px] h-[280px] w-[280px] rounded-full bg-[#22D3EE]/20 blur-[120px]" />
        <div className="absolute bottom-[-90px] left-[30%] h-[350px] w-[350px] rounded-full bg-[#F472B6]/10 blur-[140px]" />
      </div>

      <Button
        type="Button"
        onClick={() => router.back()}
        className="absolute left-6 top-6 z-30 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/85 transition hover:bg-white/10 hover:text-white"
      >
        <ChevronLeft className="mr-1 h-4 w-4" />
        Back
      </Button>

      <AnimatedCharts
        layout="signup"
        className="pointer-events-none absolute inset-0 z-0"
      />

      <Card className="relative z-20 w-full max-w-md rounded-3xl border border-white/10 bg-white/5 shadow-[0_30px_120px_-60px_rgba(34,211,238,0.6)] backdrop-blur">
        <CardHeader className="space-y-2 text-center">
          <CardTitle className="text-3xl font-bold tracking-tight">
            Create Account
          </CardTitle>
          <CardDescription className="text-white/70">
            Sign up to get started
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-white/80">
                Full Name
              </Label>
              <Input
                id="name"
                name="name"
                type="text"
                placeholder="Enter your name"
                value={formData.name}
                onChange={handleChange}
                required
                className="border-white/10 bg-white/5 text-white placeholder:text-white/40 focus-visible:ring-[#22D3EE]/40"
              />
            </div>

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
                className="border-white/10 bg-white/5 text-white placeholder:text-white/40 focus-visible:ring-[#22D3EE]/40"
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
                placeholder="Create a password"
                value={formData.password}
                onChange={handleChange}
                required
                className="border-white/10 bg-white/5 text-white placeholder:text-white/40 focus-visible:ring-[#22D3EE]/40"
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-[#22D3EE] via-[#8B5CF6] to-[#F472B6] font-semibold text-slate-950 hover:opacity-90"
              disabled={loading}
            >
              {loading ? "Creating account..." : "Sign Up"}
            </Button>

            <div className=" space-y-3">
              <Button
                type="Button"
                onClick={() => providers.signInWithGoogle()}
                className="w-full flex items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/8"
              >
                <FcGoogle className="h-5 w-5" />
                Continue with Google
              </Button>

              <Button
                type="Button"
                onClick={() => providers.signInWithGitHub()}
                className="w-full flex items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-white hover:bg-white/8"
              >
                <FaGithub className="h-5 w-5" />
                Continue with GitHub
              </Button>
            </div>
          </form>

          <p className="mt-6 text-center text-sm text-white/70">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-white hover:text-[#22D3EE]"
            >
              Login
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
