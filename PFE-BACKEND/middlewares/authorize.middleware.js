import { ROLES, isSuperAdmin } from '../constants/roles.js';

/**
 * Middleware pour vérifier les rôles de l'utilisateur
 * Utilisation: router.get("/path", authenticateToken, authorizeRole([ROLES.SUPERADMIN]), controller)
 */
export const authorizeRole = (allowedRoles) => {
  return (req, res, next) => {
    try {
      // Vérifier que l'utilisateur est authentifié
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized: User not authenticated"
        });
      }

      // Vérifier le rôle
      if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({
          success: false,
          message: `Forbidden: This action requires one of these roles: ${allowedRoles.join(", ")}`
        });
      }

      next();
    } catch (error) {
      console.error("[AuthorizeRole] Error:", error.message);
      return res.status(500).json({
        success: false,
        message: "Authorization error",
        error: error.message
      });
    }
  };
};

/**
 * Middleware pour vérifier que l'utilisateur est SUPERADMIN
 */
export const authorizeSuperAdmin = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User not authenticated"
      });
    }

    if (req.user.role !== ROLES.SUPERADMIN) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: This action requires SUPERADMIN role"
      });
    }

    next();
  } catch (error) {
    console.error("[AuthorizeSuperAdmin] Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Authorization error",
      error: error.message
    });
  }
};

/**
 * Middleware pour vérifier que l'utilisateur est un admin (SUPERADMIN ou TENANT_ADMIN)
 */
export const authorizeAnyAdmin = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User not authenticated"
      });
    }

    const isAdmin = req.user.role === ROLES.SUPERADMIN || req.user.role === ROLES.TENANT_ADMIN;
    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: This action requires admin role (SUPERADMIN or TENANT_ADMIN)"
      });
    }

    next();
  } catch (error) {
    console.error("[AuthorizeAnyAdmin] Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Authorization error",
      error: error.message
    });
  }
};

/**
 * Middleware pour vérifier que l'utilisateur appartient à un tenant
 */
export const authorizeTenant = (req, res, next) => {
  try {
    if (!req.user.tenantId) {
      return res.status(403).json({
        success: false,
        message: "Forbidden: User must belong to a tenant"
      });
    }

    next();
  } catch (error) {
    console.error("[AuthorizeTenant] Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Authorization error",
      error: error.message
    });
  }
};

/**
 * Middleware pour valider l'accès tenant
 * Vérifie que l'utilisateur peut accéder à une ressource du tenant spécifié
 */
export const validateTenantAccess = (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User not authenticated"
      });
    }

    // SUPERADMIN peut accéder à n'importe quel tenant
    if (req.user.role === ROLES.SUPERADMIN) {
      return next();
    }

    // Pour les autres, vérifier que le tenantId correspond
    const requestTenantId = req.params.tenantId || req.body?.tenantId || req.query?.tenantId;
    
    if (requestTenantId && req.user.tenantId) {
      if (req.user.tenantId.toString() !== requestTenantId.toString()) {
        return res.status(403).json({
          success: false,
          message: "Forbidden: You can only access resources within your own tenant"
        });
      }
    }

    next();
  } catch (error) {
    console.error("[ValidateTenantAccess] Error:", error.message);
    return res.status(500).json({
      success: false,
      message: "Authorization error",
      error: error.message
    });
  }
};

export default authorizeRole;
