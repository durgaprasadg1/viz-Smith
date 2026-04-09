import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import {
  ALLOWED_TYPES,
  MAX_FILE_SIZE,
  analyzeDatasetBuffer,
} from "@/lib/dataset-analysis";
import { getEnvVar } from "@/lib/supabase";

const STORAGE_BUCKET = "user-uploads";
const SUPPORTED_EXTENSIONS = [".csv", ".xlsx"];

function hasSupportedExtension(fileName) {
  const lower = String(fileName || "").toLowerCase();
  return SUPPORTED_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

export async function POST(req) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : null;

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { supabaseURL, supabaseAnonKey } = getEnvVar();

    const supabase = createClient(supabaseURL, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser(token);

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Only CSV and XLSX files are allowed" },
        { status: 400 },
      );
    }

    if (!hasSupportedExtension(file.name)) {
      return NextResponse.json(
        { error: "Unsupported file extension" },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File size must be less than 50MB" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    let analysis;
    try {
      analysis = await analyzeDatasetBuffer({
        buffer,
        fileName: file.name,
        fileSize: file.size,
      });
    } catch (analysisError) {
      return NextResponse.json(
        { error: analysisError?.message || "Unable to parse dataset" },
        { status: 400 },
      );
    }

    const {
      rowCount,
      columnCount,
      sheetName,
      columns,
      columnProfiles,
      relationships,
      previewRows,
    } = analysis;

    if (!columnCount) {
      return NextResponse.json(
        {
          error:
            "No valid columns found for analysis. Please check your file headers.",
        },
        { status: 400 },
      );
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${user.id}/${Date.now()}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { error: dbError } = await supabase
      .from("datasets")
      .insert({
        user_id: user.id,
        file_name: file.name,
        storage_bucket: STORAGE_BUCKET,
        storage_path: filePath,
        file_type: file.type,
        file_size: file.size,
        row_count: rowCount,
        column_count: columnCount,
        xlsx_sheet_name: sheetName,
        status: "ready",
        metadata: {
          columns,
          columnProfiles,
          relationships,
        },
        expires_at: new Date(
          Date.now() + 2 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      })
      .select()
      .single();

    if (dbError) {
      await supabase.storage.from(STORAGE_BUCKET).remove([filePath]);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      relationships,
      columns,
      rows: previewRows,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Something went wrong" },
      { status: 500 },
    );
  }
}
