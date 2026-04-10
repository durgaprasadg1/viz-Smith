import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

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

    if (!secret || token !== secret) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const supabaseURL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
      .select("id, storage_bucket, storage_path")
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

    return NextResponse.json({
      success: true,
      deletedDatasets: ids.length,
      attemptedStorageDeletes,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Cleanup failed" },
      { status: 500 },
    );
  }
}
