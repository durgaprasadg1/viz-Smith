const TEMP_STORAGE_ERROR_CODES = new Set([
  "ENOENT",
  "EACCES",
  "EPERM",
  "EROFS",
  "ENOSPC",
]);

function normalizeText(value) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function normalizeErrorCode(value) {
  const code = normalizeText(value);
  return code ? code.toUpperCase() : "";
}

function isTempStorageFailure(errorCode, message) {
  if (TEMP_STORAGE_ERROR_CODES.has(errorCode)) return true;

  const lower = message.toLowerCase();
  if (lower.includes("/var/task/.tmp")) return true;
  if (lower.includes("upload-sessions") && lower.includes("mkdir")) return true;

  return false;
}

function matchKnownUploadError(message) {
  switch (message) {
    case "Unsupported file extension":
      return {
        status: 400,
        code: "UPLOAD_UNSUPPORTED_EXTENSION",
        message: "Only CSV, CSV.GZ, and XLSX files are supported.",
      };
    case "Only CSV, CSV.GZ and XLSX files are allowed":
      return {
        status: 400,
        code: "UPLOAD_INVALID_FILE_TYPE",
        message: "Only CSV, CSV.GZ, and XLSX files are supported.",
      };
    case "File size must be less than 50MB":
      return {
        status: 400,
        code: "UPLOAD_FILE_TOO_LARGE",
        message: "File size must be less than 50MB.",
      };
    case "Invalid total chunks":
    case "Chunk count mismatch":
    case "Chunk metadata mismatch":
    case "Invalid chunk index":
      return {
        status: 400,
        code: "UPLOAD_INVALID_CHUNK_DATA",
        message: "Upload metadata is invalid. Please retry the upload.",
      };
    case "Upload session not found":
      return {
        status: 404,
        code: "UPLOAD_SESSION_NOT_FOUND",
        message: "Upload session was not found. Please restart the upload.",
      };
    case "Upload session is not available for processing":
      return {
        status: 404,
        code: "UPLOAD_SESSION_NOT_READY",
        message: "Upload session is no longer available. Please upload again.",
      };
    case "Upload session is not accepting chunks":
      return {
        status: 409,
        code: "UPLOAD_SESSION_CLOSED",
        message: "Upload session is closed. Please restart the upload.",
      };
    case "Upload is incomplete. Missing chunk(s).":
      return {
        status: 409,
        code: "UPLOAD_INCOMPLETE",
        message:
          "Upload is incomplete. Please retry and ensure all chunks finish.",
      };
    case "Unable to create processing dataset":
      return {
        status: 500,
        code: "UPLOAD_DATASET_INIT_FAILED",
        message:
          "Upload was received but processing could not start. Please try again.",
      };
    case "Unable to store uploaded file":
      return {
        status: 500,
        code: "UPLOAD_STORAGE_WRITE_FAILED",
        message: "Uploaded data could not be stored. Please try again.",
      };
    default:
      break;
  }

  if (message.startsWith("Upload session expired")) {
    return {
      status: 409,
      code: "UPLOAD_SESSION_EXPIRED",
      message: "Upload session expired. Please restart the upload.",
    };
  }

  return null;
}

export function classifyUploadError(
  error,
  {
    defaultStatus = 500,
    defaultCode = "UPLOAD_REQUEST_FAILED",
    defaultMessage = "Unable to process upload request.",
  } = {},
) {
  const rawMessage = normalizeText(error?.message);
  const rawCode = normalizeErrorCode(error?.code);

  if (isTempStorageFailure(rawCode, rawMessage)) {
    return {
      status: 503,
      code: "UPLOAD_TEMP_STORAGE_UNAVAILABLE",
      message:
        "Upload service storage is temporarily unavailable. Please retry in a few moments.",
      debugMessage: rawMessage || rawCode,
    };
  }

  const known = matchKnownUploadError(rawMessage);
  if (known) {
    return {
      ...known,
      debugMessage: rawMessage,
    };
  }

  const statusCandidate = Number(error?.status || error?.statusCode);
  const status =
    Number.isInteger(statusCandidate) &&
    statusCandidate >= 400 &&
    statusCandidate <= 599
      ? statusCandidate
      : defaultStatus;

  if (status < 500 && rawMessage) {
    return {
      status,
      code: defaultCode,
      message: rawMessage,
      debugMessage: rawMessage,
    };
  }

  return {
    status,
    code: defaultCode,
    message: defaultMessage,
    debugMessage: rawMessage || defaultMessage,
  };
}
