export interface LoginRequest {
  email: string;
  password: string;
  tenantId?: string; // Optionnel si multi-tenant
}

export interface RegisterRequest {
  tenantId?: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  password: string;
  tenantDomain?: string;
  storagePlan?: string;
  role?: 'superadmin' | 'tenant_admin' | 'user';
}

export interface AuthResponse {
  userId: string;
  email: string;
  firstName?: string;
  lastName?: string;
  tenantId?: string;
  tenantName?: string;
  tenants?: string[]; // Si user appartient à plusieurs tenants
  role: 'superadmin' | 'tenant_admin' | 'user';
  token?: string;
  requires2FA?: boolean;
  verified?: boolean;
}

export interface TenantInfo {
  _id: string;
  name: string;
  description?: string;
}
