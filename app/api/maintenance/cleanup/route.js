import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import { invalidateUserDatasetCaches } from "@/lib/redis-cache";

// export const runtime = "nodejs";

function getInternalToken(req) {
  return req.headers.get("x-maintenance-token") || "";
}

function getCleanupSecret() {
  return process.env.MAINTENANCE_SECRET || process.env.CLEANUP_SECRET || "";
}

function groupPathsByBucket(rows) {
  const grouped = new Map();

  rows.forEach((row) => {
    const bucket = String(row.storage_bucket || "user-uploads").trim();
    const path = String(row.storage_path || "").trim();
    if (!bucket || !path) return;

    const existing = grouped.get(bucket) || [];
    existing.push(path);
    grouped.set(bucket, existing);
  });

  return grouped;
}

export async function POST(req) {
  try {
    const secret = getCleanupSecret();
    const token = getInternalToken(req);

    if (!secret) {
      return NextResponse.json(
        {
          error:
            "Cleanup secret is not configured. Set MAINTENANCE_SECRET (or CLEANUP_SECRET) and pass it in x-maintenance-token.",
        },
        { status: 500 },
      );
    }

    if (token !== secret) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabaseURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;

    if (!supabaseURL || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Missing Supabase server credentials" },
        { status: 500 },
      );
    }

    const supabase = createClient(supabaseURL, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const nowIso = new Date().toISOString();
    const { data: expiredDatasets, error: selectError } = await supabase
      .from("datasets")
      .select("id, user_id, storage_bucket, storage_path")
      .lt("expires_at", nowIso)
      .limit(1000);

    if (selectError) {
      return NextResponse.json({ error: selectError.message }, { status: 500 });
    }

    const items = Array.isArray(expiredDatasets) ? expiredDatasets : [];
    if (!items.length) {
      return NextResponse.json({
        success: true,
        deletedDatasets: 0,
        attemptedStorageDeletes: 0,
      });
    }

    const groupedByBucket = groupPathsByBucket(items);
    let attemptedStorageDeletes = 0;

    for (const [bucket, paths] of groupedByBucket.entries()) {
      attemptedStorageDeletes += paths.length;
      await supabase.storage
        .from(bucket)
        .remove(paths)
        .catch(() => undefined);
    }

    const ids = items.map((item) => item.id).filter(Boolean);

    const { error: deleteError } = await supabase
      .from("datasets")
      .delete()
      .in("id", ids);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    const affectedUsers = new Map();

    items.forEach((item) => {
      const userId = String(item.user_id || "").trim();
      if (!userId) return;

      const currentIds = affectedUsers.get(userId) || [];
      if (item.id) currentIds.push(item.id);
      affectedUsers.set(userId, currentIds);
    });

    for (const [userId, datasetIds] of affectedUsers.entries()) {
      await invalidateUserDatasetCaches({ userId, datasetIds }).catch(
        () => undefined,
      );
    }

    return NextResponse.json({
      success: true,
      deletedDatasets: ids.length,
      attemptedStorageDeletes,
      invalidatedUsers: affectedUsers.size,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Cleanup failed" },
      { status: 500 },
    );
  }
}
