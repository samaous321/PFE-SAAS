/**
 * Role Constants - Centralized role definitions
 * This module defines all available roles in the system
 */

export const ROLES = {
  SUPERADMIN: 'superadmin',      // System-level administrator with access to all tenants
  TENANT_ADMIN: 'tenant_admin',   // Tenant-level administrator restricted to their tenant
  USER: 'user'                    // Standard user belonging to a tenant
};

/**
 * Role hierarchy for access control
 * Higher index = Higher privilege level
 */
export const ROLE_HIERARCHY = {
  [ROLES.USER]: 0,
  [ROLES.TENANT_ADMIN]: 1,
  [ROLES.SUPERADMIN]: 2
};

/**
 * Check if a role exists
 */
export const isValidRole = (role) => {
  return Object.values(ROLES).includes(role);
};

/**
 * Check if user has at least the given role level
 */
export const hasRoleLevel = (userRole, requiredRole) => {
  const userLevel = ROLE_HIERARCHY[userRole] ?? -1;
  const requiredLevel = ROLE_HIERARCHY[requiredRole] ?? -1;
  return userLevel >= requiredLevel;
};

/**
 * Check if user is a system-level admin (SUPERADMIN)
 */
export const isSuperAdmin = (user) => {
  return user?.role === ROLES.SUPERADMIN;
};

/**
 * Check if user is a tenant admin (TENANT_ADMIN)
 */
export const isTenantAdmin = (user) => {
  return user?.role === ROLES.TENANT_ADMIN;
};

/**
 * Check if user is a standard user
 */
export const isRegularUser = (user) => {
  return user?.role === ROLES.USER;
};

/**
 * Check if user is any type of admin (SUPERADMIN or TENANT_ADMIN)
 */
export const isAnyAdmin = (user) => {
  return isSuperAdmin(user) || isTenantAdmin(user);
};

/**
 * Validate tenant access for non-superadmin users
 * SUPERADMIN: no tenant restriction
 * TENANT_ADMIN/USER: must have tenantId and it must match their tenant
 */
export const validateTenantAccess = (user, requiredTenantId) => {
  // SUPERADMIN can access any tenant
  if (isSuperAdmin(user)) {
    return true;
  }

  // For others, tenantId must match
  if (!user?.tenantId || !requiredTenantId) {
    return false;
  }

  return user.tenantId.toString() === requiredTenantId.toString();
};

export default ROLES;
