export interface Tenant {
  _id?: string;
  name: string;
  domain?: string;
  subscriptionPlan?: string;
  status?: 'active' | 'suspended' | 'inactive';
  usersCount?: number;
  filesCount?: number;
  storageLimit?: number;
  isDeleted?: boolean;
  quotaOverrides?: {
    tenant?: {
      storageBytes?: number | null;
      maxUsers?: number | null;
      maxFiles?: number | null;
      maxFolders?: number | null;
    };
    user?: {
      storageBytes?: number | null;
      maxFiles?: number | null;
      maxDailyUploadBytes?: number | null;
    };
  };
  createdAt?: string;
  updatedAt?: string;
}
