import * as shareHistoryService from "../services/shareHistory.service.js";
import { ROLES } from "../constants/roles.js";

/**
 * USER - Récupérer son historique de partages
 * GET /api/shares/history
 */
export const getMyShareHistory = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?._id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }
    const filters = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 10,
      status: req.query.status,
      shareType: req.query.shareType,
      accessLevel: req.query.accessLevel,
      fileName: req.query.fileName,
      recipientEmail: req.query.recipientEmail,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      sortBy: req.query.sortBy || "-createdAt"
    };

    const result = await shareHistoryService.getUserShareHistory(userId, filters);

    return res.status(200).json({
      success: true,
      message: "Share history retrieved successfully",
      ...result
    });
  } catch (error) {
    console.error("[Controller] Error in getMyShareHistory:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve share history",
      error: error.message
    });
  }
};

/**
 * USER - Récupérer les détails d'un partage
 * GET /api/shares/history/:shareId
 */
export const getShareDetails = async (req, res) => {
  try {
    const { shareId } = req.params;
    const userId = req.user?.userId || req.user?._id || req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    const result = await shareHistoryService.getShareDetails(shareId, userId.toString());

    return res.status(200).json({
      success: true,
      message: "Share details retrieved successfully",
      data: result.data
    });
  } catch (error) {
    console.error("[Controller] Error in getShareDetails:", error.message);
    return res.status(error.message === "Unauthorized" ? 403 : 404).json({
      success: false,
      message: error.message,
      error: error.message
    });
  }
};

/**
 * USER - Récupérer ses statistiques de partage
 * GET /api/shares/stats
 */
export const getMyShareStats = async (req, res) => {
  try {
    const userId = req.user?.userId || req.user?._id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized"
      });
    }

    const result = await shareHistoryService.getUserShareStats(userId.toString());

    return res.status(200).json({
      success: true,
      message: "Share statistics retrieved successfully",
      data: result.data
    });
  } catch (error) {
    console.error("[Controller] Error in getMyShareStats:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve statistics",
      error: error.message
    });
  }
};

/**
 * ADMIN - Récupérer l'historique complet (supervision)
 * GET /api/admin/shares/history
 */
export const getAdminShareHistory = async (req, res) => {
  try {
    // Support legacy "admin" role while tenant_admin is explicitly excluded
    const isSuperAdmin = req.user.role === ROLES.SUPERADMIN || req.user.role === "admin";
    if (!isSuperAdmin) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: superadmin access required"
      });
    }

    const filters = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20,
      tenantId: req.query.tenantId,
      userId: req.query.userId,
      recipientUserId: req.query.recipientUserId,
      recipientEmail: req.query.recipientEmail,
      status: req.query.status ? req.query.status.split(",") : undefined,
      shareType: req.query.shareType,
      mimeType: req.query.mimeType,
      action: req.query.action,
      ipAddress: req.query.ipAddress,
      userAgent: req.query.userAgent,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      sortBy: req.query.sortBy || "-createdAt"
    };

    const result = await shareHistoryService.getAdminShareHistory(filters);

    return res.status(200).json({
      success: true,
      message: "Admin share history retrieved successfully",
      ...result
    });
  } catch (error) {
    console.error("[Controller] Error in getAdminShareHistory:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve admin share history",
      error: error.message
    });
  }
};

/**
 * TENANT ADMIN - Récupérer les partages actifs de son tenant
 * GET /api/shares/tenant/current
 */
export const getTenantShareHistory = async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: tenant access required"
      });
    }

    const filters = {
      page: parseInt(req.query.page) || 1,
      limit: parseInt(req.query.limit) || 20,
      status: req.query.status ? req.query.status.split(",") : undefined,
      shareType: req.query.shareType,
      mimeType: req.query.mimeType,
      fileName: req.query.fileName,
      recipientEmail: req.query.recipientEmail,
      startDate: req.query.startDate,
      endDate: req.query.endDate,
      sortBy: req.query.sortBy || "-createdAt"
    };

    const result = await shareHistoryService.getTenantShareHistory(tenantId, filters);

    return res.status(200).json({
      success: true,
      message: "Tenant share history retrieved successfully",
      ...result
    });
  } catch (error) {
    console.error("[Controller] Error in getTenantShareHistory:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve tenant share history",
      error: error.message
    });
  }
};

/**
 * TENANT ADMIN - Détails d'un partage du tenant
 * GET /api/shares/tenant/current/:shareId
 */
export const getTenantShareDetails = async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: tenant access required"
      });
    }

    const { shareId } = req.params;
    const result = await shareHistoryService.getTenantShareDetails(shareId, tenantId);

    return res.status(200).json({
      success: true,
      message: "Tenant share details retrieved successfully",
      data: result.data
    });
  } catch (error) {
    console.error("[Controller] Error in getTenantShareDetails:", error.message);
    return res.status(error.message === "Share not found" ? 404 : 500).json({
      success: false,
      message: error.message,
      error: error.message
    });
  }
};

/**
 * TENANT ADMIN - Statistiques de ses partages de tenant
 * GET /api/shares/tenant/stats
 */
export const getTenantCurrentShareStats = async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: tenant access required"
      });
    }

    const result = await shareHistoryService.getTenantShareStats(tenantId);

    return res.status(200).json({
      success: true,
      message: "Tenant share statistics retrieved successfully",
      data: result.data
    });
  } catch (error) {
    console.error("[Controller] Error in getTenantCurrentShareStats:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve tenant share statistics",
      error: error.message
    });
  }
};

/**
 * TENANT ADMIN - Révoquer un partage de son tenant
 * POST /api/shares/tenant/revoke/:shareId
 */
export const revokeTenantShare = async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: tenant access required"
      });
    }

    const { shareId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: "Revocation reason is required"
      });
    }

    const result = await shareHistoryService.revokeTenantShare(shareId, tenantId, {
      reason,
      revokedBy: req.user?.userId || req.user?._id
    });

    return res.status(200).json({
      success: true,
      message: "Tenant share revoked successfully",
      data: result
    });
  } catch (error) {
    console.error("[Controller] Error in revokeTenantShare:", error.message);
    return res.status(error.message === "Share not found" ? 404 : 500).json({
      success: false,
      message: error.message,
      error: error.message
    });
  }
};

/**
 * TENANT ADMIN - Modifier les paramètres d'un partage de son tenant
 * PUT /api/shares/tenant/:shareId/settings
 */
export const updateTenantShareSettings = async (req, res) => {
  try {
    const tenantId = req.user?.tenantId;

    if (!tenantId) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: tenant access required"
      });
    }

    const { shareId } = req.params;
    const { accessLevel, expiresAt, maxDownloads } = req.body;

    const result = await shareHistoryService.updateTenantShareSettings(shareId, tenantId, {
      accessLevel,
      expiresAt,
      maxDownloads,
      updatedBy: req.user?.userId || req.user?._id
    });

    return res.status(200).json({
      success: true,
      message: "Tenant share settings updated successfully",
      data: result
    });
  } catch (error) {
    console.error("[Controller] Error in updateTenantShareSettings:", error.message);
    return res.status(error.message === "Share not found" ? 404 : 500).json({
      success: false,
      message: error.message,
      error: error.message
    });
  }
};

/**
 * ADMIN - Récupérer les statistiques d'un tenant
 * GET /api/admin/shares/stats/tenant/:tenantId
 */
export const getTenantShareStats = async (req, res) => {
  try {
    const isSuperAdmin = req.user.role === ROLES.SUPERADMIN || req.user.role === "admin";
    if (!isSuperAdmin) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: superadmin access required"
      });
    }

    const { tenantId } = req.params;
    const result = await shareHistoryService.getTenantShareStats(tenantId);

    return res.status(200).json({
      success: true,
      message: "Tenant statistics retrieved successfully",
      data: result.data
    });
  } catch (error) {
    console.error("[Controller] Error in getTenantShareStats:", error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve tenant statistics",
      error: error.message
    });
  }
};

/**
 * ADMIN - Révoquer un partage
 * POST /api/admin/shares/revoke/:shareId
 */
export const revokeShare = async (req, res) => {
  try {
    const isSuperAdmin = req.user.role === ROLES.SUPERADMIN || req.user.role === "admin";
    if (!isSuperAdmin) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: superadmin access required"
      });
    }

    const { shareId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: "Revocation reason is required"
      });
    }

    const result = await shareHistoryService.revokeShare(shareId, {
      reason,
      revokedBy: req.user?.userId || req.user?._id
    });

    return res.status(200).json({
      success: true,
      message: "Share revoked successfully",
      data: result
    });
  } catch (error) {
    console.error("[Controller] Error in revokeShare:", error.message);
    return res.status(error.message === "Share not found" ? 404 : 500).json({
      success: false,
      message: error.message,
      error: error.message
    });
  }
};

/**
 * ADMIN - Modifier les paramètres d'un partage
 * PUT /api/admin/shares/:shareId/settings
 */
export const updateShareSettings = async (req, res) => {
  try {
    const isSuperAdmin = req.user.role === ROLES.SUPERADMIN || req.user.role === "admin";
    if (!isSuperAdmin) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized: superadmin access required"
      });
    }

    const { shareId } = req.params;
    const { accessLevel, expiresAt, maxDownloads } = req.body;

    const result = await shareHistoryService.updateShareSettings(shareId, {
      accessLevel,
      expiresAt,
      maxDownloads,
      updatedBy: req.user?.userId || req.user?._id
    });

    return res.status(200).json({
      success: true,
      message: "Share settings updated successfully",
      data: result
    });
  } catch (error) {
    console.error("[Controller] Error in updateShareSettings:", error.message);
    return res.status(500).json({
      success: false,
      message: error.message,
      error: error.message
    });
  }
};

export default {
  getMyShareHistory,
  getShareDetails,
  getMyShareStats,
  getAdminShareHistory,
  getTenantShareStats,
  getTenantShareHistory,
  getTenantShareDetails,
  getTenantCurrentShareStats,
  revokeTenantShare,
  updateTenantShareSettings,
  revokeShare,
  updateShareSettings
};