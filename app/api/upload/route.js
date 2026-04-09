import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getEnvVar } from "@/lib/supabase";
import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";

const ALLOWED_TYPES = [
  "text/csv",
  "application/csv",
  "text/plain",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

function parseCSV(buffer) {
  const text = buffer.toString("utf-8");

  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });

  return {
    data: records,
    rowCount: records.length,
    columnCount: records.length > 0 ? Object.keys(records[0]).length : 0,
    sheetName: null,
    columns: records.length > 0 ? Object.keys(records[0]) : [],
  };
}

function parseXLSX(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const records = XLSX.utils.sheet_to_json(sheet, { defval: null });

  return {
    data: records,
    rowCount: records.length,
    columnCount: records.length > 0 ? Object.keys(records[0]).length : 0,
    sheetName,
    columns: records.length > 0 ? Object.keys(records[0]) : [],
  };
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
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "File size must be less than 50MB" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    let parsedResult;

    if (file.name.toLowerCase().endsWith(".csv")) {
      parsedResult = parseCSV(buffer);
    } else if (file.name.toLowerCase().endsWith(".xlsx")) {
      parsedResult = parseXLSX(buffer);
    } else {
      return NextResponse.json(
        { error: "Unsupported file extension" },
        { status: 400 }
      );
    }

    const { rowCount, columnCount, sheetName, columns } = parsedResult;

    console.log("rowCount : ", rowCount)
    console.log("columnCount : ", columnCount)
    console.log("sheetName : ", sheetName)
    console.log("columns : ", columns)

    if (columnCount === 0) {
      return NextResponse.json(
        { error: "File appears to be empty or invalid" },
        { status: 400 }
      );
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${user.id}/${Date.now()}-${safeName}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("user-uploads")
      .upload(filePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: insertedDataset, error: dbError } = await supabase
      .from("datasets")
      .insert({
        user_id: user.id,
        file_name: file.name,
        storage_bucket: "user-uploads",
        storage_path: filePath,
        file_type: file.type,
        file_size: file.size,
        row_count: rowCount,
        column_count: columnCount,
        xlsx_sheet_name: sheetName,
        status: "ready",
        metadata: {
          columns,
        },
        expires_at: new Date(
          Date.now() + 2 * 24 * 60 * 60 * 1000
        ).toISOString(),
      })
      .select()
      .single();

    if (dbError) {
      await supabase.storage.from("user-uploads").remove([filePath]);
      console.error("DB insert error:", dbError);

      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      dataset: insertedDataset,
      message: "File uploaded and parsed successfully",
    });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: error.message || "Something went wrong" },
      { status: 500 }
    );
  }
}