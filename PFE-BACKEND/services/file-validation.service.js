/**
 * FILE VALIDATION SERVICE
 * 
 * Heuristic checks and file type validation
 * - MIME type verification
 * - Double extension detection
 * - Executable/Script detection
 * - File signature verification (magic bytes)
 */

// Blacklisted extensions (dangerous)
const BLOCKED_EXTENSIONS = [
  // Executables
  ".exe",
  ".dll",
  ".com",
  ".scr",
  ".bat",
  ".cmd",
  ".pif",
  ".msi",
  ".msp",
  ".reg",
  ".vbs",
  ".js",
  ".jse",
  ".ws",
  ".wsh",
  ".ps1",
  ".ps2",
  ".psc1",
  ".psc2",
  ".msh",
  ".msh1",
  ".msh1xml",
  ".msh2",
  ".msh2xml",
  ".mshxml",
  ".sh",
  ".bash",
  ".app",
  ".deb",
  ".rpm",
  ".dmg",
  ".apk",
  ".iso",
  ".img",
  ".bin",
  // Scripts/Code
  ".py",
  ".pyc",
  ".pyd",
  ".php",
  ".pl",
  ".rb",
  ".jsp",
  ".asp",
  ".aspx",
  ".jar",
  ".class",
  // Archives with executables
  ".tar",
  ".gz",
  ".bz2",
  ".ar",
  ".iso",
  // MacOS
  ".app",
  ".deb",
  ".rpm"
];

// Whitelist allowed extensions
const ALLOWED_EXTENSIONS = [
  // Documents
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".txt",
  ".rtf",
  ".odt",
  ".ods",
  ".odp",
  ".csv",
  ".json",
  ".xml",
  ".yaml",
  ".yml",
  ".md",
  // Images
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".bmp",
  ".svg",
  ".webp",
  ".tiff",
  ".ico",
  // Audio/Video
  ".mp3",
  ".mp4",
  ".wav",
  ".flac",
  ".aac",
  ".m4a",
  ".ogg",
  ".wma",
  ".wmv",
  ".avi",
  ".mkv",
  ".mov",
  ".webm",
  ".m4v",
  ".flv",
  // Archives (safe - but should scan inside)
  ".zip",
  ".7z",
  ".rar"
];

// Whitelist MIME types
const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  "application/json",
  "application/xml",
  "text/xml",
  "text/x-yaml",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "audio/mpeg",
  "audio/wav",
  "audio/flac",
  "audio/ogg",
  "video/mp4",
  "video/webm",
  "video/x-msvideo",
  "video/quicktime",
  "application/zip",
  "application/x-zip-compressed",
  "application/x-7z-compressed",
  "application/x-rar-compressed"
];

// File magic bytes for verification
const FILE_SIGNATURES = {
  pdf: [0x25, 0x50, 0x44, 0x46], // %PDF
  png: [0x89, 0x50, 0x4e, 0x47], // PNG
  jpeg: [0xff, 0xd8, 0xff], // JPEG
  gif: [0x47, 0x49, 0x46], // GIF
  zip: [0x50, 0x4b, 0x03, 0x04], // ZIP
  rar: [0x52, 0x61, 0x72, 0x21], // Rar!
  docx: [0x50, 0x4b, 0x03, 0x04], // ZIP-based (same as zip)
  exe: [0x4d, 0x5a] // MZ (header)
};

/**
 * Validate file extension
 * Returns: { valid: boolean, reason: string }
 */
export const validateExtension = (filename) => {
  if (!filename || typeof filename !== "string") {
    return { valid: false, reason: "Invalid filename" };
  }

  const ext = filename.substring(filename.lastIndexOf(".")).toLowerCase();

  // Check blacklist first (secure by default)
  if (BLOCKED_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      reason: `Extension blocked: ${ext}`,
      flag: "dangerous_extension"
    };
  }

  // Check allowlist
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      valid: false,
      reason: `Extension not whitelisted: ${ext}`,
      flag: "unknown_extension"
    };
  }

  return { valid: true };
};

/**
 * Detect double extension (e.g., document.pdf.exe)
 */
export const detectDoubleExtension = (filename) => {
  if (!filename) return false;

  const parts = filename.toLowerCase().split(".");
  if (parts.length < 3) return false; // Need at least 3 parts

  const lastExt = `.${parts.pop()}`;
  const secondLastExt = `.${parts.pop()}`;

  // If last extension is dangerous and second-to-last is innocent
  if (
    BLOCKED_EXTENSIONS.includes(lastExt) &&
    ALLOWED_EXTENSIONS.includes(secondLastExt)
  ) {
    return {
      detected: true,
      reason: `Double extension detected: ${secondLastExt}${lastExt}`,
      flag: "double_extension"
    };
  }

  return { detected: false };
};

/**
 * Validate MIME type
 */
export const validateMimeType = (mimeType) => {
  if (!mimeType) {
    return {
      valid: false,
      reason: "MIME type missing",
      flag: "missing_mime"
    };
  }

  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return {
      valid: false,
      reason: `MIME type not whitelisted: ${mimeType}`,
      flag: "unknown_mime_type"
    };
  }

  return { valid: true };
};

/**
 * Verify file signature (magic bytes)
 * Detects if file is misnamed (e.g., .exe disguised as .pdf)
 */
export const verifyFileSignature = (buffer, filename) => {
  if (!buffer || buffer.length < 4) {
    return { valid: true, verified: false, reason: "File too small to verify" };
  }

  const magicBytes = Array.from(buffer.slice(0, 4));
  const ext = filename.substring(filename.lastIndexOf(".")).toLowerCase();

  // Check each signature
  for (const [type, signature] of Object.entries(FILE_SIGNATURES)) {
    const match = magicBytes.every((byte, i) => byte === signature[i]);

    if (match) {
      // Found a signature - verify it matches the extension
      if (
        (type === "exe" && [".exe", ".dll", ".scr"].includes(ext)) ||
        (type === "pdf" && ext === ".pdf") ||
        (type === "png" && ext === ".png") ||
        (type === "jpeg" && [".jpg", ".jpeg"].includes(ext)) ||
        (type === "gif" && ext === ".gif") ||
        (type === "zip" && [".zip", ".docx", ".xlsx", ".pptx"].includes(ext)) ||
        (type === "rar" && ext === ".rar")
      ) {
        return { valid: true, verified: true, detectedType: type };
      } else {
        // Mismatch: File signature doesn't match extension
        return {
          valid: false,
          verified: true,
          reason: `File type mismatch: expected ${ext}, detected ${type}`,
          flag: "file_type_mismatch",
          detectedType: type
        };
      }
    }
  }

  // No signature matched (could be text, XML, JSON, etc.)
  return { valid: true, verified: false, reason: "No magic bytes detected (text file?)" };
};

/**
 * Comprehensive file validation
 * Runs all checks and returns detailed report
 */
export const validateFile = (filename, mimeType, buffer = null) => {
  const report = {
    filename,
    mimeType,
    timestamp: new Date(),
    checks: {},
    isValid: true,
    flags: [],
    recommendations: []
  };

  // Check 1: Extension
  const extCheck = validateExtension(filename);
  report.checks.extension = extCheck;
  if (!extCheck.valid) {
    report.isValid = false;
    report.flags.push(extCheck.flag);
    report.recommendations.push(`Extension denied: ${extCheck.reason}`);
  }

  // Check 2: Double extension
  const doubleExtCheck = detectDoubleExtension(filename);
  report.checks.doubleExtension = doubleExtCheck;
  if (doubleExtCheck.detected) {
    report.isValid = false;
    report.flags.push(doubleExtCheck.flag);
    report.recommendations.push(`Double extension detected: ${doubleExtCheck.reason}`);
  }

  // Check 3: MIME type
  const mimeCheck = validateMimeType(mimeType);
  report.checks.mimeType = mimeCheck;
  if (!mimeCheck.valid) {
    report.isValid = false;
    report.flags.push(mimeCheck.flag);
    report.recommendations.push(`MIME type denied: ${mimeCheck.reason}`);
  }

  // Check 4: File signature (if buffer provided)
  if (buffer) {
    const sigCheck = verifyFileSignature(buffer, filename);
    report.checks.fileSignature = sigCheck;
    if (!sigCheck.valid) {
      report.isValid = false;
      report.flags.push(sigCheck.flag);
      report.recommendations.push(`File signature issue: ${sigCheck.reason}`);
    }
  }

  return report;
};

/**
 * Get risk level based on validation results
 */
export const getRiskLevel = (validationReport) => {
  if (!validationReport.isValid) {
    return "HIGH"; // File failed validation
  }

  const flagsHighRisk = validationReport.flags.filter(
    (f) =>
      f === "double_extension" ||
      f === "file_type_mismatch" ||
      f === "dangerous_extension"
  );

  if (flagsHighRisk.length > 0) {
    return "HIGH";
  }

  if (validationReport.flags.length > 0) {
    return "MEDIUM";
  }

  return "LOW";
};

export default {
  validateExtension,
  detectDoubleExtension,
  validateMimeType,
  verifyFileSignature,
  validateFile,
  getRiskLevel,
  BLOCKED_EXTENSIONS,
  ALLOWED_EXTENSIONS,
  ALLOWED_MIME_TYPES
};
