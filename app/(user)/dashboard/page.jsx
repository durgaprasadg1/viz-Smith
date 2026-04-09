"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";

import DashboardLayout from "../../Components/DashBoard/DashboardLayout";
import UsageBanner from "../../Components/DashBoard/UsageBanner";
import WelcomeHeader from "../../Components/DashBoard/WelcomeHeader";
import StatCard from "../../Components/DashBoard/StatCard";
import UploadCard from "../../Components/DashBoard/UploadCard";
import ActiveJobsCard from "../../Components/DashBoard/ActiveJobCard";
import RecentDatasetsTable from "../../Components/DashBoard/RecentDatasetTable";
import useAuth from "@/hooks/useAuth";
import { createSupabaseClient } from "@/lib/supabase";

const supabase = createSupabaseClient();
const FREE_TIER_UPLOAD_LIMIT = 500;

function formatFileSize(bytes) {
  if (!Number.isFinite(Number(bytes))) return "Unknown size";

  const numeric = Number(bytes);
  if (numeric < 1024) return `${numeric} B`;

  const units = ["KB", "MB", "GB", "TB"];
  let value = numeric / 1024;
  let index = 0;

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[index]}`;
}

function toDashboardStatus(status) {
  if (status === "ready") return "COMPLETE";
  if (status === "failed") return "FAILED";
  if (status === "processing" || status === "uploaded") return "PROCESSING";
  return String(status || "UNKNOWN").toUpperCase();
}

function getDisplayName(user) {
  if (!user) return "there";

  const metadataName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.user_metadata?.display_name;

  if (metadataName) return metadataName;

  if (user.email) {
    return user.email.split("@")[0];
  }

  return "there";
}

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const [datasets, setDatasets] = useState([]);
  const [loadingDatasets, setLoadingDatasets] = useState(true);
  const [snapshotTime] = useState(() => Date.now());

  useEffect(() => {
    let active = true;

    async function fetchDatasets() {
      if (!user?.id) {
        if (!active) return;
        setDatasets([]);
        setLoadingDatasets(false);
        return;
      }

      const { data, error } = await supabase
        .from("datasets")
        .select("id, file_name, file_size, status, uploaded_at, created_at")
        .eq("user_id", user.id)
        .order("uploaded_at", { ascending: false });

      if (!active) return;

      if (error) {
        setDatasets([]);
        setLoadingDatasets(false);
        return;
      }

      setDatasets(Array.isArray(data) ? data : []);
      setLoadingDatasets(false);
    }

    if (!authLoading) {
      fetchDatasets();
    }

    if (!user?.id) {
      return () => {
        active = false;
      };
    }

    const channel = supabase
      .channel(`dashboard-datasets-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "datasets",
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchDatasets();
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [authLoading, user?.id]);

  const totalUploads = datasets.length;
  const completedDatasets = datasets.filter(
    (dataset) => dataset.status === "ready",
  ).length;
  const processingDatasets = datasets.filter(
    (dataset) => dataset.status === "processing" || dataset.status === "uploaded",
  );
  const failedDatasets = datasets.filter(
    (dataset) => dataset.status === "failed",
  ).length;
  const recentWindowStart = snapshotTime - 7 * 24 * 60 * 60 * 1000;
  const uploadsLastWeek = datasets.filter((dataset) => {
    const uploadedAt = Date.parse(dataset.uploaded_at || dataset.created_at || "");
    return !Number.isNaN(uploadedAt) && uploadedAt >= recentWindowStart;
  }).length;

  const recentDatasets = datasets.slice(0, 6).map((dataset) => ({
    id: dataset.id,
    name: dataset.file_name,
    size: formatFileSize(dataset.file_size),
    status: toDashboardStatus(dataset.status),
    modified: dataset.uploaded_at || dataset.created_at
      ? formatDistanceToNow(new Date(dataset.uploaded_at || dataset.created_at), {
          addSuffix: true,
        })
      : "Unknown",
  }));

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* <UsageBanner used={totalUploads} limit={FREE_TIER_UPLOAD_LIMIT} /> */}
        <WelcomeHeader name={getDisplayName(user)} />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard
            title="Total Uploads"
            value={loadingDatasets ? "..." : totalUploads.toLocaleString()}
            extra={loadingDatasets ? "" : `${uploadsLastWeek} in last 7d`}
          />
          <StatCard
            title="Completed Datasets"
            value={loadingDatasets ? "..." : completedDatasets.toLocaleString()}
            extra={loadingDatasets ? "" : `${failedDatasets} failed`}
          />
          <StatCard
            title="Active Jobs"
            value={loadingDatasets ? "..." : processingDatasets.length.toLocaleString()}
            extra={loadingDatasets ? "" : "Live queue"}
          />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-6">
          <div className="space-y-6">
            <UploadCard />
            <ActiveJobsCard
              loading={authLoading || loadingDatasets}
              processingDatasets={processingDatasets}
              failedCount={failedDatasets}
            />
          </div>

          <RecentDatasetsTable
            datasets={recentDatasets}
            loading={authLoading || loadingDatasets}
          />
        </div>
      </div>
    </DashboardLayout>
  );
}
