import express from "express";
import * as shareHistoryCtrl from "../controllers/shareHistory.controller.js";
import { authenticateToken, requireRole } from "../middlewares/auth.middleware.js";
import { authorizeTenant } from "../middlewares/authorize.middleware.js";
import { ROLES } from "../constants/roles.js";

const router = express.Router();

// ===== USER ROUTES =====
/**
 * GET /api/shares/history
 * Récupérer l'historique de ses partages
 * Params: page, limit, status, shareType, accessLevel, fileName, recipientEmail, startDate, endDate, sortBy
 */
router.get(
  "/history",
  authenticateToken,
  shareHistoryCtrl.getMyShareHistory
);

/**
 * GET /api/shares/history/:shareId
 * Récupérer les détails d'un partage
 */
router.get(
  "/history/:shareId",
  authenticateToken,
  shareHistoryCtrl.getShareDetails
);

/**
 * GET /api/shares/stats
 * Récupérer ses statistiques de partage
 */
router.get(
  "/stats",
  authenticateToken,
  shareHistoryCtrl.getMyShareStats
);

// ===== ADMIN ROUTES =====
/**
 * GET /api/admin/shares/history
 * Récupérer l'historique complet (supervision)
 * Requires: SUPERADMIN role (legacy "admin" accepted)
 * Params: tenantId, userId, recipientUserId, recipientEmail, status, shareType, startDate, endDate, page, limit, sortBy
 */
router.get(
  "/admin/history",
  authenticateToken,
  requireRole(ROLES.SUPERADMIN, "admin"),
  shareHistoryCtrl.getAdminShareHistory
);

/**
 * GET /api/admin/shares/stats/tenant/:tenantId
 * Récupérer les statistiques d'un tenant
 * Requires: SUPERADMIN role (legacy "admin" accepted)
 */
router.get(
  "/admin/stats/tenant/:tenantId",
  authenticateToken,
  requireRole(ROLES.SUPERADMIN, "admin"),
  shareHistoryCtrl.getTenantShareStats
);

/**
 * POST /api/admin/shares/revoke/:shareId
 * Révoquer un partage
 * Body: { reason: string }
 * Requires: SUPERADMIN role (legacy "admin" accepted)
 */
router.post(
  "/admin/revoke/:shareId",
  authenticateToken,
  requireRole(ROLES.SUPERADMIN, "admin"),
  shareHistoryCtrl.revokeShare
);

/**
 * PUT /api/admin/shares/:shareId/settings
 * Modifier les paramètres d'un partage
 * Body: { accessLevel?, expiresAt?, maxDownloads? }
 * Requires: SUPERADMIN role (legacy "admin" accepted)
 */
router.put(
  "/admin/:shareId/settings",
  authenticateToken,
  requireRole(ROLES.SUPERADMIN, "admin"),
  shareHistoryCtrl.updateShareSettings
);

// ===== TENANT ADMIN ROUTES =====
router.get(
  "/tenant/current",
  authenticateToken,
  requireRole(ROLES.TENANT_ADMIN),
  authorizeTenant,
  shareHistoryCtrl.getTenantShareHistory
);

router.get(
  "/tenant/current/:shareId",
  authenticateToken,
  requireRole(ROLES.TENANT_ADMIN),
  authorizeTenant,
  shareHistoryCtrl.getTenantShareDetails
);

router.get(
  "/tenant/stats",
  authenticateToken,
  requireRole(ROLES.TENANT_ADMIN),
  authorizeTenant,
  shareHistoryCtrl.getTenantCurrentShareStats
);

router.post(
  "/tenant/revoke/:shareId",
  authenticateToken,
  requireRole(ROLES.TENANT_ADMIN),
  authorizeTenant,
  shareHistoryCtrl.revokeTenantShare
);

router.put(
  "/tenant/:shareId/settings",
  authenticateToken,
  requireRole(ROLES.TENANT_ADMIN),
  authorizeTenant,
  shareHistoryCtrl.updateTenantShareSettings
);

export default router;