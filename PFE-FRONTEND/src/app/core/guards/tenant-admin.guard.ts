import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthStorageService } from '../services/auth-storage.service';

export const tenantAdminGuard: CanActivateFn = () => {
  const authStorage = inject(AuthStorageService);
  const router = inject(Router);

  if (authStorage.isTenantAdmin()) {
    return true;
  }

  return router.parseUrl('/user/files');
};
