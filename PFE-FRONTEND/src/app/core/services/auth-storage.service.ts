import { Injectable } from '@angular/core';
import { AuthResponse } from '../models/auth.models';

@Injectable({ providedIn: 'root' })
export class AuthStorageService {
  private readonly tokenKey = 'pfe_token';
  private readonly userKey = 'pfe_user';
  private readonly rememberedEmailKey = 'pfe_remembered_email';

  setSession(session: AuthResponse, remember = true): void {
    if (!session.token) {
      throw new Error('Unable to store session without a token.');
    }

    this.clearSessionStorage();

    const storage = remember ? localStorage : sessionStorage;
    storage.setItem(this.tokenKey, session.token);
    storage.setItem(this.userKey, JSON.stringify(session));

    if (remember) {
      localStorage.setItem(this.rememberedEmailKey, session.email);
    } else {
      localStorage.removeItem(this.rememberedEmailKey);
    }
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey) ?? sessionStorage.getItem(this.tokenKey);
  }

  getSession(): AuthResponse | null {
    const raw = localStorage.getItem(this.userKey) ?? sessionStorage.getItem(this.userKey);
    return raw ? (JSON.parse(raw) as AuthResponse) : null;
  }

  getRememberedEmail(): string | null {
    return localStorage.getItem(this.rememberedEmailKey);
  }

  setRememberedEmail(email: string | null): void {
    if (!email) {
      localStorage.removeItem(this.rememberedEmailKey);
      return;
    }

    localStorage.setItem(this.rememberedEmailKey, email);
  }

  hasToken(): boolean {
    return Boolean(this.getToken());
  }

  getRole(): 'superadmin' | 'tenant_admin' | 'user' | null {
    const role = this.getSession()?.role;
    return role ?? null;
  }

  isSuperAdmin(): boolean {
    return this.getRole() === 'superadmin';
  }

  isTenantAdmin(): boolean {
    return this.getRole() === 'tenant_admin';
  }

  isAnyAdmin(): boolean {
    const role = this.getRole();
    return role === 'superadmin' || role === 'tenant_admin';
  }

  isUser(): boolean {
    return this.getRole() === 'user';
  }

  getUserId(): string | null {
    return this.getSession()?.userId ?? null;
  }

  clear(): void {
    this.clearSessionStorage();
    localStorage.removeItem(this.rememberedEmailKey);
  }

  private clearSessionStorage(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
    sessionStorage.removeItem(this.tokenKey);
    sessionStorage.removeItem(this.userKey);
  }
}