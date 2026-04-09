"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseClient } from "@/lib/supabase";
import useAuth from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

const supabase = createSupabaseClient();

export default function UploadFile() {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [accessToken, setAccessToken] = useState(null);

  useEffect(() => {
    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setAccessToken(data.session?.access_token ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setAccessToken(session?.access_token ?? null);
      },
    );

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const canUpload = useMemo(() => {
    return !authLoading && Boolean(user) && Boolean(accessToken);
  }, [authLoading, user, accessToken]);

  async function handleUpload(e) {
    e.preventDefault();
    setMessage("");

    if (!canUpload) {
      setMessage("Please sign in to upload files.");
      return;
    }

    setLoading(true);

    const form = e.currentTarget;
    const input = form.elements.namedItem("file");

    if (!input?.files?.[0]) {
      setMessage("Please select a file");
      setLoading(false);
      return;
    }

    const formData = new FormData();
    formData.append("file", input.files[0]);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error || "Upload failed");
      } else {
        setMessage("Upload successful");
        form.reset();
      }
    } catch (error) {
      setMessage("Something went wrong");
    }

    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-[#0B1020] text-white flex items-center justify-center px-4 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute top-[-140px] left-[-120px] w-[360px] h-[360px] bg-[#22D3EE]/15 blur-[140px] rounded-full" />
        <div className="absolute top-[160px] right-[-120px] w-[320px] h-[320px] bg-[#F472B6]/15 blur-[140px] rounded-full" />
        <div className="absolute bottom-[-100px] left-[25%] w-[360px] h-[360px] bg-[#8B5CF6]/10 blur-[160px] rounded-full" />
      </div>

      <Card className="w-full max-w-xl border border-white/10 bg-white/5 backdrop-blur rounded-3xl shadow-[0_30px_120px_-60px_rgba(34,211,238,0.6)]">
        <CardHeader className="space-y-2">
          <CardTitle className="text-3xl font-bold tracking-tight">
            Upload dataset
          </CardTitle>
          <p className="text-sm text-white/70">
            Upload a CSV or XLSX file to start analyzing your data.
          </p>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleUpload} className="space-y-5">
            <div className="space-y-2">
              <Input
                type="file"
                name="file"
                accept=".csv,.xlsx"
                className="bg-white/5 border-white/10 text-white file:text-white file:bg-white/10 file:border-0 file:rounded file:px-3 file:py-1"
              />
              <p className="text-xs text-white/60">
                Supported: .csv, .xlsx. Max size: 50MB.
              </p>
            </div>

            <Button
              type="submit"
              disabled={loading || !canUpload}
              className="w-full bg-gradient-to-r from-[#22D3EE] via-[#8B5CF6] to-[#F472B6] text-slate-950 font-semibold hover:opacity-90"
            >
              {loading ? "Uploading..." : "Upload File"}
            </Button>

            {!canUpload && !authLoading ? (
              <p className="text-sm text-amber-200/90">
                Sign in to enable uploads.
              </p>
            ) : null}

            {message ? (
              <p className="text-sm text-white/80">{message}</p>
            ) : null}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
