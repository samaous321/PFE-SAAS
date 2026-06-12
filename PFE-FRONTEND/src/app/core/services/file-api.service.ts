import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { FileAnalyticsResponse, FileSettingsPayload, SecureFile, ShareLinkResponse, SharedFileScanResult, Folder } from '../models/file.model';

@Injectable({ providedIn: 'root' })
export class FileApiService {
  private readonly baseUrl = `${environment.apiBaseUrl}/file`;

  constructor(private readonly http: HttpClient) {}

  getMyFiles(filters?: { spaceId?: string }) {
    const query = new URLSearchParams();

    if (filters?.spaceId) {
      query.set('spaceId', String(filters.spaceId));
    }

    const queryString = query.toString();
    const url = queryString
      ? `${this.baseUrl}/mine?${queryString}`
      : `${this.baseUrl}/mine`;

    return this.http.get<SecureFile[]>(url);
  }

  getUserFolders() {
    return this.http.get<Folder[]>(`${this.baseUrl}/folders`);
  }

  createUserFolder(payload: { name: string; parentId?: string; color?: string; icon?: string; position?: number }) {
    return this.http.post<Folder>(`${this.baseUrl}/folders`, payload);
  }

  updateUserFolder(folderId: string, payload: { name?: string; parentId?: string; color?: string; icon?: string; position?: number }) {
    return this.http.put<Folder>(`${this.baseUrl}/folders/${folderId}`, payload);
  }

  deleteUserFolder(folderId: string) {
    return this.http.delete(`${this.baseUrl}/folders/${folderId}`);
  }

  assignFileToSpace(fileId: string, spaceId: string | null) {
    return this.http.patch<SecureFile>(`${this.baseUrl}/${fileId}/space`, { spaceId });
  }

  getTenantFiles() {
    return this.http.get<SecureFile[]>(`${this.baseUrl}/tenant`);
  }

  getAllFilesAdmin() {
    return this.http.get<SecureFile[]>(`${this.baseUrl}/admin/all`);
  }

  getFilesSharedWithMe(filters?: { senderId?: string; senderQuery?: string; hiddenScope?: 'visible' | 'hidden' }) {
    const query = new URLSearchParams();

    if (filters?.senderId) {
      query.set('senderId', filters.senderId);
    }

    if (filters?.senderQuery) {
      query.set('senderQuery', filters.senderQuery);
    }

    if (filters?.hiddenScope) {
      query.set('hiddenScope', filters.hiddenScope);
    }

    const queryString = query.toString();
    const url = queryString
      ? `${this.baseUrl}/shared-with-me?${queryString}`
      : `${this.baseUrl}/shared-with-me`;

    return this.http.get<any[]>(url);
  }

  getFilesSharedByMe() {
    return this.http.get<any[]>(`${this.baseUrl}/shared-by-me`);
  }

  getTenantUsers() {
    const usersUrl = `${environment.apiBaseUrl}/users`;
    return this.http.get<any[]>(usersUrl);
  }

  getAnalytics(params?: { year?: number; month?: number; scope?: 'tenant' | 'agent' }) {
    const query = new URLSearchParams();

    if (params?.year) {
      query.set('year', String(params.year));
    }

    if (params?.month) {
      query.set('month', String(params.month));
    }

    if (params?.scope) {
      query.set('scope', params.scope);
    }

    const queryString = query.toString();
    const url = queryString
      ? `${this.baseUrl}/analytics?${queryString}`
      : `${this.baseUrl}/analytics`;

    return this.http.get<FileAnalyticsResponse>(url);
  }

  upload(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<SecureFile>(`${this.baseUrl}/upload`, formData);
  }

  uploadWithProgress(file: File) {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<SecureFile>(`${this.baseUrl}/upload`, formData, {
      reportProgress: true,
      observe: 'events'
    });
  }

  share(fileId: string, payload: {
    expiresInHours?: number;
    maxUses?: number;
    accessControl?: 'public' | 'recipient-only' | 'ip-restricted';
    recipientUserId?: string;
    recipientUserIds?: string[];
    recipientEmail?: string;
    shareSubject?: string;
    shareDescription?: string;
    allowedIPs?: string[];
  }) {
    return this.http.post<ShareLinkResponse>(`${this.baseUrl}/${fileId}/share`, payload);
  }

  updateFileSettings(fileId: string, payload: FileSettingsPayload) {
    return this.http.put<SecureFile>(`${this.baseUrl}/${fileId}`, payload);
  }

  download(fileId: string) {
    return this.http.get(`${this.baseUrl}/${fileId}/download`, { responseType: 'blob' });
  }

  downloadShared(token: string) {
    return this.http.get(`${this.baseUrl}/shared/${token}/download`, { responseType: 'blob' });
  }

  rescanShared(token: string) {
    return this.http.post<SharedFileScanResult>(`${this.baseUrl}/shared/${token}/rescan`, {});
  }

  revokeShare(linkId: string) {
    return this.http.delete(`${this.baseUrl}/shared/${linkId}`);
  }

  hideSharedWithMe(linkId: string) {
    return this.http.patch(`${this.baseUrl}/shared-with-me/${linkId}/hide`, {});
  }

  hideSharedFile(linkId: string) {
    return this.hideSharedWithMe(linkId);
  }

  restoreSharedWithMe(linkId: string) {
    return this.http.patch(`${this.baseUrl}/shared-with-me/${linkId}/restore`, {});
  }

  delete(fileId: string) {
    return this.http.delete(`${this.baseUrl}/${fileId}`);
  }

  searchFilesAndFolders(query: string, options?: { type?: 'files' | 'folders'; folderId?: string; limit?: number; offset?: number }) {
    const params = new URLSearchParams();
    params.set('q', query);

    if (options?.type) {
      params.set('type', options.type);
    }

    if (options?.folderId) {
      params.set('folderId', options.folderId);
    }

    if (options?.limit) {
      params.set('limit', String(options.limit));
    }

    if (options?.offset) {
      params.set('offset', String(options.offset));
    }

    return this.http.get<{
      query: string;
      total: number;
      results: Array<{
        id: string;
        name: string;
        type: 'file' | 'folder';
        mimeType?: string;
        size?: number;
        path?: string;
        parentId?: string;
        isRoot?: boolean;
        folderId?: string;
        createdAt: string;
      }>;
      pagination: {
        offset: number;
        limit: number;
        hasMore: boolean;
      };
    }>(`${this.baseUrl}/search?${params.toString()}`);
  }

  getStats() {
    return this.http.get<{
      totalFiles: number;
      totalSize: number;
      sharedFiles: number;
      receivedFiles: number;
      recentUploads: number;
    }>(`${this.baseUrl}/stats`);
  }
}