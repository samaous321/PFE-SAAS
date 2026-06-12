export interface User {
  _id?: string;
  tenantId?: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  is2FAEnabled?: boolean;
  role?: 'superadmin' | 'tenant_admin' | 'user';
  verified?: boolean;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}
