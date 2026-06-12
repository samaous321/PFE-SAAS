import ShareHistory from "../models/ShareHistory.js";
import File from "../models/File.js";
import User from "../models/User.js";
import Tenant from "../models/Tenant.js";
import mongoose from "mongoose";
import { generateUniqueId } from "../utils/shareHistoryUtils.js";

const toObjectIdIfValid = (value) => {
  if (value && typeof value === "string" && /^[a-fA-F0-9]{24}$/.test(value)) {
    return new mongoose.Types.ObjectId(value);
  }

  if (value && typeof value === "object" && value.toString) {
    const asString = value.toString();
    if (/^[a-fA-F0-9]{24}$/.test(asString)) {
      return new mongoose.Types.ObjectId(asString);
    }
  }

  return null;
};

const buildTenantMatch = (tenantId) => {
  const normalizedTenantId = toObjectIdIfValid(tenantId);

  if (normalizedTenantId) {
    return { $in: [tenantId, normalizedTenantId] };
  }

  return tenantId;
};

const buildUserMatch = (userId) => {
  const normalizedUserId = toObjectIdIfValid(userId);

  if (normalizedUserId) {
    return { $in: [userId, normalizedUserId] };
  }

  return userId;
};

const normalizeShareHistoryRecord = (record) => {
  if (!record) {
    return record;
  }

  if (record.status === "active" && record.expiresAt && new Date(record.expiresAt) < new Date()) {
    return {
      ...record,
      status: "expired"
    };
  }

  return record;
};

const normalizeShareHistoryRecords = (records) => records.map(normalizeShareHistoryRecord);

const reconcileExpiredShares = async (query) => {
  await ShareHistory.updateMany(
    {
      ...query,
      status: "active",
      expiresAt: { $lt: new Date() }
    },
    {
      $set: { status: "expired" }
    }
  );
};

/**
 * ==========================================
 * LOGGING & CRÉATION
 * ==========================================
 */

/**
 * Log un nouveau partage
 */
export const logShare = async (shareData) => {
  try {
    const shareId = generateUniqueId();

    const history = new ShareHistory({
      shareId,
      fileId: shareData.fileId,
      fileName: shareData.fileName,
      fileSize: shareData.fileSize,
      mimeType: shareData.mimeType,
      fileHash: shareData.fileHash,
      shareUrl: shareData.shareUrl || null,

      sharedBy: {
        userId: shareData.sharedByUserId,
        email: shareData.sharedByEmail,
        tenantId: shareData.sharedByTenantId,
        ipAddress: shareData.ipAddress,
        userAgent: shareData.userAgent
      },

      sharedWith: {
        userId: shareData.sharedWithUserId || null,
        email: shareData.sharedWithEmail,
        tenantId: shareData.sharedWithTenantId || null,
        externalUser: !shareData.sharedWithUserId
      },
      recipientEmails: Array.isArray(shareData.recipientEmails) ? shareData.recipientEmails : [],
      recipientCount: Number.isFinite(shareData.recipientCount) ? shareData.recipientCount : 1,

      shareType: shareData.shareType || "direct",
      accessLevel: shareData.accessLevel || "view",
      expiresAt: shareData.expiresAt || null,
      hasPassword: !!shareData.hasPassword,
      maxDownloads: shareData.maxDownloads || null,
      note: shareData.note || null,
      subject: shareData.subject || null,

      auditTrail: [{
        action: "created",
        timestamp: new Date(),
        performedBy: shareData.sharedByUserId,
        changes: {
          shareType: shareData.shareType,
          accessLevel: shareData.accessLevel,
          expiresAt: shareData.expiresAt,
          hasNote: !!shareData.note
        }
      }]
    });

    await history.save();
    console.log(`[ShareHistory] ✅ Share logged: ${shareId}`);
    return history;
  } catch (error) {
    console.error("[ShareHistory] Error logging share:", error.message);
    throw error;
  }
};

/**
 * ==========================================
 * ACCÈS & TÉLÉCHARGEMENTS
 * ==========================================
 */

/**
 * Enregistrer un accès (view/download)
 */
export const logAccess = async (shareId, accessData) => {
  try {
    const history = await ShareHistory.findOne({ shareId });

    if (!history) {
      throw new Error(`Share not found: ${shareId}`);
    }

    // Vérifier expiration
    if (history.status === "expired" || 
        (history.expiresAt && new Date() > history.expiresAt)) {
      history.status = "expired";
      await history.save();
      throw new Error("Share has expired");
    }

    // Vérifier quota de téléchargements
    if (history.isDownloadQuotaExceeded()) {
      throw new Error("Download quota exceeded");
    }

    // Vérifier status
    if (history.status !== "active") {
      throw new Error(`Share is ${history.status}`);
    }

    // Ajouter log d'accès
    const logEntry = {
      timestamp: new Date(),
      action: accessData.action || "view",
      ipAddress: accessData.ipAddress,
      userAgent: accessData.userAgent,
      userLocation: accessData.userLocation || {},
      accessedBy: accessData.accessedBy || null, // ID de l'utilisateur qui accède
      success: true
    };

    if (accessData.action === "download") {
      history.downloadCount += 1;
    } else if (accessData.action === "view") {
      history.viewCount += 1;
    }

    if (!history.firstAccessedAt) {
      history.firstAccessedAt = new Date();
    }
    history.lastAccessedAt = new Date();

    history.accessLogs.push(logEntry);

    // Ajouter audit trail
    history.auditTrail.push({
      action: `accessed_${accessData.action}`,
      timestamp: new Date(),
      changes: { action: accessData.action }
    });

    await history.save();
    console.log(`[ShareHistory] ✅ Access logged for ${shareId}`);
    
    return history;
  } catch (error) {
    console.error("[ShareHistory] Error logging access:", error.message);
    throw error;
  }
};

/**
 * ==========================================
 * RÉVOCATION & MODIFICATION
 * ==========================================
 */

/**
 * Révoquer un partage
 */
export const revokeShare = async (shareId, revokeData) => {
  try {
    const history = await ShareHistory.findOneAndUpdate(
      { shareId },
      {
        $set: {
          status: "revoked",
          revokedAt: new Date(),
          revokeReason: revokeData.reason,
          revokedBy: revokeData.revokedBy
        },
        $push: {
          auditTrail: {
            action: "revoked",
            timestamp: new Date(),
            performedBy: revokeData.revokedBy,
            changes: { reason: revokeData.reason }
          }
        }
      },
      { returnDocument: "after" }
    );

    if (!history) {
      throw new Error(`Share not found: ${shareId}`);
    }

    console.log(`[ShareHistory] ✅ Share revoked: ${shareId}`);
    return history;
  } catch (error) {
    console.error("[ShareHistory] Error revoking share:", error.message);
    throw error;
  }
};

/**
 * Modifier les paramètres d'un partage
 */
export const updateShareSettings = async (shareId, updateData) => {
  try {
    const allowed = ["accessLevel", "expiresAt", "maxDownloads"];
    const changes = {};

    for (const key of allowed) {
      if (key in updateData) {
        changes[key] = updateData[key];
      }
    }

    const history = await ShareHistory.findOneAndUpdate(
      { shareId },
      {
        $set: changes,
        $push: {
          auditTrail: {
            action: "settings_updated",
            timestamp: new Date(),
            performedBy: updateData.updatedBy,
            changes
          }
        }
      },
      { returnDocument: "after" }
    );

    console.log(`[ShareHistory] ✅ Share settings updated: ${shareId}`);
    return history;
  } catch (error) {
    console.error("[ShareHistory] Error updating share:", error.message);
    throw error;
  }
};

/**
 * ==========================================
 * RÉCUPÉRATION DE DONNÉES - USER
 * ==========================================
 */

/**
 * Historique d'un utilisateur (ses partages)
 */
export const getUserShareHistory = async (userId, filters = {}) => {
  try {
    const userMatch = buildUserMatch(userId);
    const query = { "sharedBy.userId": userMatch };

    await reconcileExpiredShares({ "sharedBy.userId": userMatch });

    // Filtres
    if (filters.status) query.status = filters.status;
    if (filters.shareType) query.shareType = filters.shareType;
    if (filters.accessLevel) query.accessLevel = filters.accessLevel;
    if (filters.fileName) {
      query.fileName = { $regex: filters.fileName, $options: "i" };
    }

    // Filtrage par date
    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      if (filters.startDate) {
        query.createdAt.$gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999);
        query.createdAt.$lte = endDate;
      }
    }

    // Filtrer par destinataire
    if (filters.recipientEmail) {
      query["sharedWith.email"] = { 
        $regex: filters.recipientEmail, 
        $options: "i" 
      };
    }

    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, filters.limit || 10);
    const skip = (page - 1) * limit;

    const sortBy = filters.sortBy || "-createdAt";

    const [data, total] = await Promise.all([
      ShareHistory.find(query)
        .populate("fileId", "fileName fileSize")
        .populate("sharedWith.userId", "email name avatar")
        .sort(sortBy)
        .skip(skip)
        .limit(limit)
        .lean(),
      ShareHistory.countDocuments(query)
    ]);

    return {
      success: true,
      data: normalizeShareHistoryRecords(data),
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    };
  } catch (error) {
    console.error("[ShareHistory] Error fetching user history:", error.message);
    throw error;
  }
};

/**
 * Détails d'un partage spécifique
 */
export const getShareDetails = async (shareId, userId) => {
  try {
    const userMatch = buildUserMatch(userId);
    const history = await ShareHistory.findOne({ shareId })
      .populate("sharedBy.userId", "email name avatar")
      .populate("sharedWith.userId", "email name avatar")
      .populate("fileId")
      .lean();

    if (!history) {
      throw new Error("Share not found");
    }

    const ownerId = history.sharedBy.userId
      ? history.sharedBy.userId._id?.toString() || history.sharedBy.userId.toString()
      : null;

    const allowedOwners = Array.isArray(userMatch?.$in) ? userMatch.$in.map((value) => value.toString()) : [String(userMatch)];

    if (!ownerId || !allowedOwners.includes(ownerId)) {
      throw new Error("Unauthorized");
    }

    if (history.status === "active" && history.expiresAt && new Date(history.expiresAt) < new Date()) {
      await ShareHistory.updateOne(
        { shareId },
        { $set: { status: "expired" } }
      );
      history.status = "expired";
    }

    return {
      success: true,
      data: history
    };
  } catch (error) {
    console.error("[ShareHistory] Error fetching share details:", error.message);
    throw error;
  }
};

/**
 * ==========================================
 * RÉCUPÉRATION DE DONNÉES - ADMIN/SUPERVISION
 * ==========================================
 */

/**
 * Historique COMPLET pour l'admin (supervision)
 */
export const getAdminShareHistory = async (filters = {}) => {
  try {
    const query = {};

    // Filtrer par tenant
    if (filters.tenantId) {
      query["sharedBy.tenantId"] = filters.tenantId;
    }

    // Filtrer par utilisateur qui a partagé
    if (filters.userId) {
      query["sharedBy.userId"] = filters.userId;
    }

    // Filtrer par utilisateur destinataire
    if (filters.recipientUserId) {
      query["sharedWith.userId"] = filters.recipientUserId;
    }

    // Filtrer par email destinataire
    if (filters.recipientEmail) {
      query["sharedWith.email"] = { 
        $regex: filters.recipientEmail, 
        $options: "i" 
      };
    }

    // Filtrer par status
    if (filters.status) {
      if (Array.isArray(filters.status)) {
        query.status = { $in: filters.status };
      } else {
        query.status = filters.status;
      }
    }

    // Filtrer par type
    if (filters.shareType) {
      query.shareType = filters.shareType;
    }

    if (filters.mimeType) {
      query.mimeType = {
        $regex: filters.mimeType,
        $options: "i"
      };
    }

    // Filtrer par action (audit trail ou accessLogs)
    if (filters.action) {
      if (filters.action.startsWith('accessed_')) {
        const accessAction = filters.action.replace('accessed_', '');
        query.$or = [
          { "auditTrail.action": filters.action },
          { "accessLogs.action": accessAction }
        ];
      } else {
        query["auditTrail.action"] = filters.action;
      }
    }

    // Filtrer par IP address (dans accessLogs)
    if (filters.ipAddress) {
      query["accessLogs.ipAddress"] = { 
        $regex: filters.ipAddress, 
        $options: "i" 
      };
    }

    // Filtrer par user agent (dans accessLogs)
    if (filters.userAgent) {
      query["accessLogs.userAgent"] = { 
        $regex: filters.userAgent, 
        $options: "i" 
      };
    }

    // Filtrer par date
    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      if (filters.startDate) {
        query.createdAt.$gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999);
        query.createdAt.$lte = endDate;
      }
    }

    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, filters.limit || 20);
    const skip = (page - 1) * limit;

    const sortBy = filters.sortBy || "-createdAt";

    const [data, total] = await Promise.all([
      ShareHistory.find(query)
        .populate("sharedBy.userId", "email name")
        .populate("sharedWith.userId", "email name")
        .populate("fileId", "fileName fileSize")
        .sort(sortBy)
        .skip(skip)
        .limit(limit)
        .lean(),
      ShareHistory.countDocuments(query)
    ]);

    return {
      success: true,
      data: normalizeShareHistoryRecords(data),
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    };
  } catch (error) {
    console.error("[ShareHistory] Error fetching admin history:", error.message);
    throw error;
  }
};

/**
 * Statistiques d'un tenant (pour admin)
 */
export const getTenantShareStats = async (tenantId) => {
  try {
    const now = new Date();
    const tenantMatch = { "sharedBy.tenantId": buildTenantMatch(tenantId) };

    await reconcileExpiredShares(tenantMatch);

    const stats = await ShareHistory.aggregate([
      {
        $match: tenantMatch
      },
      {
        $facet: {
          totalShares: [
            { $count: "total" }
          ],
          byStatus: [
            { $group: { _id: "$status", count: { $sum: 1 } } }
          ],
          byType: [
            { $group: { _id: "$shareType", count: { $sum: 1 } } }
          ],
          totalDownloads: [
            { $group: { _id: null, total: { $sum: "$downloadCount" } } }
          ],
          totalViews: [
            { $group: { _id: null, total: { $sum: "$viewCount" } } }
          ],
          activeShares: [
            {
              $match: {
                status: "active",
                $or: [
                  { expiresAt: null },
                  { expiresAt: { $exists: false } },
                  { expiresAt: { $gt: now } }
                ]
              }
            },
            { $count: "total" }
          ]
        }
      }
    ]);

    return {
      success: true,
      data: stats[0]
    };
  } catch (error) {
    console.error("[ShareHistory] Error fetching tenant stats:", error.message);
    throw error;
  }
};

/**
 * Détails d'un partage dans un tenant
 */
export const getTenantShareDetails = async (shareId, tenantId) => {
  try {
    const history = await ShareHistory.findOne({
      shareId,
      "sharedBy.tenantId": buildTenantMatch(tenantId)
    })
      .populate("sharedBy.userId", "email name avatar firstName lastName")
      .populate("sharedWith.userId", "email name avatar firstName lastName")
      .populate("fileId")
      .lean();

    if (!history) {
      throw new Error("Share not found");
    }

    return {
      data: history
    };
  } catch (error) {
    console.error("[ShareHistory] Error fetching tenant share details:", error.message);
    throw error;
  }
};

/**
 * Historique des partages actifs d'un tenant
 */
export const getTenantShareHistory = async (tenantId, filters = {}) => {
  try {
    const now = new Date();
    const query = {
      "sharedBy.tenantId": buildTenantMatch(tenantId),
      status: "active",
      $or: [
        { expiresAt: null },
        { expiresAt: { $exists: false } },
        { expiresAt: { $gt: now } }
      ]
    };

    if (filters.userId) {
      query["sharedBy.userId"] = filters.userId;
    }

    if (filters.recipientEmail) {
      query["sharedWith.email"] = {
        $regex: filters.recipientEmail,
        $options: "i"
      };
    }

    if (filters.fileName) {
      query.fileName = { $regex: filters.fileName, $options: "i" };
    }

    if (filters.mimeType) {
      query.mimeType = {
        $regex: filters.mimeType,
        $options: "i"
      };
    }

    if (filters.shareType) {
      query.shareType = filters.shareType === "public"
        ? { $in: ["public", "link"] }
        : filters.shareType;
    }

    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      if (filters.startDate) {
        query.createdAt.$gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999);
        query.createdAt.$lte = endDate;
      }
    }

    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, filters.limit || 20);
    const skip = (page - 1) * limit;
    const sortBy = filters.sortBy || "-createdAt";

    const [data, total] = await Promise.all([
      ShareHistory.find(query)
        .populate("sharedBy.userId", "email name")
        .populate("sharedWith.userId", "email name")
        .populate("fileId", "fileName fileSize")
        .sort(sortBy)
        .skip(skip)
        .limit(limit)
        .lean(),
      ShareHistory.countDocuments(query)
    ]);

    return {
      success: true,
      data: normalizeShareHistoryRecords(data),
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    };
  } catch (error) {
    console.error("[ShareHistory] Error fetching tenant share history:", error.message);
    throw error;
  }
};

/**
 * Révoquer un partage d'un tenant
 */
export const revokeTenantShare = async (shareId, tenantId, revokeData) => {
  try {
    const history = await ShareHistory.findOneAndUpdate(
      {
        shareId,
        "sharedBy.tenantId": buildTenantMatch(tenantId)
      },
      {
        $set: {
          status: "revoked",
          revokedAt: new Date(),
          revokeReason: revokeData.reason,
          revokedBy: revokeData.revokedBy
        },
        $push: {
          auditTrail: {
            action: "revoked",
            timestamp: new Date(),
            performedBy: revokeData.revokedBy,
            changes: { reason: revokeData.reason }
          }
        }
      },
      { returnDocument: "after" }
    );

    if (!history) {
      throw new Error(`Share not found: ${shareId}`);
    }

    return history;
  } catch (error) {
    console.error("[ShareHistory] Error revoking tenant share:", error.message);
    throw error;
  }
};

/**
 * Modifier les paramètres d'un partage d'un tenant
 */
export const updateTenantShareSettings = async (shareId, tenantId, updateData) => {
  try {
    const allowed = ["accessLevel", "expiresAt", "maxDownloads"];
    const changes = {};

    for (const key of allowed) {
      if (key in updateData) {
        changes[key] = updateData[key];
      }
    }

    const history = await ShareHistory.findOneAndUpdate(
      {
        shareId,
        "sharedBy.tenantId": buildTenantMatch(tenantId)
      },
      {
        $set: changes,
        $push: {
          auditTrail: {
            action: "settings_updated",
            timestamp: new Date(),
            performedBy: updateData.updatedBy,
            changes
          }
        }
      },
      { returnDocument: "after" }
    );

    if (!history) {
      throw new Error(`Share not found: ${shareId}`);
    }

    return history;
  } catch (error) {
    console.error("[ShareHistory] Error updating tenant share:", error.message);
    throw error;
  }
};

/**
 * Statistiques par utilisateur
 */
export const getUserShareStats = async (userId) => {
  try {
    const userMatch = buildUserMatch(userId);

    await reconcileExpiredShares({ "sharedBy.userId": userMatch });

    const stats = await ShareHistory.aggregate([
      {
        $match: { "sharedBy.userId": userMatch }
      },
      {
        $facet: {
          totalShares: [{ $count: "total" }],
          totalDownloads: [
            { $group: { _id: null, total: { $sum: "$downloadCount" } } }
          ],
          totalViews: [
            { $group: { _id: null, total: { $sum: "$viewCount" } } }
          ],
          activeShares: [
            { 
              $match: { status: "active" }
            },
            { $count: "total" }
          ],
          revokedShares: [
            { 
              $match: { status: "revoked" }
            },
            { $count: "total" }
          ]
        }
      }
    ]);

    const facet = stats[0] || {};

    const readFacetTotal = (value) => {
      if (typeof value === "number") return value;
      if (Array.isArray(value) && value.length > 0 && typeof value[0]?.total === "number") {
        return value[0].total;
      }
      return 0;
    };

    return {
      success: true,
      data: {
        totalShares: readFacetTotal(facet.totalShares),
        totalDownloads: readFacetTotal(facet.totalDownloads),
        totalViews: readFacetTotal(facet.totalViews),
        activeShares: readFacetTotal(facet.activeShares),
        revokedShares: readFacetTotal(facet.revokedShares)
      }
    };
  } catch (error) {
    console.error("[ShareHistory] Error fetching user stats:", error.message);
    throw error;
  }
};

export default {
  logShare,
  logAccess,
  revokeShare,
  updateShareSettings,
  getUserShareHistory,
  getShareDetails,
  getAdminShareHistory,
  getTenantShareStats,
  getTenantShareDetails,
  getTenantShareHistory,
  revokeTenantShare,
  updateTenantShareSettings,
  getUserShareStats
};