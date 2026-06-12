import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import crypto from "crypto";
import mongoose from "mongoose";
import File from "../models/File.js";
import User from "../models/User.js";
import Tenant from "../models/Tenant.js";
import EncryptionKey from "../models/EncryptionKey.js";
import SharedLink from "../models/SharedLink.js";
import ShareHistory from "../models/ShareHistory.js";
import Folder from "../models/Folder.js";
import { ROLES } from "../constants/roles.js";
import { logShare } from "./shareHistory.service.js";
import activityService from "./activity.service.js";
import { sendShareNotificationEmail, sendSecurityAlertEmail } from "./email.service.js";
import {
  notifyFileReceived,
  notifyFileReviewOutcome,
  notifySecurityAlert
} from "./in-app-notification.service.js";
import { scanFile } from "./malwareScan.service.js";
import { scanFileWithClamAV, isClamAVHealthy } from "./clamav.service.js";
import { validateFile, getRiskLevel } from "./file-validation.service.js";
import { queueFileForVTScan } from "./virustotal-queue.service.js";
import * as aiOllamaService from "./ai-ollama.service.js";
import { validateClassificationResponse } from "../utils/ai-validators.js";
import { logAIAnalysis } from "../utils/ai-logging.js";
import { uploadFile as uploadToStorage, downloadFile as downloadFromStorage, deleteFile as deleteFromStorage } from "./storage.service.js";
import { assertTenantFolderWithinQuota, assertUploadWithinQuota } from "./quota.service.js";
import unzipper from "unzipper";
import tar from "tar";
import {
  generateFileKey,
  encryptFileBuffer,
  decryptFileBuffer,
  encryptKeyWithMaster,
  decryptKeyWithMaster
} from "./crypto.service.js";

const buildTenantStoragePath = (tenantId, originalName) => {
  const safeName = path.basename(originalName).replace(/[^a-zA-Z0-9._-]/g, "_");
  const tenantFolder = path.join("storage", String(tenantId));
  const fileName = `${Date.now()}-${safeName}.enc`;

  return {
    tenantFolder,
    filePath: path.join(tenantFolder, fileName),
    objectKey: `${tenantId}/${fileName}`,
  };
};

const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const getDisplayName = (user) => {
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
  return fullName || user?.name || user?.email || "Utilisateur";
};

const getFileRestrictionLevel = (file) => {
  // SECURITY: Determine access level based on file status and scan results
  const quarantine = String(file?.scanMetadata?.quarantineStatus || "").toLowerCase();
  const clamavInfected = Boolean(file?.scanMetadata?.clamavResult?.isInfected);
  const vtInfected = Boolean(file?.scanMetadata?.virustotalResult?.isInfected);
  const whitelisted = Boolean(
    file?.scanMetadata?.whitelistedBy ||
    file?.scanMetadata?.whitelistDate ||
    file?.whitelistedBy ||
    file?.whitelistDate
  );

  if (whitelisted) {
    return {
      restricted: false,
      level: "active",
      reason: "File approved by admin after investigation",
      adminOnly: false,
      approved: true
    };
  }

  // Blocked files: completely inaccessible (marked for deletion)
  if (file?.status === "blocked") {
    return {
      restricted: true,
      level: "blocked",
      reason: "File permanently blocked",
      adminOnly: true,
      approved: false
    };
  }

  // Quarantined files: admin investigation required
  if (file?.status === "quarantined" || quarantine === "quarantined" || clamavInfected || vtInfected) {
    return {
      restricted: true,
      level: "quarantined",
      reason: clamavInfected ? "Malware detected by ClamAV" :
             vtInfected ? "Malware detected by VirusTotal" :
             quarantine === "quarantined" ? "File quarantined for review" :
             "File under investigation",
      adminOnly: false, // Admin can access for investigation
      approved: false
    };
  }

  // Active files: normal access
  return {
    restricted: false,
    level: "active",
    reason: null,
    adminOnly: false,
    approved: false
  };
};

const isFileRestricted = (file) => {
  // LEGACY: Keep for backward compatibility
  return getFileRestrictionLevel(file).restricted;
};

const isArchiveFile = (filename) => {
  const name = String(filename || "").toLowerCase();
  return (
    name.endsWith(".zip") ||
    name.endsWith(".tar") ||
    name.endsWith(".tgz") ||
    name.endsWith(".tar.gz")
  );
};

const scheduleBackgroundAiClassification = async (fileId, file, user, buffer) => {
  try {
    const start = Date.now();
    const sampleText = buffer.toString("utf8", 0, 512);
    const fileMetadata = {
      filename: file.originalname,
      mimetype: file.mimetype,
      size: file.size || buffer.length,
      ownerEmail: user.email || "unknown",
      tenantId: String(user.tenantId)
    };

    const aiClassification = await aiOllamaService.classifyDocumentSensitivity(fileMetadata, sampleText);

    // Validate AI raw response strictly
    const rawResp = aiClassification?.response || aiClassification?.raw || '';
    const validation = validateClassificationResponse(rawResp);
    const classification = validation.data;

    const aiAnalysis = {
      raw: rawResp,
      validationError: validation.error || null,
      usedDefaults: !validation.valid
    };

    await File.findByIdAndUpdate(fileId, {
      $set: {
        "scanMetadata.aiClassification": classification,
        "scanMetadata.aiAnalysis": aiAnalysis,
        "scanMetadata.aiAnalyzedAt": new Date(),
        "scanMetadata.aiStatus": validation.valid ? "done" : "done_with_defaults",
        "scanMetadata.aiConfidence": classification.confidence || 0
      }
    });

    // Log analysis for audit
    const aiLog = {
      fileId,
      userId: user._id,
      tenantId: user.tenantId,
      module: 'upload',
      operation: 'classifyDocumentSensitivity',
      model: process.env.OLLAMA_MODEL,
      result: classification,
      rawResponse: rawResp,
      success: true,
      duration: Date.now() - start
    };
    void logAIAnalysis(aiLog).catch(() => {});

    console.log(`[AI] Background classification completed for file ${fileId}`);
  } catch (error) {
    console.warn(`[AI] Background analysis failed for file ${fileId}: ${error.message}`);
    await File.findByIdAndUpdate(fileId, {
      $set: {
        "scanMetadata.aiAnalysis": { error: error.message },
        "scanMetadata.aiAnalyzedAt": new Date(),
        "scanMetadata.aiStatus": "failed"
      }
    });

    const aiLog = {
      fileId,
      userId: user._id,
      tenantId: user.tenantId,
      module: 'upload',
      operation: 'classifyDocumentSensitivity',
      model: process.env.OLLAMA_MODEL,
      error: error.message,
      success: false,
      duration: 0
    };
    void logAIAnalysis(aiLog).catch(() => {});
  }
};

const collectFilesRecursively = async (dir) => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const resolvedPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFilesRecursively(resolvedPath));
    } else if (entry.isFile()) {
      files.push(resolvedPath);
    }
  }

  return files;
};

const createTempArchiveDirectory = async () => {
  const tempDir = path.join("temp", "archive-scan", `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`);
  await fs.mkdir(tempDir, { recursive: true });
  return tempDir;
};

const scanZipArchive = async (archivePath, originalName) => {
  const tempDir = await createTempArchiveDirectory();
  try {
    const directory = await unzipper.Open.file(archivePath);
    let scannedFiles = 0;

    for (const entry of directory.files) {
      if (entry.type !== "File") {
        continue;
      }

      const sanitizedPath = path.normalize(entry.path);
      if (sanitizedPath.startsWith("..")) {
        continue;
      }

      const entryTarget = path.join(tempDir, sanitizedPath);
      await fs.mkdir(path.dirname(entryTarget), { recursive: true });

      await new Promise((resolve, reject) => {
        entry.stream()
          .pipe(fsSync.createWriteStream(entryTarget))
          .on("finish", resolve)
          .on("error", reject);
      });

      scannedFiles += 1;
      const result = await scanFileWithClamAV(entryTarget, entry.path);
      if (result.isInfected) {
        return {
          ...result,
          archive: originalName,
          entry: entry.path,
          scannedFiles
        };
      }
    }

    return {
      isInfected: false,
      viruses: [],
      engine: "clamav-archive",
      timestamp: new Date(),
      details: {
        archive: originalName,
        scannedFiles
      }
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
};

const scanTarArchive = async (archivePath, originalName) => {
  const tempDir = await createTempArchiveDirectory();
  try {
    await tar.extract({
      file: archivePath,
      cwd: tempDir,
      strip: 0,
      filter: (pathName, entry) => {
        const candidate = path.normalize(path.join(tempDir, pathName));
        return candidate.startsWith(tempDir);
      }
    });

    const files = await collectFilesRecursively(tempDir);
    let scannedFiles = 0;

    for (const extractedFile of files) {
      scannedFiles += 1;
      const relativePath = path.relative(tempDir, extractedFile);
      const result = await scanFileWithClamAV(extractedFile, relativePath);
      if (result.isInfected) {
        return {
          ...result,
          archive: originalName,
          entry: relativePath,
          scannedFiles
        };
      }
    }

    return {
      isInfected: false,
      viruses: [],
      engine: "clamav-archive",
      timestamp: new Date(),
      details: {
        archive: originalName,
        scannedFiles
      }
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
};

const scanArchiveIfNeeded = async (archivePath, originalName) => {
  if (!isArchiveFile(originalName)) {
    return null;
  }

  const normalized = String(originalName || "").toLowerCase();
  try {
    if (normalized.endsWith(".zip")) {
      return await scanZipArchive(archivePath, originalName);
    }

    if (normalized.endsWith(".tar") || normalized.endsWith(".tar.gz") || normalized.endsWith(".tgz")) {
      return await scanTarArchive(archivePath, originalName);
    }

    return null;
  } catch (error) {
    console.warn(`[ArchiveScan] Failed to scan archive ${originalName}: ${error.message}`);
    if (process.env.NODE_ENV === "production") {
      throw error;
    }
    return {
      isInfected: false,
      viruses: [],
      engine: "clamav-archive",
      warning: error.message,
      timestamp: new Date()
    };
  }
};

const decryptStoredFile = async (file) => {
  // Download encrypted file from MinIO storage
  const encryptedBuffer = await downloadFromStorage(
    file.tenantId,
    file.bucketName,
    file.storagePath
  );

  const fileKey = decryptKeyWithMaster(
    file.encryptionKeyId.encryptedKey,
    file.encryptionKeyId.iv
  );

  const decrypted = decryptFileBuffer(
    encryptedBuffer,
    fileKey,
    file.iv,
    file.authTag
  );

  return {
    buffer: decrypted,
    originalName: file.originalName,
    mimeType: file.mimeType,
  };
};

const pushShareAuditEvent = async (sharedLink, action, requester, ipAddress) => {
  try {
    if (!sharedLink?.shareHistoryId) {
      return;
    }

    const now = new Date();
    const history = await ShareHistory.findById(sharedLink.shareHistoryId);

    if (!history) {
      return;
    }

    if (!history.firstAccessedAt) {
      history.firstAccessedAt = now;
    }

    history.lastAccessedAt = now;

    if (action === "download") {
      history.downloadCount += 1;
    } else if (action === "view") {
      history.viewCount += 1;
    }

    history.accessLogs.push({
      timestamp: now,
      action,
      ipAddress: ipAddress || "unknown",
      userAgent: requester?.userAgent || "unknown",
      success: true
    });

    history.auditTrail.push({
      action: `accessed_${action}`,
      timestamp: now,
      performedBy: requester?.userId || null,
      changes: {
        source: "shared-link",
        linkId: sharedLink._id,
        accessControl: sharedLink.accessControl
      }
    });

    await history.save();
  } catch (error) {
    console.warn("[ShareHistory] Failed to push access audit event:", error.message);
  }
};

const logFileActivityForShares = async (fileId, ownerId, action, changes = {}) => {
  try {
    const now = new Date();

    await ShareHistory.updateMany(
      {
        fileId,
        "sharedBy.userId": ownerId
      },
      {
        $set: { updatedAt: now },
        $push: {
          auditTrail: {
            action,
            timestamp: now,
            performedBy: ownerId,
            changes
          }
        }
      }
    );
  } catch (error) {
    console.warn("[ShareHistory] Failed to log file activity:", error.message);
  }
};

export const getMyFiles = async (requester, filters = {}) => {
  const requesterId = requester?.userId || requester?._id;

  if (!requesterId || !requester?.tenantId) {
    throw new Error("Invalid tenant context");
  }

  const query = {
    tenantId: requester.tenantId,
    ownerId: requesterId,
    status: { $ne: "blocked" } // Exclude blocked files from user's view
  };

  if (typeof filters.spaceId === "string" && filters.spaceId.trim().length > 0) {
    if (filters.spaceId === "unassigned") {
      query.ownerSpaceId = null;
    } else if (mongoose.Types.ObjectId.isValid(filters.spaceId)) {
      const folderIds = [filters.spaceId];

      const collectDescendantFolders = async (parentId) => {
        const children = await Folder.find({
          parentId,
          ownerId: requesterId,
          tenantId: requester.tenantId
        }, '_id');

        let ids = children.map(child => child._id.toString());

        for (const child of children) {
          ids = ids.concat(await collectDescendantFolders(child._id));
        }

        return ids;
      };

      const descendantIds = await collectDescendantFolders(filters.spaceId);
      if (descendantIds.length > 0) {
        folderIds.push(...descendantIds);
      }

      query.ownerSpaceId = { $in: folderIds };
    }
  }

  return await File.find(query)
    .populate("ownerId", "firstName lastName email")
    .populate("ownerSpaceId", "name color icon")
    .sort({ createdAt: -1 });
};

export const getTenantFiles = async (requester) => {
  if (!requester?.tenantId) {
    throw new Error("Invalid tenant context");
  }

  return await File.find({
    tenantId: requester.tenantId,
  })
    .populate("ownerId", "firstName lastName email")
    .sort({ createdAt: -1 });
};

const buildMalwareAlertFilter = ({ tenantId, ownerId, scanStatus, startDate, endDate } = {}) => {
  const filter = {
    $or: [
      { status: "blocked" },
      { "scanMetadata.clamavResult.isInfected": true },
      { "scanMetadata.virustotalResult.isInfected": true },
      { "scanMetadata.quarantineStatus": "quarantined" }
    ]
  };

  if (tenantId) {
    filter.tenantId = tenantId;
  }

  if (ownerId) {
    filter.ownerId = ownerId;
  }

  if (scanStatus) {
    filter.scanStatus = scanStatus;
  }

  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) {
      filter.createdAt.$gte = new Date(startDate);
    }
    if (endDate) {
      const endOfDay = new Date(endDate);
      endOfDay.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = endOfDay;
    }
  }

  return filter;
};

const getMalwareAlertSeverityScore = (file) => {
  let score = 0;

  if (file?.status === "blocked") {
    score += 50;
  }

  if (file?.scanMetadata?.quarantineStatus === "quarantined") {
    score += 35;
  }

  if (file?.scanMetadata?.clamavResult?.isInfected) {
    score += 25;
  }

  if (file?.scanMetadata?.virustotalResult?.isInfected) {
    score += 20;
  }

  return score;
};

export const getAllFilesForAdmin = async (requester) => {
  if (requester?.role !== ROLES.SUPERADMIN && requester?.role !== ROLES.TENANT_ADMIN) {
    throw new Error("Not authorized");
  }

  // SECURITY: TENANT_ADMIN can only view files from their own tenant
  const query = {};
  if (requester?.role === ROLES.TENANT_ADMIN) {
    if (!requester?.tenantId) {
      throw new Error("Invalid tenant context");
    }
    query.tenantId = requester.tenantId;
  }

  return await File.find(query)
    .populate("ownerId", "firstName lastName email")
    .sort({ createdAt: -1 });
};

export const getMalwareAlerts = async (requester, options = {}) => {
  if (requester?.role !== ROLES.SUPERADMIN && requester?.role !== ROLES.TENANT_ADMIN) {
    throw new Error("Not authorized");
  }

  const page = Math.max(1, Number(options.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(options.limit) || 20));
  const skip = (page - 1) * limit;
  
  // SECURITY: TENANT_ADMIN can only view alerts from their own tenant
  // SUPERADMIN can view all alerts or filter by specific tenant
  const filterOptions = { ...options };
  if (requester?.role === ROLES.TENANT_ADMIN) {
    if (!requester?.tenantId) {
      throw new Error("Invalid tenant context");
    }
    // TENANT_ADMIN: Force their tenant ID, ignore any tenant filter request
    filterOptions.tenantId = requester.tenantId;
  } else if (requester?.role === ROLES.SUPERADMIN && options?.tenantId) {
    // SUPERADMIN: Can optionally filter by tenant if specified
    filterOptions.tenantId = options.tenantId;
  }
  
  const filter = buildMalwareAlertFilter(filterOptions);

  const sortBy = String(options.sortBy || "newest").toLowerCase();

  const [total, data] = await Promise.all([
    File.countDocuments(filter),
    sortBy === "severity"
      ? File.find(filter).populate("ownerId", "firstName lastName email")
      : File.find(filter)
          .populate("ownerId", "firstName lastName email")
          .sort({ "scanMetadata.lastScannedAt": -1, createdAt: -1 })
          .skip(skip)
          .limit(limit)
  ]);

  const sortedData = sortBy === "severity"
    ? [...data].sort((left, right) => {
        const scoreRight = getMalwareAlertSeverityScore(right);
        const scoreLeft = getMalwareAlertSeverityScore(left);
        if (scoreRight !== scoreLeft) {
          return scoreRight - scoreLeft;
        }

        return new Date(right.scanMetadata?.lastScannedAt || right.createdAt || 0).getTime() -
          new Date(left.scanMetadata?.lastScannedAt || left.createdAt || 0).getTime();
      })
    : data;

  const paginatedData = sortBy === "severity"
    ? sortedData.slice(skip, skip + limit)
    : sortedData;

  return {
    total,
    page,
    limit,
    data: paginatedData
  };
};

export const getMalwareAlertById = async (requester, fileId) => {
  if (requester?.role !== ROLES.SUPERADMIN && requester?.role !== ROLES.TENANT_ADMIN) {
    throw new Error("Not authorized");
  }

  const file = await File.findById(fileId).populate("ownerId", "firstName lastName email");
  if (!file) {
    throw new Error("File not found");
  }

  // SECURITY: TENANT_ADMIN can only access alerts from their own tenant
  if (requester?.role === ROLES.TENANT_ADMIN && file.tenantId.toString() !== requester.tenantId.toString()) {
    throw new Error("Access denied");
  }

  const isAlert = [
    file.status === "blocked",
    !!file.scanMetadata?.clamavResult?.isInfected,
    !!file.scanMetadata?.virustotalResult?.isInfected,
    String(file.scanMetadata?.quarantineStatus || "").toLowerCase() === "quarantined"
  ].some(Boolean);

  if (!isAlert) {
    throw new Error("File is not flagged as a malware alert");
  }

  return file;
};

export const manageQuarantinedFile = async (requester, fileId, action, options = {}) => {
  if (requester?.role !== ROLES.SUPERADMIN && requester?.role !== ROLES.TENANT_ADMIN) {
    throw new Error("Not authorized");
  }

  if (!mongoose.Types.ObjectId.isValid(fileId)) {
    throw new Error("Invalid file ID");
  }

  const file = await File.findById(fileId).populate("ownerId", "firstName lastName email");
  if (!file) {
    throw new Error("File not found");
  }

  if (
    requester.role === ROLES.TENANT_ADMIN &&
    file.tenantId.toString() !== String(requester.tenantId)
  ) {
    throw new Error("Access denied: File belongs to a different tenant");
  }

  const isAlert = [
    file.status === "blocked",
    file.status === "quarantined",
    String(file.scanMetadata?.quarantineStatus || "").toLowerCase() === "quarantined",
    Boolean(file.scanMetadata?.clamavResult?.isInfected),
    Boolean(file.scanMetadata?.virustotalResult?.isInfected)
  ].some(Boolean);

  if (!isAlert) {
    throw new Error("File is not quarantined or flagged for review");
  }

  file.scanMetadata = file.scanMetadata || {};
  const now = new Date();

  switch (action) {
    case "whitelist":
      file.status = "active";
      file.scanStatus = "clean";
      file.scanMetadata.quarantineStatus = "clean";
      file.scanMetadata.whitelistedBy = requester.userId || requester._id;
      file.scanMetadata.whitelistReason = options.reason || "Admin approved after review";
      file.scanMetadata.whitelistDate = now;
      file.scanMetadata.investigationNotes = options.notes || file.scanMetadata.investigationNotes || "";
      break;

    case "block":
      file.status = "blocked";
      file.scanStatus = "infected";
      file.scanMetadata.quarantineStatus = "quarantined";
      file.scanMetadata.investigationNotes = options.notes || file.scanMetadata.investigationNotes || "Blocked by admin";
      break;

    case "investigate":
      file.scanMetadata.investigationNotes = options.notes || file.scanMetadata.investigationNotes || "";
      break;

    default:
      throw new Error("Invalid action. Use 'whitelist', 'block', or 'investigate'.");
  }

  await file.save();

  if (action === "whitelist" || action === "block") {
    try {
      const adminUser = await User.findById(requester.userId || requester._id)
        .select("firstName lastName email")
        .lean();

      await notifyFileReviewOutcome({
        ownerUserId: file.ownerId?._id || file.ownerId,
        tenantId: file.tenantId,
        fileId: file._id,
        fileName: file.originalName || file.filename,
        action,
        adminName: getDisplayName(adminUser)
      });
    } catch (notificationError) {
      console.warn("[Notifications] Failed to notify file review outcome:", notificationError.message);
    }
  }

  // ASYNC: Detect suspicious sharing patterns without blocking response
  setImmediate(async () => {
    try {
      const recentShares = await SharedLink.find({
        createdBy: requester.userId,
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }).limit(10).lean();

      const shareActivity = {
        totalShares: recentShares.length,
        uniqueFiles: new Set(recentShares.map(s => String(s.fileId))).size,
        externalRecipients: recentShares.filter(s => s.accessControl === 'public').length,
        recentShares: recentShares.map(s => ({ filename: s.shareSubject || 'unnamed', recipient: s.recipientEmail || 'public', classification: (s.fileId?.scanMetadata?.aiClassification?.classification) || 'UNKNOWN' }))
      };

      const aiResponse = await aiOllamaService.detectSuspiciousSharing(requester.userId, shareActivity);
      const validation = (await import('../utils/ai-validators.js')).validateSuspiciousSharingResponse(aiResponse?.response || aiResponse || '');
      const suspiciousResult = validation.data;

      const aiLog = {
        userId: requester.userId,
        tenantId: requester.tenantId,
        fileId,
        linkId: sharedLink._id,
        module: 'sharing',
        operation: 'detectSuspiciousSharing',
        model: process.env.OLLAMA_MODEL,
        result: suspiciousResult,
        rawResponse: aiResponse?.response || null,
        success: validation.valid,
        duration: 0
      };
      void logAIAnalysis(aiLog).catch(() => {});

      if (suspiciousResult.risk_score > (Number(process.env.AI_SUSPICIOUS_SHARING_THRESHOLD) || 75)) {
        console.warn(`[Share AI] Suspicious sharing detected for user ${requester.userId} (score=${suspiciousResult.risk_score})`);
        if (suspiciousResult.action === 'REQUIRE_APPROVAL') {
          await SharedLink.findByIdAndUpdate(sharedLink._id, { requiresAdminApproval: true, adminReviewReason: suspiciousResult.concerns.join('; '), status: 'pending_review' });
        }
        if (suspiciousResult.action === 'WARN') {
          // Notify the owner/admin about suspicious activity
          try {
            const tenant = await Tenant.findById(requester.tenantId).select('name').lean();
            await sendSecurityAlertEmail({
              adminEmail: owner?.email || process.env.ADMIN_EMAIL,
              fileName: file?.originalName || file?.filename || 'shared-file',
              ownerName,
              tenantName: tenant?.name || '',
              threatLevel: 'low',
              detectionSource: 'ai-suspicious-sharing',
              viruses: [],
              fileSize: file?.size || 0,
              uploadTime: new Date()
            });
          } catch (notifyErr) {
            console.warn('[Share AI] Failed to send warning email:', notifyErr.message);
          }
        }
      }
    } catch (err) {
      console.warn('[Share AI] Suspicious sharing detection failed:', err.message);
    }
  });

  return {
    fileId: file._id,
    action,
    status: file.status,
    scanStatus: file.scanStatus,
    quarantineStatus: file.scanMetadata.quarantineStatus,
    investigationNotes: file.scanMetadata.investigationNotes,
    whitelistedBy: file.scanMetadata.whitelistedBy,
    whitelistReason: file.scanMetadata.whitelistReason,
    whitelistDate: file.scanMetadata.whitelistDate,
    updatedAt: file.updatedAt
  };
};

export const uploadAndSecureFile = async (file, user, options = {}) => {
  const requesterId = user.userId || user._id;

  if (!requesterId || !user.tenantId) {
    throw new Error("Invalid tenant context");
  }

  const tempPath = file.path;
  const buffer = await fs.readFile(tempPath);
  const contentHash = crypto.createHash("sha256").update(buffer).digest("hex");

  let ownerSpaceId = null;
  if (options?.spaceId) {
    if (!mongoose.Types.ObjectId.isValid(options.spaceId)) {
      throw new Error("Invalid spaceId");
    }

    const space = await Folder.findOne({
      _id: options.spaceId,
      ownerId: requesterId,
      tenantId: user.tenantId
    });

    if (!space) {
      throw new Error("Space not found");
    }

    ownerSpaceId = space._id;
  }

  console.log(`[Upload] Starting secure upload for: ${file.originalname}`);

  // ============================================
  // 1️⃣ HEURISTIC VALIDATION
  // ============================================
  console.log(`[Upload] Step 1: Heuristic validation...`);
  const validationReport = validateFile(
    file.originalname,
    file.mimetype,
    buffer
  );

  if (!validationReport.isValid) {
    await fs.unlink(tempPath);
    const reason = validationReport.recommendations.join("; ");
    console.warn(`[Upload] ❌ Validation failed: ${reason}`);
    throw new Error(`File validation failed: ${reason}`);
  }
  console.log(`[Upload] ✅ Heuristic validation passed`);

  // ============================================
  // 2️⃣ QUOTA CHECK
  // ============================================
  console.log(`[Upload] Step 2: Checking quota limits...`);
  let quotaCheck;
  try {
    quotaCheck = await assertUploadWithinQuota({
      tenantId: user.tenantId,
      userId: requesterId,
      fileSize: file.size || buffer.length
    });
  } catch (error) {
    await fs.unlink(tempPath).catch(() => null);
    throw error;
  }
  console.log(`[Upload] ✅ Quota check passed`);

  // ============================================
  // 3️⃣ CLAMAV LOCAL SCAN (FAST)
  // ============================================
  console.log(`[Upload] Step 3: ClamAV local scan...`);
  let clamavResult = null;
  let infectedDetected = false;
  const clamavHealthy = await isClamAVHealthy();

  if (clamavHealthy) {
    try {
      clamavResult = await scanFileWithClamAV(tempPath, file.originalname);
      if (clamavResult.isInfected) {
        infectedDetected = true;
        console.error(
          `[Upload] ❌ ClamAV detected malware: ${clamavResult.viruses}`
        );
      } else {
        console.log(`[Upload] ✅ ClamAV scan passed (clean)`);
      }
    } catch (error) {
      console.warn(`[Upload] ⚠️  ClamAV scan error: ${error.message}`);
      if (String(error.message || "").includes("File contains malware")) {
        infectedDetected = true;
        clamavResult = {
          status: "infected",
          isInfected: true,
          viruses: [],
          timestamp: new Date()
        };
      }
      if (!infectedDetected && process.env.NODE_ENV === "production") {
        throw error; // Block upload in production if scan fails
      }
      // In dev, continue but flag it
    }
  } else {
    console.warn(
      `[Upload] ⚠️  ClamAV not available - using legacy VT fallback`
    );
    const legacyResult = await scanFile(tempPath);
    if (legacyResult.isInfected) {
      infectedDetected = true;
      clamavResult = {
        status: "infected",
        isInfected: true,
        viruses: legacyResult.viruses || [],
        timestamp: new Date()
      };
    }
  }

  let aiClassification = null;
  let aiAnalysis = null;

  if (!infectedDetected && isArchiveFile(file.originalname)) {
    console.log(`[Upload] Step 4: Explicit archive inspection for ${file.originalname}...`);
    const archiveResult = await scanArchiveIfNeeded(tempPath, file.originalname);

    if (archiveResult?.isInfected) {
      infectedDetected = true;
      clamavResult = {
        ...archiveResult,
        status: "infected",
        isInfected: true,
        engines: [archiveResult.engine || "clamav-archive"]
      };
      console.error(
        `[Upload] ❌ Archive scan detected malware in ${archiveResult.entry || file.originalname}`
      );
    } else {
      console.log(`[Upload] ✅ Explicit archive scan passed`);
    }
  }

  // We schedule AI classification after the upload response to keep the HTTP request fast.
  if (!infectedDetected) {
    aiClassification = null;
    aiAnalysis = null;
  }

  // ================================================
  // 4️⃣ GENERATE FILE KEY & ENCRYPT
  // ================================================
  console.log(`[Upload] Step 3: Generating encryption key & encrypting...`);
  const fileKey = generateFileKey();

  const { encrypted, iv, authTag, integrity } = encryptFileBuffer(
    buffer,
    fileKey
  );

  // ================================================
  // 5️⃣ UPLOAD TO MINIO STORAGE
  // ================================================
  console.log(`[Upload] Step 4: Uploading to MinIO storage...`);
  const storageResult = await uploadToStorage(
    encrypted,
    user.tenantId,
    requesterId,
    crypto.randomUUID(),
    {
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size
    }
  );
  console.log(`[Upload] ✅ File uploaded to MinIO: ${storageResult.bucket}/${storageResult.objectKey}`);

  // ================================================
  // 6️⃣ ENCRYPT FILE KEY WITH MASTER KEY
  // ================================================
  console.log(`[Upload] Step 5: Wrapping encryption key...`);
  const { encryptedKey, iv: keyIv } = encryptKeyWithMaster(fileKey);

  const keyDoc = await EncryptionKey.create({
    encryptedKey,
    iv: keyIv,
    algorithm: "AES-256-GCM",
    derivation: "PBKDF2-SHA256-250k"
  });
  console.log(`[Upload] ✅ Key wrapped & stored`);

  // ================================================
  // 7️⃣ SAVE FILE METADATA
  // ================================================
  console.log(`[Upload] Step 6: Saving metadata...`);
  const newFile = await File.create({
    tenantId: user.tenantId,
    ownerId: requesterId,
    ownerSpaceId,
    bucketName: storageResult.bucket,
    storageProvider: storageResult.provider,
    filename: path.basename(storageResult.objectKey),
    originalName: file.originalname,
    mimeType: file.mimetype,
    storagePath: storageResult.objectKey,
    contentHash,
    iv,
    authTag,
    integrity,
    size: file.size,
    encryptionKeyId: keyDoc._id,

    status: infectedDetected ? "blocked" : "active",
    scanStatus: infectedDetected ? "infected" : "clean",
    scanViruses: clamavResult?.viruses || [],
    scannedAt: new Date(),

    // Scan metadata
    scanMetadata: {
      clamavResult: clamavResult || { status: "skipped", reason: "ClamAV unavailable" },
      validationReport: {
        isValid: validationReport.isValid,
        flags: validationReport.flags,
        riskLevel: getRiskLevel(validationReport)
      },
      aiClassification,
      aiAnalysis,
      aiAnalyzedAt: undefined,
      aiStatus: infectedDetected ? "failed" : "pending",
      lastScannedAt: new Date(),
      quarantineStatus: infectedDetected ? "quarantined" : "clean"
    },

    // Encryption metadata
    encryptionMetadata: {
      algorithm: "AES-256-GCM",
      keyDerivation: "PBKDF2-SHA256-250k",
      version: "2.0"
    }
  });

  await fs.unlink(tempPath);
  console.log(`[Upload] ✅ Upload complete for: ${file.originalname}`);

  // ================================================
  // 8️⃣ QUEUE FOR VIRUSTOTAL SCAN (ASYNC)
  // ================================================
  if (!infectedDetected) {
    console.log(`[Upload] Step 7: Queuing for VirusTotal deep scan...`);
    try {
      // For MinIO, we need to download the file for VT scan
      const fileBuffer = await downloadFromStorage(user.tenantId, storageResult.bucket, storageResult.objectKey);
      const tempScanPath = path.join("temp", `scan-${Date.now()}-${file.originalname}`);
      await fs.mkdir(path.dirname(tempScanPath), { recursive: true });
      await fs.writeFile(tempScanPath, fileBuffer);

      await queueFileForVTScan(newFile._id.toString(), tempScanPath, file.originalname);
      console.log(`[Upload] ✅ Queued for VT scan`);
    } catch (error) {
      console.warn(`[Upload] ⚠️  Failed to queue VT scan: ${error.message}`);
      // Don't block upload if queueing fails - VT scan is background task
    }

    setImmediate(async () => {
      await scheduleBackgroundAiClassification(newFile._id.toString(), file, user, buffer);
    });
  }

  if (infectedDetected) {
    // Send security alert emails to all admins of the tenant
    try {
      const ownerName = user.firstName
        ? `${user.firstName} ${user.lastName || ""}`.trim()
        : user.email || "Utilisateur inconnu";
      const [adminUsers, tenant] = await Promise.all([
        User.find({
          status: "active",
          $or: [
            { role: ROLES.SUPERADMIN },
            { role: ROLES.TENANT_ADMIN, tenantId: user.tenantId }
          ]
        }),
        Tenant.findById(user.tenantId)
      ]);

      if (adminUsers && adminUsers.length > 0) {
        let threatScore = 0;
        if (clamavResult?.isInfected) threatScore += 40;
        if (newFile.scanMetadata?.virustotalResult?.isInfected) threatScore += 35;
        if (newFile.scanMetadata?.quarantineStatus === 'quarantined') threatScore += 20;
        if (newFile.status === 'blocked') threatScore += 5;

        const threatLevel = threatScore >= 80 ? 'critical' :
                           threatScore >= 60 ? 'high' :
                           threatScore >= 40 ? 'medium' : 'low';
        const adminEmails = adminUsers
          .map(admin => admin.email)
          .filter(email => email);

        if (adminEmails.length > 0) {
          // Send alert to each admin
          for (const adminEmail of adminEmails) {
            await sendSecurityAlertEmail({
              adminEmail,
              fileName: file.originalname,
              ownerName,
              tenantName: tenant?.name || "Organisation inconnue",
              threatLevel,
              detectionSource: clamavResult?.isInfected ? "ClamAV" : "VirusTotal",
              viruses: clamavResult?.viruses || [],
              fileSize: file.size,
              uploadTime: new Date()
            });
          }
          console.log(`[Upload] 📧 Security alerts sent to ${adminEmails.length} admin(s)`);
        }
        await notifySecurityAlert({
          recipientUserIds: adminUsers.map((admin) => admin._id),
          tenantId: user.tenantId,
          fileId: newFile._id,
          fileName: file.originalname,
          ownerName,
          threatLevel
        });
      }
    } catch (emailError) {
      console.error(`[Upload] ⚠️  Failed to send security alert emails: ${emailError.message}`);
      // Don't block upload if email fails
    }

    // Return the blocked file instead of throwing error
    console.log(`[Upload] ⚠️  File blocked and quarantined: ${file.originalname}`);
    return {
      ...newFile.toObject(),
      quotaWarnings: quotaCheck?.warnings || []
    };
  }

  return {
    ...newFile.toObject(),
    quotaWarnings: quotaCheck?.warnings || []
  };
};

export const getUserFolders = async (requester) => {
  const requesterId = requester?.userId || requester?._id;

  if (!requesterId || !requester?.tenantId) {
    throw new Error("Invalid tenant context");
  }

  return await Folder.find({
    ownerId: requesterId,
    tenantId: requester.tenantId
  }).sort({ position: 1, createdAt: 1 });
};

export const createUserFolder = async (requester, payload = {}) => {
  const requesterId = requester?.userId || requester?._id;

  if (!requesterId || !requester?.tenantId) {
    throw new Error("Invalid tenant context");
  }

  const name = String(payload.name || "").trim();
  if (!name) {
    throw new Error("Folder name is required");
  }

  const parentId = payload.parentId || null;
  let path = "/";

  if (parentId) {
    if (!mongoose.Types.ObjectId.isValid(parentId)) {
      throw new Error("Invalid parentId");
    }

    const parentFolder = await Folder.findOne({
      _id: parentId,
      ownerId: requesterId,
      tenantId: requester.tenantId
    });

    if (!parentFolder) {
      throw new Error("Parent folder not found");
    }

    path = `${parentFolder.path}${name}/`;
  } else {
    path = `/${name}/`;
  }

  const existing = await Folder.findOne({
    ownerId: requesterId,
    tenantId: requester.tenantId,
    parentId: parentId,
    name
  });

  if (existing) {
    throw new Error("A folder with this name already exists in this location");
  }

  await assertTenantFolderWithinQuota({
    tenantId: requester.tenantId,
    userId: requesterId,
    increment: 1
  });

  const lastFolder = await Folder.findOne({
    ownerId: requesterId,
    tenantId: requester.tenantId,
    parentId: parentId
  }).sort({ position: -1 });

  const folder = await Folder.create({
    ownerId: requesterId,
    tenantId: requester.tenantId,
    name,
    parentId,
    path,
    color: payload.color || "#3b82f6",
    icon: payload.icon || "folder",
    position: Number.isFinite(Number(payload.position))
      ? Number(payload.position)
      : Number(lastFolder?.position || 0) + 1,
    isRoot: !parentId
  });

  return folder;
};

export const updateUserFolder = async (folderId, requester, payload = {}) => {
  const requesterId = requester?.userId || requester?._id;

  if (!requesterId || !requester?.tenantId) {
    throw new Error("Invalid tenant context");
  }

  if (!mongoose.Types.ObjectId.isValid(folderId)) {
    throw new Error("Invalid folderId");
  }

  const folder = await Folder.findOne({
    _id: folderId,
    ownerId: requesterId,
    tenantId: requester.tenantId
  });

  if (!folder) {
    throw new Error("Folder not found");
  }

  if (Object.prototype.hasOwnProperty.call(payload, "name")) {
    const name = String(payload.name || "").trim();
    if (!name) {
      throw new Error("Folder name is required");
    }

    const duplicate = await Folder.findOne({
      _id: { $ne: folderId },
      ownerId: requesterId,
      tenantId: requester.tenantId,
      parentId: folder.parentId,
      name
    });

    if (duplicate) {
      throw new Error("A folder with this name already exists in this location");
    }

    folder.name = name;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "parentId")) {
    const newParentId = payload.parentId || null;

    if (newParentId && !mongoose.Types.ObjectId.isValid(newParentId)) {
      throw new Error("Invalid parentId");
    }

    if (newParentId) {
      const parentFolder = await Folder.findOne({
        _id: newParentId,
        ownerId: requesterId,
        tenantId: requester.tenantId
      });

      if (!parentFolder) {
        throw new Error("Parent folder not found");
      }

      // Prevent circular references
      if (newParentId === folderId) {
        throw new Error("Cannot set folder as its own parent");
      }

      folder.path = `${parentFolder.path}${folder.name}/`;
    } else {
      folder.path = `/${folder.name}/`;
    }

    folder.parentId = newParentId;
    folder.isRoot = !newParentId;
  }

  // Update path if name changed and we have a parent
  if (folder.parentId && Object.prototype.hasOwnProperty.call(payload, "name")) {
    const parentFolder = await Folder.findById(folder.parentId);
    if (parentFolder) {
      folder.path = `${parentFolder.path}${folder.name}/`;
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, "color")) {
    folder.color = String(payload.color || "#3b82f6");
  }

  if (Object.prototype.hasOwnProperty.call(payload, "icon")) {
    folder.icon = String(payload.icon || "folder");
  }

  if (Object.prototype.hasOwnProperty.call(payload, "position")) {
    const nextPosition = Number(payload.position);
    if (!Number.isFinite(nextPosition)) {
      throw new Error("Invalid position");
    }
    folder.position = nextPosition;
  }

  await folder.save();
  return folder;
};

export const deleteUserFolder = async (folderId, requester) => {
  const requesterId = requester?.userId || requester?._id;

  if (!requesterId || !requester?.tenantId) {
    throw new Error("Invalid tenant context");
  }

  if (!mongoose.Types.ObjectId.isValid(folderId)) {
    throw new Error("Invalid folderId");
  }

  const folder = await Folder.findOne({
    _id: folderId,
    ownerId: requesterId,
    tenantId: requester.tenantId
  });

  if (!folder) {
    throw new Error("Folder not found");
  }

  // Get all subfolders recursively
  const getAllSubfolders = async (parentId) => {
    const subfolders = await Folder.find({
      parentId,
      ownerId: requesterId,
      tenantId: requester.tenantId
    });

    let allSubfolders = [...subfolders];

    for (const subfolder of subfolders) {
      const deeperSubfolders = await getAllSubfolders(subfolder._id);
      allSubfolders = allSubfolders.concat(deeperSubfolders);
    }

    return allSubfolders;
  };

  const allFoldersToDelete = [folder, ...await getAllSubfolders(folderId)];
  const folderIdsToDelete = allFoldersToDelete.map(f => f._id);

  // Update files in these folders to remove folder assignment
  await File.updateMany(
    {
      tenantId: requester.tenantId,
      ownerId: requesterId,
      ownerSpaceId: { $in: folderIdsToDelete }
    },
    {
      $set: { ownerSpaceId: null }
    }
  );

  // Delete all folders
  await Folder.deleteMany({ _id: { $in: folderIdsToDelete } });

  return true;
};

export const assignFileToSpace = async (fileId, requester, payload = {}) => {
  const requesterId = requester?.userId || requester?._id;

  if (!requesterId || !requester?.tenantId) {
    throw new Error("Invalid tenant context");
  }

  const file = await File.findById(fileId);
  if (!file) {
    throw new Error("File not found");
  }

  if (file.tenantId.toString() !== requester.tenantId.toString()) {
    throw new Error("Access denied");
  }

  if (file.ownerId.toString() !== requesterId.toString()) {
    throw new Error("Not authorized");
  }

  const nextSpaceId = payload.spaceId;
  if (!nextSpaceId) {
    file.ownerSpaceId = null;
    await file.save();
    return file;
  }

  if (!mongoose.Types.ObjectId.isValid(nextSpaceId)) {
    throw new Error("Invalid spaceId");
  }

  const targetSpace = await Folder.findOne({
    _id: nextSpaceId,
    ownerId: requesterId,
    tenantId: requester.tenantId
  });

  if (!targetSpace) {
    throw new Error("Space not found");
  }

  file.ownerSpaceId = targetSpace._id;
  await file.save();

  return await File.findById(file._id)
    .populate("ownerId", "firstName lastName email")
    .populate("ownerSpaceId", "name color icon");
};



export const shareFile = async (fileId, ownerId, targetUserId, tenantId) => {

  const file = await File.findById(fileId);

  if (!file) throw new Error("File not found");

  if (file.tenantId.toString() !== tenantId.toString()) {
    throw new Error("Access denied");
  }

  if (file.ownerId.toString() !== ownerId.toString())
    throw new Error("Not authorized");

  const restriction = getFileRestrictionLevel(file);

  // Users cannot share restricted files, admins can share quarantined files for investigation
  if (restriction.restricted && (restriction.level === "blocked" || requester.role !== ROLES.SUPERADMIN && requester.role !== ROLES.TENANT_ADMIN)) {
    throw new Error("Restricted file: only deletion is allowed");
  }

  const targetUser = await User.findById(targetUserId);
  if (!targetUser) throw new Error("Target user not found");

  if (targetUser.tenantId.toString() !== tenantId.toString()) {
    throw new Error("Target user must belong to same tenant");
  }

  file.sharedWith.addToSet(targetUserId);
  await file.save();

  return file;
};

export const updateFileSettings = async (fileId, requester, data = {}) => {
  if (!requester?.tenantId || !requester?.userId) {
    throw new Error("Invalid tenant context");
  }

  const file = await File.findById(fileId);
  if (!file) throw new Error("File not found");

  if (file.tenantId.toString() !== requester.tenantId.toString()) {
    throw new Error("Access denied");
  }

  if (
    file.ownerId.toString() !== requester.userId.toString() &&
    requester.role !== ROLES.SUPERADMIN &&
    requester.role !== ROLES.TENANT_ADMIN
  ) {
    throw new Error("Not authorized");
  }

  const restriction = getFileRestrictionLevel(file);

  // Users cannot modify restricted files, admins can modify quarantined files for investigation
  if (restriction.restricted && (restriction.level === "blocked" || requester.role !== ROLES.SUPERADMIN && requester.role !== ROLES.TENANT_ADMIN)) {
    throw new Error("Restricted file: only deletion is allowed");
  }

  const nextStatus = data.status;
  if (nextStatus && !["active", "expired", "blocked", "quarantined"].includes(nextStatus)) {
    throw new Error("Invalid file status");
  }

  if (Object.prototype.hasOwnProperty.call(data, "description")) {
    file.description = String(data.description || "").trim();
  }

  if (Object.prototype.hasOwnProperty.call(data, "expirationDate")) {
    file.expirationDate = data.expirationDate ? new Date(data.expirationDate) : null;
  }

  if (Object.prototype.hasOwnProperty.call(data, "maxDownloads")) {
    const maxDownloads = Number(data.maxDownloads);
    if (!Number.isFinite(maxDownloads) || maxDownloads < 1) {
      throw new Error("Invalid maxDownloads");
    }
    file.maxDownloads = maxDownloads;
  }

  if (nextStatus) {
    file.status = nextStatus;
  }

  if (Object.prototype.hasOwnProperty.call(data, "allowedIPs")) {
    file.allowedIPs = Array.isArray(data.allowedIPs) ? data.allowedIPs : [];
  }

  await file.save();
  await logFileActivityForShares(file._id, requester.userId, "file_settings_updated", {
    status: file.status,
    expirationDate: file.expirationDate,
    maxDownloads: file.maxDownloads,
    hasAllowedIPs: Array.isArray(file.allowedIPs) && file.allowedIPs.length > 0
  });

  // Activity log: file update
  try {
    await activityService.logActivity({
      userId: requester.userId,
      tenantId: requester.tenantId,
      type: 'file',
      action: 'update',
      resourceId: file._id,
      resourceType: 'file',
      metadata: { status: file.status, expirationDate: file.expirationDate },
      ip: requester.ipAddress || null,
      userAgent: requester.userAgent || null
    });
  } catch (e) {
    console.warn('[Activity] failed to log file update:', e.message);
  }

  return file;
};


/**
 * Create a secure shared link for file download
 * 
 * OPTIONS:
 * - expiresInHours: Link expiration time (default: 24 hours)
 * - maxUses: Maximum download count (default: 1)
 * - recipientUserId: Restrict download to specific user
 * - recipientEmail: Restrict download to email (if user not found yet)
 * - accessControl: "public" | "recipient-only" | "ip-restricted" (default: public)
 * - allowedIPs: Array of IP addresses for ip-restricted mode
 * - password: Optional password protection
 * - purpose: "temporary-access" | "archive-backup" | "external-review" | "approval-workflow"
 * - securityLevel: "public" | "internal" | "confidential" | "restricted"
 */
export const createShareLink = async (
  fileId,
  requester,
  options = {}
) => {
  const file = await File.findById(fileId);
  if (!file) throw new Error("File not found");

  if (!requester?.tenantId) throw new Error("Invalid tenant context");

  if (file.tenantId.toString() !== requester.tenantId.toString()) {
    throw new Error("Access denied");
  }

  if (file.ownerId.toString() !== requester.userId.toString()) {
    throw new Error("Not authorized");
  }

  const restriction = getFileRestrictionLevel(file);

  // Users cannot create share links for restricted files, admins can for quarantined files
  if (restriction.restricted && (restriction.level === "blocked" || requester.role !== ROLES.SUPERADMIN && requester.role !== ROLES.TENANT_ADMIN)) {
    throw new Error("Restricted file: only deletion is allowed");
  }

  if (options.recipientUserId) {
    const recipientUser = await User.findById(options.recipientUserId).select("tenantId");
    if (!recipientUser) {
      throw new Error("Target user not found");
    }

    if (!recipientUser.tenantId || recipientUser.tenantId.toString() !== requester.tenantId.toString()) {
      throw new Error("Target user must belong to same tenant");
    }
  }

  if (Array.isArray(options.recipientUserIds) && options.recipientUserIds.length > 0) {
    const recipients = await User.find({ _id: { $in: options.recipientUserIds } }).select("tenantId");
    if (recipients.length !== options.recipientUserIds.length) {
      throw new Error("One or more target users not found");
    }

    const hasCrossTenantRecipient = recipients.some(
      (recipient) => !recipient.tenantId || recipient.tenantId.toString() !== requester.tenantId.toString()
    );

    if (hasCrossTenantRecipient) {
      throw new Error("All target users must belong to the same tenant");
    }
  }

  // Validate access control mode
  let accessControl = options.accessControl || "public";
  if (!["public", "recipient-only", "ip-restricted"].includes(accessControl)) {
    throw new Error("Invalid access control mode");
  }

  // If recipient-only, require recipient specification
  if (accessControl === "recipient-only" && !options.recipientUserId && !options.recipientEmail) {
    throw new Error("Recipient-only mode requires recipientUserId or recipientEmail");
  }

  // If IP-restricted, require IP list
  if (accessControl === "ip-restricted" && (!options.allowedIPs || options.allowedIPs.length === 0)) {
    throw new Error("IP-restricted mode requires allowedIPs array");
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresInHours = Number(options.expiresInHours || 24);
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

  const sharedLinkData = {
    tenantId: file.tenantId,
    fileId: file._id,
    createdBy: requester.userId,
    recipientUserId: options.recipientUserId || null,
    recipientUserIds: options.recipientUserIds || [],
    recipientEmail: options.recipientEmail || null,
    tokenHash,
    expiresAt,
    maxUses: Number(options.maxUses || 1),
    accessControl,
    allowedIPs: options.allowedIPs || [],
    purpose: options.purpose || "temporary-access",
    securityLevel: options.securityLevel || "internal",
    shareSubject: options.shareSubject || "",
    shareDescription: options.shareDescription || "",
    requireRecipientAuth: accessControl === "recipient-only",
    accessLog: []
  };

  const sharedLink = await SharedLink.create(sharedLinkData);

  console.log(`[DEBUG] createShareLink: created shared link ${sharedLink._id} for file ${fileId}, recipientUserIds=${JSON.stringify(options.recipientUserIds)}, recipientUserId=${options.recipientUserId}, recipientEmail=${options.recipientEmail}`);

  // Determine recipient email for notifications
  let recipientEmail = options.recipientEmail || null;
  let recipientName = options.recipientName || null;
  const recipientUsers = Array.isArray(options.recipientUserIds) && options.recipientUserIds.length > 0
    ? await User.find({ _id: { $in: options.recipientUserIds } }).select("email firstName lastName").lean()
    : [];
  const internalRecipientIds = [...new Set([
    options.recipientUserId,
    ...(Array.isArray(options.recipientUserIds) ? options.recipientUserIds : [])
  ].filter(Boolean).map((value) => value.toString()))];

  if (!recipientEmail && options.recipientUserId) {
    const recipientUser = await User.findById(options.recipientUserId)
      .select("email firstName lastName")
      .lean();
    if (recipientUser) {
      recipientEmail = recipientUser.email;
      recipientName = getDisplayName(recipientUser);
    }
  }

  if (!recipientEmail && Array.isArray(options.recipientUserIds) && options.recipientUserIds.length > 0) {
    const firstRecipient = recipientUsers[0] || await User.findById(options.recipientUserIds[0])
      .select("email firstName lastName")
      .lean();
    if (firstRecipient) {
      recipientEmail = firstRecipient.email;
      recipientName = getDisplayName(firstRecipient);
    }
  }

  const recipientEmails = [];

  if (options.recipientEmail) {
    recipientEmails.push(options.recipientEmail);
  }

  if (recipientUsers.length > 0) {
    const recipientEmailLookup = new Map(
      recipientUsers
        .filter((recipient) => recipient?._id && recipient?.email)
        .map((recipient) => [recipient._id.toString(), recipient.email])
    );

    for (const recipientId of options.recipientUserIds || []) {
      const email = recipientEmailLookup.get(recipientId.toString());
      if (email) {
        recipientEmails.push(email);
      }
    }
  } else if (recipientEmail) {
    recipientEmails.push(recipientEmail);
  }

  const normalizedRecipientEmails = [];
  const seenRecipientEmails = new Set();

  for (const email of recipientEmails) {
    const normalizedEmail = String(email || "").trim();
    if (!normalizedEmail) {
      continue;
    }

    const normalizedKey = normalizedEmail.toLowerCase();
    if (seenRecipientEmails.has(normalizedKey)) {
      continue;
    }

    seenRecipientEmails.add(normalizedKey);
    normalizedRecipientEmails.push(normalizedEmail);
  }

  if (!recipientEmail && normalizedRecipientEmails.length > 0) {
    recipientEmail = normalizedRecipientEmails[0];
  }

  const baseUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;
  const owner = await User.findById(requester.userId)
    .select("email firstName lastName")
    .lean();
  const ownerName = getDisplayName(owner);

  // Keep ShareHistory in sync with real sharing actions.
  try {
    const historyRecord = await logShare({
      fileId: file._id,
      fileName: file.originalName || file.filename,
      fileSize: file.size || 0,
      mimeType: file.mimeType,
      fileHash: file.contentHash,
      shareUrl: `${baseUrl}/file/shared/${rawToken}/download`,
      sharedByUserId: requester.userId,
      sharedByEmail: owner?.email || "unknown@local",
      sharedByTenantId: requester.tenantId,
      sharedWithUserId: options.recipientUserId || (Array.isArray(options.recipientUserIds) && options.recipientUserIds.length > 0 ? options.recipientUserIds[0] : null),
      sharedWithEmail: recipientEmail || "unknown@local",
      sharedWithTenantId: requester.tenantId,
      recipientEmails: normalizedRecipientEmails,
      recipientCount: normalizedRecipientEmails.length || (recipientEmail ? 1 : 0),
      shareType: accessControl === "public" ? "public" : "direct",
      accessLevel: "download",
      expiresAt,
      hasPassword: Boolean(options.password),
      maxDownloads: Number(options.maxUses || 1),
      ipAddress: requester.ipAddress,
      userAgent: requester.userAgent,
      note: options.note || null,
      subject: options.subject || null
    });

    if (historyRecord?._id) {
      sharedLink.shareHistoryId = historyRecord._id;
      await sharedLink.save();
    }
  } catch (historyError) {
    console.warn("[ShareHistory] Failed to log share during link creation:", historyError.message);
  }
  if (internalRecipientIds.length > 0) {
    try {
      await notifyFileReceived({
        recipientUserIds: internalRecipientIds,
        tenantId: requester.tenantId,
        senderName: ownerName,
        fileId: file._id,
        fileName: file.originalName || file.filename
      });
    } catch (notificationError) {
      console.warn("[Notifications] Failed to notify internal recipients:", notificationError.message);
    }
  }

  // ✅ Send notification email to recipient (only if recipientEmail is provided)
  if (recipientEmail && options.notifyRecipient !== false) {
    try {
      // Get tenant information
      const tenant = await Tenant.findById(requester.tenantId).select("name").lean();
      const tenantName = tenant?.name || "Organisation";

      const emailResult = await sendShareNotificationEmail({
        recipientEmail,
        senderName: ownerName,
        senderEmail: owner?.email || "system@pfe.local",
        tenantName,
        recipientName: recipientName || options.recipientName || null,
        fileName: file.originalName || file.filename,
        fileType: file.mimeType || "unknown",
        fileSize: file.size || 0,
        shareLink: `${baseUrl}/file/shared/${rawToken}/download`,
        note: options.note || null,
        subject: options.subject || null,
        expiresAt,
        accessLevel: "download"
      });

      if (!emailResult.success) {
        console.warn("[CreateShareLink] Warning: Failed to send notification email - " + emailResult.message);
      } else {
        console.log(`[CreateShareLink] ✅ Notification email sent to ${recipientEmail}`);
      }
    } catch (emailError) {
      console.error("[CreateShareLink] Error sending notification email:", emailError.message);
      // Don't throw - allow share to succeed even if email fails
    }
  }

  // Activity log: share creation
  try {
    await activityService.logActivity({
      userId: requester.userId,
      tenantId: requester.tenantId,
      type: 'share',
      action: 'create_share',
      resourceId: sharedLink._id,
      resourceType: 'shared_link',
      metadata: { fileId: file._id, fileName: file.originalName, recipients: normalizedRecipientEmails },
      ip: requester.ipAddress || null,
      userAgent: requester.userAgent || null
    });
  } catch (e) {
    console.warn('[Activity] failed to log share creation:', e.message);
  }

  return {
    linkId: sharedLink._id,
    token: rawToken,
    shareUrl: `${baseUrl}/file/shared/${rawToken}/download`,
    accessControl,
    recipientInfo: {
      userId: options.recipientUserId || null,
      userIds: options.recipientUserIds || [],
      email: options.recipientEmail || null,
      requiresAuth: accessControl === "recipient-only"
    },
    expiresAt: sharedLink.expiresAt,
    maxUses: sharedLink.maxUses,
    purpose: sharedLinkData.purpose,
    securityLevel: sharedLinkData.securityLevel,
    message: accessControl === "recipient-only" 
      ? `Only ${options.recipientEmail || "the specified recipient"} can download this file`
      : `Public link: anyone with this URL can download`
  };
};


/**
 * Download file from a shared link
 * 
 * SECURITY MODES:
 * 1. Public (default): Anyone with URL can download
 * 2. Recipient-Only: Only authenticated recipient can download
 * 3. IP-Restricted: Only whitelisted IPs can download
 */
export const downloadSharedLink = async (token, requester = null, ipAddress = null) => {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) {
    throw new Error("Invalid share token");
  }

  const tokenHash = hashToken(normalizedToken);

  let sharedLink = null;

  const populateConfig = {
    path: "fileId",
    populate: { path: "encryptionKeyId" },
  };

  sharedLink = await SharedLink.findOne({
    tokenHash,
    revokedAt: null,
  }).populate(populateConfig);

  if (!sharedLink) {
    sharedLink = await SharedLink.findOne({
      tokenHash: normalizedToken,
      revokedAt: null,
    }).populate(populateConfig);
  }

  if (!sharedLink && mongoose.Types.ObjectId.isValid(normalizedToken)) {
    sharedLink = await SharedLink.findOne({
      _id: normalizedToken,
      revokedAt: null,
    }).populate(populateConfig);
  }

  if (!sharedLink) throw new Error("Share link not found");

  if (
    requester &&
    requester.tenantId &&
    requester.tenantId.toString() !== sharedLink.tenantId.toString()
  ) {
    logAccessAttempt(sharedLink, requester, ipAddress, false, "Tenant mismatch");
    throw new Error("Access denied");
  }

  // SECURITY: Check expiration
  if (sharedLink.expiresAt < new Date()) {
    logAccessAttempt(sharedLink, requester, ipAddress, false, "Link expired");
    throw new Error("Share link expired");
  }

  // SECURITY: Check usage limits
  if (sharedLink.usedCount >= sharedLink.maxUses) {
    logAccessAttempt(sharedLink, requester, ipAddress, false, "Reached max downloads");
    throw new Error("Share link exhausted");
  }

  // SECURITY: Enforce recipient-only access if configured
  if (sharedLink.accessControl === "recipient-only" || sharedLink.requireRecipientAuth) {
    if (!requester) {
      logAccessAttempt(sharedLink, requester, ipAddress, false, "Auth required but no user provided");
      throw new Error("Authentication required to access this shared link");
    }

    if (sharedLink.recipientUserId || (sharedLink.recipientUserIds && sharedLink.recipientUserIds.length > 0)) {
      const allowedRecipients = new Set([
        ...(sharedLink.recipientUserId ? [sharedLink.recipientUserId.toString()] : []),
        ...(sharedLink.recipientUserIds || []).map((recipientId) => recipientId.toString())
      ]);

      if (!allowedRecipients.has(requester.userId.toString())) {
        logAccessAttempt(sharedLink, requester, ipAddress, false, "User not recipient");
        throw new Error("Only the intended recipient can access this link");
      }
    } else if (sharedLink.recipientEmail) {
      // Verify email matches (in case user created account after link was shared)
      const user = await User.findById(requester.userId).select("email");
      if (!user || user.email.toLowerCase() !== sharedLink.recipientEmail.toLowerCase()) {
        logAccessAttempt(sharedLink, requester, ipAddress, false, "Email not recipient email");
        throw new Error("Only the intended recipient email can access this link");
      }
    }
  }

  // SECURITY: Enforce IP restrictions if configured
  if (sharedLink.accessControl === "ip-restricted" && sharedLink.allowedIPs.length > 0) {
    if (!ipAddress || !sharedLink.allowedIPs.includes(ipAddress)) {
      logAccessAttempt(sharedLink, requester, ipAddress, false, "IP not allowed");
      throw new Error("Your IP address is not authorized to access this link");
    }
  }

  const file = sharedLink.fileId;
  if (!file) throw new Error("File not found");

  const restriction = getFileRestrictionLevel(file);

  // Shared links cannot access quarantined or blocked files
  if (restriction.restricted) {
    logAccessAttempt(sharedLink, requester, ipAddress, false, `File ${restriction.level}`);
    throw new Error("File download is suspended");
  }

  const payload = await decryptStoredFile(file);

  // Update download counters
  sharedLink.usedCount += 1;
  sharedLink.lastAccessedAt = new Date();
  await sharedLink.save();

  file.downloadCount += 1;
  await file.save();

  // Activity log: direct file download
  try {
    await activityService.logActivity({
      userId: user.userId || user._id,
      tenantId: user.tenantId || null,
      type: 'file',
      action: 'download',
      resourceId: file._id,
      resourceType: 'file',
      metadata: { fileName: file.originalName, size: file.size },
      ip: userIP,
      userAgent: user.userAgent || null
    });
  } catch (e) {
    console.warn('[Activity] failed to log file download:', e.message);
  }

  // Log successful access
  logAccessAttempt(sharedLink, requester, ipAddress, true, "Success");
  await pushShareAuditEvent(sharedLink, "download", requester, ipAddress);

  // Activity log: shared download
  try {
    await activityService.logActivity({
      userId: requester?.userId || null,
      tenantId: sharedLink.tenantId || null,
      type: 'share',
      action: 'download_shared',
      resourceId: sharedLink._id,
      resourceType: 'shared_link',
      metadata: { fileId: file._id, fileName: file.originalName },
      ip: ipAddress,
      userAgent: requester?.userAgent || null
    });
  } catch (e) {
    console.warn('[Activity] failed to log shared download:', e.message);
  }

  return payload;
};

export const rescanSharedLink = async (token, requester = null, ipAddress = null) => {
  const normalizedToken = String(token || "").trim();
  if (!normalizedToken) {
    throw new Error("Invalid share token");
  }

  const tokenHash = hashToken(normalizedToken);
  const populateConfig = {
    path: "fileId",
    populate: { path: "encryptionKeyId" }
  };

  let sharedLink = await SharedLink.findOne({
    tokenHash,
    revokedAt: null
  }).populate(populateConfig);

  if (!sharedLink) {
    sharedLink = await SharedLink.findOne({
      tokenHash: normalizedToken,
      revokedAt: null
    }).populate(populateConfig);
  }

  if (!sharedLink && mongoose.Types.ObjectId.isValid(normalizedToken)) {
    sharedLink = await SharedLink.findOne({
      _id: normalizedToken,
      revokedAt: null
    }).populate(populateConfig);
  }

  if (!sharedLink) {
    throw new Error("Share link not found");
  }

  if (
    requester &&
    requester.tenantId &&
    requester.tenantId.toString() !== sharedLink.tenantId.toString()
  ) {
    logAccessAttempt(sharedLink, requester, ipAddress, false, "Tenant mismatch");
    throw new Error("Access denied");
  }

  if (sharedLink.expiresAt < new Date()) {
    logAccessAttempt(sharedLink, requester, ipAddress, false, "Link expired");
    throw new Error("Share link expired");
  }

  if (sharedLink.accessControl === "recipient-only" || sharedLink.requireRecipientAuth) {
    if (!requester) {
      logAccessAttempt(sharedLink, requester, ipAddress, false, "Auth required but no user provided");
      throw new Error("Authentication required to access this shared link");
    }

    if (sharedLink.recipientUserId || (sharedLink.recipientUserIds && sharedLink.recipientUserIds.length > 0)) {
      const allowedRecipients = new Set([
        ...(sharedLink.recipientUserId ? [sharedLink.recipientUserId.toString()] : []),
        ...(sharedLink.recipientUserIds || []).map((recipientId) => recipientId.toString())
      ]);

      if (!allowedRecipients.has(requester.userId.toString())) {
        logAccessAttempt(sharedLink, requester, ipAddress, false, "User not recipient");
        throw new Error("Only the intended recipient can access this link");
      }
    } else if (sharedLink.recipientEmail) {
      const user = await User.findById(requester.userId).select("email");
      if (!user || user.email.toLowerCase() !== sharedLink.recipientEmail.toLowerCase()) {
        logAccessAttempt(sharedLink, requester, ipAddress, false, "Email not recipient email");
        throw new Error("Only the intended recipient email can access this link");
      }
    }
  }

  if (sharedLink.accessControl === "ip-restricted" && sharedLink.allowedIPs.length > 0) {
    if (!ipAddress || !sharedLink.allowedIPs.includes(ipAddress)) {
      logAccessAttempt(sharedLink, requester, ipAddress, false, "IP not allowed");
      throw new Error("Your IP address is not authorized to access this link");
    }
  }

  const file = sharedLink.fileId;
  if (!file) {
    throw new Error("File not found");
  }

  const restriction = getFileRestrictionLevel(file);

  // Shared links cannot access quarantined or blocked files
  if (restriction.restricted) {
    logAccessAttempt(sharedLink, requester, ipAddress, false, `File ${restriction.level}`);
    throw new Error("File access is suspended");
  }

  const payload = await decryptStoredFile(file);
  const tempName = `rescan-${Date.now()}-${crypto.randomBytes(8).toString("hex")}-${path.basename(file.originalName)}`;
  const tempPath = path.join("uploads", tempName);

  await fs.mkdir(path.dirname(tempPath), { recursive: true });
  await fs.writeFile(tempPath, payload.buffer);

  try {
    const clamavResult = await scanFileWithClamAV(tempPath, file.originalName);
    let virustotalResult = null;

    try {
      virustotalResult = await scanFile(tempPath);
    } catch (scanError) {
      virustotalResult = {
        isInfected: false,
        viruses: [],
        engine: "virustotal",
        warning: scanError.message,
        detectionRatio: undefined,
        stats: undefined
      };
    }

    const fileHash = file.contentHash || crypto.createHash("sha256").update(payload.buffer).digest("hex");
    const isInfected = Boolean(clamavResult?.isInfected) || Boolean(virustotalResult?.isInfected);

    logAccessAttempt(sharedLink, requester, ipAddress, true, "Verify");
    await pushShareAuditEvent(sharedLink, "view", requester, ipAddress);

    return {
      fileId: file._id.toString(),
      shareToken: normalizedToken,
      originalName: file.originalName,
      mimeType: file.mimeType,
      size: file.size,
      fileHash,
      isInfected,
      warning: virustotalResult?.warning || clamavResult?.warning || null,
      virustotalUrl: fileHash ? `https://www.virustotal.com/gui/search/${fileHash}` : null,
      clamavResult: {
        isInfected: Boolean(clamavResult?.isInfected),
        viruses: clamavResult?.viruses || [],
        engine: clamavResult?.engine || "clamav-local",
        warning: clamavResult?.warning || null
      },
      virustotalResult: virustotalResult ? {
        isInfected: Boolean(virustotalResult?.isInfected),
        detectionRatio: virustotalResult?.detectionRatio,
        stats: virustotalResult?.stats,
        warning: virustotalResult?.warning || null
      } : null,
      scanDate: new Date().toISOString()
    };
  } finally {
    await fs.unlink(tempPath).catch(() => null);
  }
};

/**
 * AUDIT: Log all access attempts to shared links
 */
const logAccessAttempt = async (sharedLink, requester, ipAddress, success, failureReason) => {
  try {
    if (!sharedLink.accessLog) {
      sharedLink.accessLog = [];
    }

    sharedLink.accessLog.push({
      userId: requester?.userId || null,
      ipAddress: ipAddress || "unknown",
      userAgent: requester?.userAgent || "unknown",
      timestamp: new Date(),
      success,
      failureReason: success ? null : failureReason
    });

    // Keep only last 100 access attempts
    if (sharedLink.accessLog.length > 100) {
      sharedLink.accessLog = sharedLink.accessLog.slice(-100);
    }

    await sharedLink.save();
  } catch (error) {
    console.warn("Failed to log access attempt:", error.message);
  }
};


export const revokeShareLink = async (linkId, requester) => {
  const sharedLink = await SharedLink.findById(linkId).populate("fileId");
  if (!sharedLink) throw new Error("Share link not found");

  if (!requester?.tenantId) throw new Error("Invalid tenant context");

  if (sharedLink.tenantId.toString() !== requester.tenantId.toString()) {
    throw new Error("Access denied");
  }

  if (
    sharedLink.createdBy.toString() !== requester.userId.toString() &&
    requester.role !== ROLES.SUPERADMIN &&
    requester.role !== ROLES.TENANT_ADMIN
  ) {
    throw new Error("Not authorized");
  }

  sharedLink.revokedAt = new Date();
  await sharedLink.save();

  // Activity log: revoke share
  try {
    await activityService.logActivity({
      userId: requester.userId,
      tenantId: requester.tenantId,
      type: 'share',
      action: 'revoke_share',
      resourceId: sharedLink._id,
      resourceType: 'shared_link',
      metadata: { fileId: sharedLink.fileId?._id || sharedLink.fileId, reason: null },
      ip: requester.ipAddress || null,
      userAgent: requester.userAgent || null
    });
  } catch (e) {
    console.warn('[Activity] failed to log share revoke:', e.message);
  }

  return true;
};



export const downloadFile = async (fileId, user, userIP) => {
  const requesterId = user.userId || user._id;

  if (!requesterId || !user.tenantId) {
    throw new Error("Invalid tenant context");
  }

  const file = await File.findById(fileId)
    .populate("encryptionKeyId");

  if (!file) throw new Error("File not found");

  if (user.role !== ROLES.SUPERADMIN && file.tenantId.toString() !== user.tenantId.toString()) {
    throw new Error("Access denied");
  }

  const restriction = getFileRestrictionLevel(file);

  // Users cannot download restricted files.
  // Super admins can still download blocked/quarantined files for security investigation.
  // Tenant admins keep access only for quarantined files in their tenant.
  const isSecurityAdmin = user.role === ROLES.SUPERADMIN || user.role === ROLES.TENANT_ADMIN;
  const canInvestigateBlocked = user.role === ROLES.SUPERADMIN;

  if (restriction.restricted && !isSecurityAdmin) {
    throw new Error("File download is suspended");
  }

  // Authorization
  const isOwner =
    file.ownerId.toString() === requesterId.toString();

  const isShared =
    file.sharedWith.some(
      (sharedUserId) => sharedUserId.toString() === requesterId.toString()
    );

  const isAdminInvestigator =
    restriction.restricted &&
    (
      (restriction.level === "quarantined" && isSecurityAdmin) ||
      (restriction.level === "blocked" && canInvestigateBlocked)
    );

  if (!isOwner && !isShared && !isAdminInvestigator)
    throw new Error("Access denied");

  // Expiration check
  if (file.expirationDate &&
      file.expirationDate < new Date())
    throw new Error("File expired");

  // Download limit
  if (file.downloadCount >= file.maxDownloads)
    throw new Error("Max downloads reached");

  // IP restriction
  if (file.allowedIPs?.length > 0 &&
      !file.allowedIPs.includes(userIP))
    throw new Error("IP not allowed");

  const payload = await decryptStoredFile(file);

  file.downloadCount += 1;
  await file.save();

  return payload;
};



export const deleteFile = async (fileId, userId, tenantId, requesterRole = null) => {

  const file = await File.findById(fileId);

  if (!file) throw new Error("File not found");

  if (requesterRole !== ROLES.SUPERADMIN && file.tenantId.toString() !== tenantId.toString()) {
    throw new Error("Access denied");
  }

  if (requesterRole !== ROLES.SUPERADMIN && file.ownerId.toString() !== userId.toString())
    throw new Error("Not authorized");

  await logFileActivityForShares(file._id, userId, "file_deleted", {
    fileName: file.originalName,
    deletedAt: new Date()
  });

  // Activity log: file deletion
  try {
    await activityService.logActivity({
      userId,
      tenantId,
      type: 'file',
      action: 'delete',
      resourceId: file._id,
      resourceType: 'file',
      metadata: { fileName: file.originalName },
      ip: null,
      userAgent: null
    });
  } catch (e) {
    console.warn('[Activity] failed to log file deletion:', e.message);
  }

  // Delete file from MinIO storage
  await deleteFromStorage(file.tenantId, file.bucketName, file.storagePath);
  await EncryptionKey.findByIdAndDelete(file.encryptionKeyId);
  await File.findByIdAndDelete(fileId);

  return true;
};

export const getFilesSharedWithMe = async (requester, filters = {}) => {
  if (!requester?.tenantId || !requester?.userId) {
    throw new Error("Invalid tenant context");
  }

  const user = await User.findById(requester.userId);
  if (!user) throw new Error("User not found");

  console.log(`[DEBUG] getFilesSharedWithMe: userId=${requester.userId}, tenantId=${requester.tenantId}, email=${user.email}`);

  const userEmail = String(user.email || "").toLowerCase();

  const hiddenScope = String(filters?.hiddenScope || "visible").toLowerCase();

  const query = {
    tenantId: requester.tenantId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
    $or: [
      { recipientUserId: requester.userId },
      { recipientUserIds: requester.userId },
      { recipientEmail: userEmail }
    ]
  };

  if (hiddenScope === "hidden") {
    query.hiddenForUserIds = requester.userId;
  } else {
    query.hiddenForUserIds = { $ne: requester.userId };
  }

  if (filters?.senderId && mongoose.Types.ObjectId.isValid(filters.senderId)) {
    query.createdBy = filters.senderId;
  }

  const sharedLinks = await SharedLink.find(query)
    .populate({
      path: "fileId",
      select: "originalName size createdAt ownerId",
      populate: {
        path: "ownerId",
        select: "firstName lastName email"
      }
    })
    .populate({
      path: "createdBy",
      select: "firstName lastName email"
    })
    .sort({ createdAt: -1 });

  console.log(`[DEBUG] getFilesSharedWithMe: found ${sharedLinks.length} shared links`);

  const baseUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;

  let response = sharedLinks
    .filter((link) => Boolean(link.fileId) && link.fileId.status !== "blocked")
    .map(link => ({
      linkId: link._id,
      fileId: link.fileId._id,
      file: link.fileId,
      sharedBy: link.createdBy,
      recipient: link.recipientUserId || { email: link.recipientEmail },
      recipientUsers: link.recipientUserIds,
      recipientEmail: link.recipientEmail,
      accessControl: link.accessControl,
      createdAt: link.createdAt,
      expiresAt: link.expiresAt,
      usedCount: link.usedCount,
      maxUses: link.maxUses,
      shareSubject: link.shareSubject || '',
      shareDescription: link.shareDescription || '',
      shareUrl: link.accessControl === 'public' ? `${baseUrl}/file/shared/${link._id}/download` : null
    }));

  if (filters?.senderQuery) {
    const senderQuery = String(filters.senderQuery).toLowerCase().trim();

    response = response.filter((item) => {
      const firstName = item.sharedBy?.firstName || "";
      const lastName = item.sharedBy?.lastName || "";
      const email = item.sharedBy?.email || "";
      const fullName = `${firstName} ${lastName}`.trim();

      return (
        fullName.toLowerCase().includes(senderQuery) ||
        email.toLowerCase().includes(senderQuery)
      );
    });
  }

  return response;
};

export const hideSharedLinkForRecipient = async (linkId, requester) => {
  if (!requester?.tenantId || !requester?.userId) {
    throw new Error("Invalid tenant context");
  }

  const sharedLink = await SharedLink.findById(linkId);
  if (!sharedLink) {
    throw new Error("Share link not found");
  }

  if (sharedLink.tenantId.toString() !== requester.tenantId.toString()) {
    throw new Error("Access denied");
  }

  const requesterId = requester.userId.toString();
  const user = await User.findById(requester.userId).select("email");
  const requesterEmail = String(user?.email || "").toLowerCase();

  const allowedRecipients = new Set([
    ...(sharedLink.recipientUserId ? [sharedLink.recipientUserId.toString()] : []),
    ...(sharedLink.recipientUserIds || []).map((recipientId) => recipientId.toString())
  ]);

  const canHideByUserId = allowedRecipients.has(requesterId);
  const canHideByEmail = Boolean(sharedLink.recipientEmail) && requesterEmail === String(sharedLink.recipientEmail).toLowerCase();

  if (!canHideByUserId && !canHideByEmail) {
    throw new Error("Not authorized");
  }

  sharedLink.hiddenForUserIds = sharedLink.hiddenForUserIds || [];
  if (!sharedLink.hiddenForUserIds.some((userId) => userId.toString() === requesterId)) {
    sharedLink.hiddenForUserIds.push(requester.userId);
  }

  await sharedLink.save();

  // Activity log: hide received share
  try {
    await activityService.logActivity({
      userId: requester.userId,
      tenantId: requester.tenantId,
      type: 'share',
      action: 'hide_received_share',
      resourceId: sharedLink._id,
      resourceType: 'shared_link',
      metadata: { fileId: sharedLink.fileId },
      ip: null,
      userAgent: null
    });
  } catch (e) {
    console.warn('[Activity] failed to log hide received share:', e.message);
  }

  return { message: "Share removed from your space" };
};

export const restoreSharedLinkForRecipient = async (linkId, requester) => {
  if (!requester?.tenantId || !requester?.userId) {
    throw new Error("Invalid tenant context");
  }

  const sharedLink = await SharedLink.findById(linkId);
  if (!sharedLink) {
    throw new Error("Share link not found");
  }

  if (sharedLink.tenantId.toString() !== requester.tenantId.toString()) {
    throw new Error("Access denied");
  }

  const requesterId = requester.userId.toString();

  const beforeLength = (sharedLink.hiddenForUserIds || []).length;
  sharedLink.hiddenForUserIds = (sharedLink.hiddenForUserIds || [])
    .filter((userId) => userId.toString() !== requesterId);

  if (sharedLink.hiddenForUserIds.length === beforeLength) {
    return { message: "Share is already visible" };
  }

  await sharedLink.save();
  // Activity log: restore received share
  try {
    await activityService.logActivity({
      userId: requester.userId,
      tenantId: requester.tenantId,
      type: 'share',
      action: 'restore_received_share',
      resourceId: sharedLink._id,
      resourceType: 'shared_link',
      metadata: { fileId: sharedLink.fileId },
      ip: null,
      userAgent: null
    });
  } catch (e) {
    console.warn('[Activity] failed to log restore received share:', e.message);
  }
  return { message: "Share restored to your space" };
};

export const getFilesSharedByMe = async (requester) => {
  if (!requester?.tenantId || !requester?.userId) {
    throw new Error("Invalid tenant context");
  }

  console.log(`[DEBUG] getFilesSharedByMe: userId=${requester.userId}, tenantId=${requester.tenantId}`);

  const sharedLinks = await SharedLink.find({
    tenantId: requester.tenantId,
    createdBy: requester.userId,
    revokedAt: null
  })
    .populate({
      path: "fileId",
      select: "originalName size createdAt ownerId",
      populate: {
        path: "ownerId",
        select: "firstName lastName email"
      }
    })
    .populate({
      path: "recipientUserId",
      select: "firstName lastName email"
    })
    .sort({ createdAt: -1 });

  console.log(`[DEBUG] getFilesSharedByMe: found ${sharedLinks.length} shared links`);

  const baseUrl = process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`;

  return sharedLinks
    .filter((link) => Boolean(link.fileId) && link.fileId.status !== "blocked")
    .map(link => ({
      linkId: link._id,
      fileId: link.fileId._id,
      file: link.fileId,
      recipient: link.recipientUserId || { email: link.recipientEmail },
      recipientUsers: link.recipientUserIds,
      recipientEmail: link.recipientEmail,
      accessControl: link.accessControl,
      createdAt: link.createdAt,
      expiresAt: link.expiresAt,
      usedCount: link.usedCount,
      maxUses: link.maxUses,
      shareSubject: link.shareSubject || '',
      shareDescription: link.shareDescription || '',
      shareUrl: link.accessControl === 'public' ? `${baseUrl}/file/shared/${link._id}/download` : null
    }));
};

const buildMonthLabels = () => [
  "Jan", "Fev", "Mar", "Avr", "Mai", "Juin",
  "Juil", "Aout", "Sep", "Oct", "Nov", "Dec"
];

const buildMonthSeries = (rows = [], key) => {
  const result = new Array(12).fill(0);

  for (const row of rows) {
    const month = Number(row?._id?.month || 0);
    if (month >= 1 && month <= 12) {
      result[month - 1] = Number(row?.[key] || 0);
    }
  }

  return result;
};

const buildYearSeries = (rows = [], key, labels = []) => {
  const map = new Map(rows.map((row) => [String(row?._id?.year), Number(row?.[key] || 0)]));
  return labels.map((year) => map.get(String(year)) || 0);
};

const sumRows = (rows = [], key) => rows.reduce((sum, row) => sum + Number(row?.[key] || 0), 0);

const buildDelta = (current = 0, previous = 0) => {
  const absolute = Number(current) - Number(previous);
  const percent = Number(previous) > 0 ? (absolute / Number(previous)) * 100 : null;

  return {
    absolute,
    percent
  };
};

export const getAnalytics = async (requester, options = {}) => {
  if (!requester?.tenantId) {
    throw new Error("Invalid tenant context");
  }

  const tenantObjectId = new mongoose.Types.ObjectId(requester.tenantId);
  const isAdmin = requester.role === ROLES.SUPERADMIN || requester.role === ROLES.TENANT_ADMIN;
  const requesterId = requester.userId || requester._id;
  const now = new Date();

  const currentYear = now.getFullYear();
  const selectedYear = Math.max(2020, Math.min(Number(options.year) || currentYear, currentYear + 1));
  const selectedMonth = Math.max(1, Math.min(Number(options.month) || now.getMonth() + 1, 12));
  const requestedScope = String(options.scope || "tenant");
  const scope = isAdmin ? (requestedScope === "agent" ? "agent" : "tenant") : "personal";

  const yearStart = new Date(selectedYear, 0, 1);
  const yearEnd = new Date(selectedYear + 1, 0, 1);
  const monthStart = new Date(selectedYear, selectedMonth - 1, 1);
  const monthEnd = new Date(selectedYear, selectedMonth, 1);
  const previousMonthStart = new Date(monthStart);
  previousMonthStart.setMonth(previousMonthStart.getMonth() - 1);
  const previousMonthEnd = new Date(monthStart);

  const previousYearStart = new Date(selectedYear - 1, 0, 1);
  const previousYearEnd = new Date(selectedYear, 0, 1);

  const fileMatch = { tenantId: tenantObjectId };
  const shareMatch = { tenantId: tenantObjectId };

  if (!isAdmin) {
    if (!requesterId) {
      throw new Error("Invalid user context");
    }
    const requesterObjectId = new mongoose.Types.ObjectId(requesterId);
    fileMatch.ownerId = requesterObjectId;
    shareMatch.createdBy = requesterObjectId;
  }

  const [fileSummary] = await File.aggregate([
    { $match: fileMatch },
    {
      $group: {
        _id: null,
        totalFiles: { $sum: 1 },
        totalStorage: { $sum: { $ifNull: ["$size", 0] } },
        totalDownloads: { $sum: { $ifNull: ["$downloadCount", 0] } }
      }
    }
  ]);

  const activeShares = await SharedLink.countDocuments({
    ...shareMatch,
    revokedAt: null,
    expiresAt: { $gt: now }
  });

  const totalShares = await SharedLink.countDocuments(shareMatch);

  const monthlyUploadsRows = await File.aggregate([
    { $match: { ...fileMatch, createdAt: { $gte: yearStart, $lt: yearEnd } } },
    {
      $group: {
        _id: { month: { $month: "$createdAt" } },
        total: { $sum: 1 }
      }
    },
    { $sort: { "_id.month": 1 } }
  ]);

  const monthlySharesRows = await SharedLink.aggregate([
    { $match: { ...shareMatch, createdAt: { $gte: yearStart, $lt: yearEnd } } },
    {
      $group: {
        _id: { month: { $month: "$createdAt" } },
        total: { $sum: 1 }
      }
    },
    { $sort: { "_id.month": 1 } }
  ]);

  const monthlySharedDownloadsRows = await SharedLink.aggregate([
    { $match: shareMatch },
    { $unwind: "$accessLog" },
    {
      $match: {
        "accessLog.success": true,
        "accessLog.timestamp": { $gte: yearStart, $lt: yearEnd }
      }
    },
    {
      $group: {
        _id: { month: { $month: "$accessLog.timestamp" } },
        total: { $sum: 1 }
      }
    },
    { $sort: { "_id.month": 1 } }
  ]);

  const yearLabels = Array.from({ length: 5 }, (_, index) => currentYear - 4 + index);
  const yearWindowStart = new Date(yearLabels[0], 0, 1);
  const yearWindowEnd = new Date(currentYear + 1, 0, 1);

  const yearlyUploadsRows = await File.aggregate([
    { $match: { ...fileMatch, createdAt: { $gte: yearWindowStart, $lt: yearWindowEnd } } },
    {
      $group: {
        _id: { year: { $year: "$createdAt" } },
        total: { $sum: 1 }
      }
    },
    { $sort: { "_id.year": 1 } }
  ]);

  const yearlySharesRows = await SharedLink.aggregate([
    { $match: { ...shareMatch, createdAt: { $gte: yearWindowStart, $lt: yearWindowEnd } } },
    {
      $group: {
        _id: { year: { $year: "$createdAt" } },
        total: { $sum: 1 }
      }
    },
    { $sort: { "_id.year": 1 } }
  ]);

  const yearlySharedDownloadsRows = await SharedLink.aggregate([
    { $match: shareMatch },
    { $unwind: "$accessLog" },
    {
      $match: {
        "accessLog.success": true,
        "accessLog.timestamp": { $gte: yearWindowStart, $lt: yearWindowEnd }
      }
    },
    {
      $group: {
        _id: { year: { $year: "$accessLog.timestamp" } },
        total: { $sum: 1 }
      }
    },
    { $sort: { "_id.year": 1 } }
  ]);

  const [monthSnapshotUploads] = await File.aggregate([
    { $match: { ...fileMatch, createdAt: { $gte: monthStart, $lt: monthEnd } } },
    { $group: { _id: null, total: { $sum: 1 } } }
  ]);

  const [monthSnapshotShares] = await SharedLink.aggregate([
    { $match: { ...shareMatch, createdAt: { $gte: monthStart, $lt: monthEnd } } },
    { $group: { _id: null, total: { $sum: 1 } } }
  ]);

  const [monthSnapshotSharedDownloads] = await SharedLink.aggregate([
    { $match: shareMatch },
    { $unwind: "$accessLog" },
    {
      $match: {
        "accessLog.success": true,
        "accessLog.timestamp": { $gte: monthStart, $lt: monthEnd }
      }
    },
    { $group: { _id: null, total: { $sum: 1 } } }
  ]);

  const [previousMonthUploads] = await File.aggregate([
    { $match: { ...fileMatch, createdAt: { $gte: previousMonthStart, $lt: previousMonthEnd } } },
    { $group: { _id: null, total: { $sum: 1 } } }
  ]);

  const [previousMonthShares] = await SharedLink.aggregate([
    { $match: { ...shareMatch, createdAt: { $gte: previousMonthStart, $lt: previousMonthEnd } } },
    { $group: { _id: null, total: { $sum: 1 } } }
  ]);

  const [previousMonthSharedDownloads] = await SharedLink.aggregate([
    { $match: shareMatch },
    { $unwind: "$accessLog" },
    {
      $match: {
        "accessLog.success": true,
        "accessLog.timestamp": { $gte: previousMonthStart, $lt: previousMonthEnd }
      }
    },
    { $group: { _id: null, total: { $sum: 1 } } }
  ]);

  const yearlySummaryRows = {
    uploads: yearlyUploadsRows,
    shares: yearlySharesRows,
    sharedDownloads: yearlySharedDownloadsRows
  };

  const [previousYearUploadsRows, previousYearSharesRows, previousYearSharedDownloadsRows] = await Promise.all([
    File.aggregate([
      { $match: { ...fileMatch, createdAt: { $gte: previousYearStart, $lt: previousYearEnd } } },
      {
        $group: {
          _id: { year: { $year: "$createdAt" } },
          total: { $sum: 1 }
        }
      },
      { $sort: { "_id.year": 1 } }
    ]),
    SharedLink.aggregate([
      { $match: { ...shareMatch, createdAt: { $gte: previousYearStart, $lt: previousYearEnd } } },
      {
        $group: {
          _id: { year: { $year: "$createdAt" } },
          total: { $sum: 1 }
        }
      },
      { $sort: { "_id.year": 1 } }
    ]),
    SharedLink.aggregate([
      { $match: shareMatch },
      { $unwind: "$accessLog" },
      {
        $match: {
          "accessLog.success": true,
          "accessLog.timestamp": { $gte: previousYearStart, $lt: previousYearEnd }
        }
      },
      {
        $group: {
          _id: { year: { $year: "$accessLog.timestamp" } },
          total: { $sum: 1 }
        }
      },
      { $sort: { "_id.year": 1 } }
    ])
  ]);

  const currentYearSummary = {
    uploads: sumRows(yearlyUploadsRows, "total"),
    shares: sumRows(yearlySharesRows, "total"),
    sharedDownloads: sumRows(yearlySharedDownloadsRows, "total")
  };

  const previousYearSummary = {
    uploads: sumRows(previousYearUploadsRows, "total"),
    shares: sumRows(previousYearSharesRows, "total"),
    sharedDownloads: sumRows(previousYearSharedDownloadsRows, "total")
  };

  const statusBreakdownRows = await File.aggregate([
    { $match: fileMatch },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } }
  ]);

  const mimeBreakdownRows = await File.aggregate([
    { $match: fileMatch },
    {
      $project: {
        topType: {
          $ifNull: [
            { $arrayElemAt: [{ $split: ["$mimeType", "/"] }, 0] },
            "unknown"
          ]
        }
      }
    },
    {
      $group: {
        _id: "$topType",
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } },
    { $limit: 6 }
  ]);

  const response = {
    scope,
    period: {
      year: selectedYear,
      month: selectedMonth
    },
    summary: {
      totalFiles: fileSummary?.totalFiles || 0,
      totalStorage: fileSummary?.totalStorage || 0,
      totalDownloads: fileSummary?.totalDownloads || 0,
      totalShares,
      activeShares
    },
    monthSnapshot: {
      uploads: monthSnapshotUploads?.total || 0,
      shares: monthSnapshotShares?.total || 0,
      sharedDownloads: monthSnapshotSharedDownloads?.total || 0
    },
    comparison: {
      previousMonthSnapshot: {
        uploads: previousMonthUploads?.total || 0,
        shares: previousMonthShares?.total || 0,
        sharedDownloads: previousMonthSharedDownloads?.total || 0
      },
      monthOverMonth: {
        uploads: buildDelta(monthSnapshotUploads?.total || 0, previousMonthUploads?.total || 0),
        shares: buildDelta(monthSnapshotShares?.total || 0, previousMonthShares?.total || 0),
        sharedDownloads: buildDelta(monthSnapshotSharedDownloads?.total || 0, previousMonthSharedDownloads?.total || 0)
      },
      selectedYear: {
        current: currentYearSummary,
        previous: previousYearSummary,
        delta: {
          uploads: buildDelta(currentYearSummary.uploads, previousYearSummary.uploads),
          shares: buildDelta(currentYearSummary.shares, previousYearSummary.shares),
          sharedDownloads: buildDelta(currentYearSummary.sharedDownloads, previousYearSummary.sharedDownloads)
        }
      }
    },
    monthly: {
      labels: buildMonthLabels(),
      uploads: buildMonthSeries(monthlyUploadsRows, "total"),
      shares: buildMonthSeries(monthlySharesRows, "total"),
      sharedDownloads: buildMonthSeries(monthlySharedDownloadsRows, "total")
    },
    yearly: {
      labels: yearLabels,
      uploads: buildYearSeries(yearlyUploadsRows, "total", yearLabels),
      shares: buildYearSeries(yearlySharesRows, "total", yearLabels),
      sharedDownloads: buildYearSeries(yearlySharedDownloadsRows, "total", yearLabels)
    },
    statusBreakdown: statusBreakdownRows.map((row) => ({
      key: row._id || "unknown",
      label: row._id || "unknown",
      count: row.count
    })),
    mimeBreakdown: mimeBreakdownRows.map((row) => ({
      key: row._id || "unknown",
      label: row._id || "unknown",
      count: row.count
    }))
  };

  if (isAdmin && scope === "agent") {
    const topAgentsRows = await File.aggregate([
      { $match: { tenantId: tenantObjectId } },
      {
        $group: {
          _id: "$ownerId",
          uploads: { $sum: 1 },
          storage: { $sum: { $ifNull: ["$size", 0] } },
          downloads: { $sum: { $ifNull: ["$downloadCount", 0] } }
        }
      },
      { $sort: { uploads: -1 } },
      { $limit: 8 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user"
        }
      },
      { $unwind: "$user" }
    ]);

    const topAgentIds = topAgentsRows.map((row) => row._id);
    const agentUploadsByMonthRows = await File.aggregate([
      {
        $match: {
          tenantId: tenantObjectId,
          ownerId: { $in: topAgentIds },
          createdAt: { $gte: yearStart, $lt: yearEnd }
        }
      },
      {
        $group: {
          _id: {
            ownerId: "$ownerId",
            month: { $month: "$createdAt" }
          },
          uploads: { $sum: 1 }
        }
      }
    ]);

    const labels = buildMonthLabels();
    const monthlyByAgent = topAgentsRows.map((agent) => {
      const uploadsSeries = new Array(12).fill(0);
      for (const row of agentUploadsByMonthRows) {
        if (row?._id?.ownerId?.toString() === agent._id.toString()) {
          const monthIndex = Number(row?._id?.month || 0) - 1;
          if (monthIndex >= 0 && monthIndex < 12) {
            uploadsSeries[monthIndex] = Number(row.uploads || 0);
          }
        }
      }

      const fullName = `${agent.user.firstName || ""} ${agent.user.lastName || ""}`.trim();
      return {
        userId: agent._id,
        name: fullName || agent.user.email,
        uploads: uploadsSeries
      };
    });

    response.topAgents = topAgentsRows.map((agent) => {
      const fullName = `${agent.user.firstName || ""} ${agent.user.lastName || ""}`.trim();
      return {
        userId: agent._id,
        name: fullName || agent.user.email,
        email: agent.user.email,
        uploads: Number(agent.uploads || 0),
        storage: Number(agent.storage || 0),
        downloads: Number(agent.downloads || 0)
      };
    });

    response.agentMonthly = {
      labels,
      series: monthlyByAgent
    };
  }

  return response;
};

export const searchFilesAndFolders = async (requester, options = {}) => {
  const requesterId = requester?.userId || requester?._id;

  if (!requesterId || !requester?.tenantId) {
    throw new Error("Invalid tenant context");
  }

  const { query, type, folderId, limit = 50, offset = 0 } = options;

  if (!query || query.trim().length < 2) {
    throw new Error("Search query must be at least 2 characters long");
  }

  const tenantObjectId = new mongoose.Types.ObjectId(requester.tenantId);
  const requesterObjectId = new mongoose.Types.ObjectId(requesterId);

  // Build search conditions
  const searchRegex = new RegExp(query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

  // Search files
  let fileResults = [];
  if (!type || type === 'files') {
    const fileMatch = {
      tenantId: tenantObjectId,
      ownerId: requesterObjectId,
      $or: [
        { originalName: searchRegex },
        { mimeType: searchRegex }
      ]
    };

    // If searching within a specific folder
    if (folderId) {
      const folderObjectId = new mongoose.Types.ObjectId(folderId);
      fileMatch.folderId = folderObjectId;
    }

    fileResults = await File.find(fileMatch)
      .select('_id originalName mimeType size createdAt folderId')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(offset)
      .lean();
  }

  // Search folders
  let folderResults = [];
  if (!type || type === 'folders') {
    const folderMatch = {
      tenantId: tenantObjectId,
      ownerId: requesterObjectId,
      name: searchRegex
    };

    // If searching within a specific folder
    if (folderId) {
      const folderObjectId = new mongoose.Types.ObjectId(folderId);
      folderMatch.parentId = folderObjectId;
    }

    folderResults = await Folder.find(folderMatch)
      .select('_id name path parentId isRoot createdAt')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(offset)
      .lean();
  }

  // Combine and sort results by creation date
  const combinedResults = [
    ...fileResults.map(file => ({
      id: file._id,
      name: file.originalName,
      type: 'file',
      mimeType: file.mimeType,
      size: file.size,
      folderId: file.folderId,
      createdAt: file.createdAt
    })),
    ...folderResults.map(folder => ({
      id: folder._id,
      name: folder.name,
      type: 'folder',
      path: folder.path,
      parentId: folder.parentId,
      isRoot: folder.isRoot,
      createdAt: folder.createdAt
    }))
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  // Apply pagination to combined results
  const paginatedResults = combinedResults.slice(offset, offset + limit);

  return {
    query,
    total: combinedResults.length,
    results: paginatedResults,
    pagination: {
      offset,
      limit,
      hasMore: combinedResults.length > offset + limit
    }
  };
};


