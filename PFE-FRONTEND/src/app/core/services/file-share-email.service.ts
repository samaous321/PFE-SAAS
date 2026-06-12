/**
 * 📧 FRONTEND INTEGRATION - Email Notification on File Share
 * 
 * Ce fichier démontre comment intégrer la fonctionnalité de notification
 * email au partage de fichiers depuis le frontend Angular.
 */

import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

// ============================================================================
// INTERFACES
// ============================================================================

interface ShareFileRequest {
  // Destinataire
  recipientEmail: string;
  recipientName?: string;

  // Options de partage
  accessControl: 'public' | 'recipient-only' | 'ip-restricted';
  expiresInHours?: number;
  maxUses?: number;

  // Contenu de l'email
  note?: string;
  subject?: string;

  // Configuration d'envoi
  notifyRecipient?: boolean;

  // Optionnel
  password?: string;
  allowedIPs?: string[];
}

interface ShareFileResponse {
  linkId: string;
  token: string;
  shareUrl: string;
  accessControl: string;
  recipientInfo: {
    email: string;
    requiresAuth: boolean;
  };
  expiresAt: Date;
  maxUses: number;
  message: string;
}

interface ShareHistory {
  shareId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  sharedWith: {
    email: string;
  };
  note?: string;
  subject?: string;
  status: 'active' | 'revoked' | 'expired';
  expiresAt: Date;
  createdAt: Date;
}

// ============================================================================
// SERVICE
// ============================================================================

@Injectable({
  providedIn: 'root'
})
export class FileShareService {
  private apiUrl = environment.apiBaseUrl + '/files';

  constructor(private http: HttpClient) {}

  /**
   * Partager un fichier avec notification email
   */
  shareFile(
    fileId: string,
    shareData: ShareFileRequest
  ): Observable<ShareFileResponse> {
    const url = `${this.apiUrl}/${fileId}/share`;
    return this.http.post<ShareFileResponse>(url, {
      ...shareData,
      notifyRecipient: shareData.notifyRecipient !== false
    });
  }

  /**
   * Récupérer l'historique de partage
   */
  getShareHistory(
    page: number = 1,
    limit: number = 10,
    filters?: any
  ): Observable<{ data: ShareHistory[] }> {
    let params = `?page=${page}&limit=${limit}`;
    
    if (filters?.status) {
      params += `&status=${filters.status}`;
    }
    if (filters?.recipientEmail) {
      params += `&recipientEmail=${filters.recipientEmail}`;
    }

    return this.http.get<{ data: ShareHistory[] }>(
      `${environment.apiBaseUrl}/shares/history${params}`
    );
  }

  /**
   * Télécharger depuis un lien partagé
   */
  downloadShared(token: string): Observable<Blob> {
    return this.http.get(
      `${environment.apiBaseUrl}/file/shared/${token}/download`,
      { responseType: 'blob' }
    );
  }
}