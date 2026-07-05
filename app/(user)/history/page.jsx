"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNow } from "date-fns";
import {
  CalendarDays,
  Download,
  FileText,
  History,
  Presentation,
  UploadCloud,
} from "lucide-react";

import DashboardLayout from "../../Components/DashBoard/DashboardLayout";
import DataTable from "../../Components/User/Table";
import { Button } from "@/components/ui/button";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import useAuth from "@/hooks/useAuth";
import { createSupabaseClient } from "@/lib/supabase";
import { toast } from "sonner";

const supabase = createSupabaseClient();

function formatDate(value) {
  if (!value) return "Unavailable";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";

  return format(date, "dd MMM yyyy");
}

function formatUploadMoment(value) {
  if (!value) return "Unavailable";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";

  return `${format(date, "hh:mm a")} · ${formatDistanceToNow(date, {
    addSuffix: true,
  })}`;
}

function parseFilenameFromDisposition(disposition) {
  if (!disposition) return null;

  const utfMatch = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utfMatch?.[1]) {
    try {
      return decodeURIComponent(utfMatch[1]);
    } catch {
      return utfMatch[1];
    }
  }

  const regularMatch = disposition.match(/filename="?([^";]+)"?/i);
  if (regularMatch?.[1]) return regularMatch[1];

  return null;
}

function extensionFromFormat(format) {
  if (format === "ppt") return "pptx";
  return "pdf";
}

const EXPORT_OPTIONS = [
  {
    format: "pdf",
    title: "Export as PDF",
    subtitle: "Report style document with complete table and all charts",
    icon: FileText,
  },
  
];

export default function HistoryPage() {
  const { user, loading: authLoading } = useAuth();
  const [historyRows, setHistoryRows] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [error, setError] = useState("");
  const [accessToken, setAccessToken] = useState(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState(null);
  const [exportingFormat, setExportingFormat] = useState("");

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

  useEffect(() => {
    let active = true;

    async function fetchHistory() {
      if (authLoading) return;

      if (!user) {
        if (!active) return;
        setHistoryRows([]);
        setError("Please sign in to view upload history.");
        setLoadingHistory(false);
        return;
      }

      if (!accessToken) {
        if (!active) return;
        setHistoryRows([]);
        setError("Please sign in again to view upload history.");
        setLoadingHistory(false);
        return;
      }

      setLoadingHistory(true);
      setError("");

      const response = await fetch("/api/user/history", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      });

      const payload = await response.json().catch(() => ({}));

      if (!active) return;

      if (!response.ok) {
        setHistoryRows([]);
        setError(payload?.error || "Unable to load history.");
        setLoadingHistory(false);
        return;
      }

      const mappedRows = (payload?.items || []).map((item) => ({
        id: item.id,
        date: item.created_at || item.uploaded_at || "",
        uploadedAt: item.uploaded_at || item.created_at || "",
        fileName: item.file_name,
        dateLabel: formatDate(item.created_at || item.uploaded_at),
        uploadedLabel: formatUploadMoment(item.uploaded_at || item.created_at),
        statusLabel: item.status ? String(item.status).toUpperCase() : "READY",
      }));

      setHistoryRows(mappedRows);
      setLoadingHistory(false);
    }

    fetchHistory();

    return () => {
      active = false;
    };
  }, [accessToken, authLoading]);

  const openExportDialog = useCallback((dataset) => {
    setSelectedDataset(dataset);
    setExportDialogOpen(true);
  }, []);

  const handleExport = useCallback(
    async (format) => {
      if (!selectedDataset?.id) {
        toast.error("Select a dataset first.");
        return;
      }

      if (!accessToken) {
        toast.error("Please sign in again before exporting.");
        return;
      }

      setExportingFormat(format);

      try {
        const response = await fetch("/api/export", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            datasetId: selectedDataset.id,
            format,
          }),
        });

        if (!response.ok) {
          let message = "Export failed";
          try {
            const payload = await response.json();
            message = payload?.error || message;
          } catch {}

          throw new Error(message);
        }

        const blob = await response.blob();
        const disposition = response.headers.get("content-disposition");
        const headerFileName = parseFilenameFromDisposition(disposition);

        const fallbackBaseName = String(selectedDataset.fileName || "dataset")
          .replace(/\.[^/.]+$/, "")
          .replace(/[^a-zA-Z0-9._-]/g, "_");

        const downloadName =
          headerFileName ||
          `${fallbackBaseName}.${extensionFromFormat(format)}`;

        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = downloadName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(blobUrl);

        toast.success(`Exported ${downloadName}`);
        setExportDialogOpen(false);
      } catch (exportError) {
        toast.error(exportError?.message || "Unable to export this dataset.");
      } finally {
        setExportingFormat("");
      }
    },
    [accessToken, selectedDataset],
  );

  const columns = useMemo(
    () => [
      {
        accessorKey: "date",
        header: "Date",
        sortingFn: "datetime",
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-cyan-200">
              <CalendarDays className="h-4 w-4" />
            </span>
            <div>
              <p className="font-medium text-white">{row.original.dateLabel}</p>
              <p className="text-xs text-white/45">Created record</p>
            </div>
          </div>
        ),
      },
      {
        accessorKey: "uploadedAt",
        header: "Date Of Uploading",
        sortingFn: "datetime",
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-white">
              {row.original.uploadedLabel}
            </p>
            <p className="text-xs text-white/45">Upload timestamp</p>
          </div>
        ),
      },
      {
        accessorKey: "fileName",
        header: "Filename",
        cell: ({ row }) => (
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-pink-200">
              <FileText className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium text-white">
                {row.original.fileName}
              </p>
              <p className="text-xs text-white/45">
                {row.original.statusLabel}
              </p>
            </div>
          </div>
        ),
      },
      {
        id: "action",
        header: "Action",
        enableSorting: false,
        cell: ({ row }) => (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-white/10 bg-white/5 text-white hover:bg-white/10"
            onClick={() => openExportDialog(row.original)}
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
        ),
      },
    ],
    [openExportDialog],
  );

  const isLoading = authLoading || loadingHistory;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 shadow-[0_32px_120px_-64px_rgba(34,211,238,0.45)] backdrop-blur">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-cyan-100/90">
                <History className="h-3.5 w-3.5" />
                Upload archive
              </div>
              <div>
                <h1 className="text-3xl font-semibold tracking-tight text-white">
                  History
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-white/65">
                  Every uploaded dataset lives here with instant export options
                  for PDF and PPT output.
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-[#0c142a] px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-white/40">
                  Total uploads
                </p>
                <p className="mt-2 text-2xl font-semibold text-white">
                  {historyRows.length}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#0c142a] px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-white/40">
                  Export status
                </p>
                <p className="mt-2 text-sm font-medium text-white/70">Active</p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-[#091223]/80 p-6 backdrop-blur">
          {isLoading ? (
            <div className="flex min-h-80 flex-col items-center justify-center gap-3 text-center">
              <Spinner className="size-6 text-cyan-200" />
              <div>
                <p className="font-medium text-white">Loading history</p>
                <p className="text-sm text-white/55">
                  Pulling your uploaded datasets from the archive.
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="flex min-h-80 flex-col items-center justify-center gap-3 rounded-3xl border border-rose-300/15 bg-rose-300/5 px-6 text-center">
              <UploadCloud className="h-8 w-8 text-rose-200" />
              <div>
                <p className="font-medium text-white">History unavailable</p>
                <p className="text-sm text-white/60">{error}</p>
              </div>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={historyRows}
              colorVariant="midnight"
              searchPlaceholder="Search by filename or date..."
              emptyMessage="No uploads yet. Your dataset history will appear here after your first upload."
            />
          )}
        </div>
      </div>

      <Dialog
        open={exportDialogOpen}
        onOpenChange={(open) => {
          setExportDialogOpen(open);
          if (!open) {
            setSelectedDataset(null);
            setExportingFormat("");
          }
        }}
      >
        <DialogContent className="border border-white/10 bg-[#0a1328] text-white sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Export dataset</DialogTitle>
            <DialogDescription className="text-white/65">
              Choose a format. Each export includes the complete table (all rows
              and columns) and all generated chart visualizations.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">
            <p className="font-medium text-white">
              {selectedDataset?.fileName}
            </p>
            <p className="text-xs text-white/55">
              Uploaded {selectedDataset?.uploadedLabel || "recently"}
            </p>
          </div>

          <div className="grid gap-3">
            {EXPORT_OPTIONS.map((option) => {
              const Icon = option.icon;
              const isCurrent = exportingFormat === option.format;

              return (
                <Button
                  key={option.format}
                  type="button"
                  variant="outline"
                  className="h-auto justify-start border-white/10 bg-white/5 px-4 py-3 text-left text-white hover:bg-white/10"
                  disabled={Boolean(exportingFormat) || !selectedDataset}
                  onClick={() => handleExport(option.format)}
                >
                  <span className="mr-3 flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="flex flex-col items-start">
                    <span className="text-sm font-medium">
                      {isCurrent ? "Exporting..." : option.title}
                    </span>
                    <span className="text-xs text-white/60">
                      {option.subtitle}
                    </span>
                  </span>
                </Button>
              );
            })}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className="text-white/70 hover:bg-white/10 hover:text-white"
              onClick={() => setExportDialogOpen(false)}
              disabled={Boolean(exportingFormat)}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
