import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Complaint } from '../../../core/models/complaint.model';
import { ComplaintApiService } from '../../../core/services/complaint-api.service';
import { NotificationService } from '../../../core/services/notification.service';

@Component({
  standalone: true,
  selector: 'app-user-complaint-detail',
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="detail-page" *ngIf="complaint; else loadingTpl">
      <header class="detail-header">
        <div>
          <p class="eyebrow">Ticket {{ complaint.ticketId }}</p>
          <h1>{{ complaint.subject }}</h1>
          <p>Suivi complet de votre réclamation avec historique des échanges.</p>
        </div>
        <div class="header-actions">
          <span class="new-badge" *ngIf="hasNewAdminMessage">Nouveau message admin</span>
          <button type="button" class="ghost" *ngIf="hasNewAdminMessage" (click)="markAsRead()">Marquer comme lu</button>
          <button type="button" class="ghost" (click)="refreshNow()">Rafraîchir maintenant</button>
          <a routerLink="/user/complaints" class="back-link">← Retour aux réclamations</a>
        </div>
      </header>

      <section class="meta-grid">
        <article class="meta-card">
          <span>Statut</span>
          <strong>{{ labelStatus(complaint.status) }}</strong>
        </article>
        <article class="meta-card">
          <span>Priorité</span>
          <strong>{{ labelPriority(complaint.priority) }}</strong>
        </article>
        <article class="meta-card">
          <span>Catégorie</span>
          <strong>{{ labelCategory(complaint.category) }}</strong>
        </article>
        <article class="meta-card">
          <span>Dernière activité</span>
          <strong>{{ formatDate(complaint.lastActivityAt || complaint.updatedAt) }}</strong>
        </article>
      </section>

      <section class="panel timeline-panel">
        <div class="panel-head">
          <h2>Timeline</h2>
          <button type="button" class="danger" *ngIf="canCancel(complaint)" (click)="cancelComplaint()">Annuler</button>
        </div>
        <article
          *ngFor="let message of complaint.messages || []"
          class="message-item"
          [class.admin]="message.authorType === 'admin'"
          [class.new-highlight]="isHighlightedMessage(message)"
        >
          <div class="message-head">
            <strong>{{ message.authorType === 'admin' ? 'Administration' : 'Vous' }}</strong>
            <span>{{ formatDate(message.createdAt) }}</span>
          </div>
          <p>{{ message.message }}</p>
        </article>
      </section>

      <section class="panel reply-panel">
        <h2>Répondre</h2>
        <form (ngSubmit)="sendMessage()" class="reply-form">
          <textarea [(ngModel)]="replyText" name="replyText" rows="5" placeholder="Ajouter un message"></textarea>
          <button type="submit" [disabled]="!replyText.trim() || replying">{{ replying ? 'Envoi...' : 'Envoyer' }}</button>
        </form>
      </section>
    </div>

    <ng-template #loadingTpl>
      <div class="loading">Chargement du ticket...</div>
    </ng-template>
  `,
  styles: [`
    .detail-page { padding: 1.5rem; display: grid; gap: 1rem; background: linear-gradient(180deg,#f8fbff 0%,#f4f8fb 100%); min-height: 100%; }
    .detail-header { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; padding: 1.25rem; border-radius: 1rem; border: 1px solid #dbe7f3; background: white; }
    .header-actions { display: flex; gap: .6rem; align-items: center; flex-wrap: wrap; justify-content: flex-end; }
    .eyebrow { margin: 0; color: #2563eb; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; font-size: .76rem; }
    h1,h2,p { margin: 0; }
    h1 { margin-top: .35rem; color: #0f172a; }
    .detail-header p { color: #64748b; margin-top: .35rem; }
    .back-link { color: #1d4ed8; font-weight: 700; text-decoration: none; }
    .meta-grid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: .8rem; }
    .meta-card { border: 1px solid #dbe7f3; border-radius: 1rem; background: white; padding: .9rem; display: grid; gap: .35rem; }
    .meta-card span { color: #64748b; font-size: .8rem; }
    .ghost { border: 1px solid #c7d2fe; border-radius: .8rem; padding: .55rem .8rem; background: #eef2ff; color: #4338ca; font-weight: 700; cursor: pointer; }
    .new-badge { background: #dcfce7; color: #15803d; border: 1px solid #86efac; border-radius: 999px; padding: .38rem .7rem; font-size: .75rem; font-weight: 800; }
    .panel { border: 1px solid #dbe7f3; border-radius: 1rem; background: white; padding: 1rem; display: grid; gap: .8rem; }
    .panel-head { display: flex; justify-content: space-between; align-items: center; }
    .message-item { border: 1px solid #dbe7f3; border-radius: .85rem; padding: .8rem; transition: border-color .25s ease, background-color .25s ease, box-shadow .25s ease; }
    .message-item.admin { background: #eff6ff; border-color: #bfdbfe; }
    .message-item.new-highlight { border-color: #22c55e; background: #f0fdf4; box-shadow: 0 0 0 3px rgba(34, 197, 94, .18); }
    .message-head { display: flex; justify-content: space-between; gap: .8rem; font-size: .85rem; color: #475569; }
    .reply-form { display: grid; gap: .8rem; }
    textarea { border: 1px solid #cbd5e1; border-radius: .85rem; padding: .8rem; font: inherit; }
    button { border: none; border-radius: .85rem; padding: .8rem 1rem; color: white; font-weight: 800; cursor: pointer; background: linear-gradient(135deg,#0f766e 0%,#2563eb 100%); }
    .danger { background: linear-gradient(135deg,#dc2626 0%,#ef4444 100%); }
    .loading { padding: 2rem; text-align: center; color: #64748b; }
    @media (max-width: 1000px) { .meta-grid { grid-template-columns: 1fr; } .detail-header { flex-direction: column; } }
  `]
})
export class UserComplaintDetailComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ComplaintApiService);
  private readonly notification = inject(NotificationService);
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private activeTicketId = '';

  complaint: Complaint | null = null;
  replying = false;
  replyText = '';
  hasNewAdminMessage = false;
  private lastSeenAdminMessageAt: string | null = null;
  private highlightedMessageAt: string | null = null;
  private highlightTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const ticketId = params.get('ticketId');
      if (!ticketId) {
        this.router.navigate(['/user/complaints']);
        return;
      }
      this.activeTicketId = ticketId;
      this.loadComplaint(ticketId);
      this.startAutoRefresh();
    });
  }

  ngOnDestroy(): void {
    this.stopAutoRefresh();
    this.clearHighlightTimer();
  }

  private loadComplaint(ticketId: string): void {
    this.api.getComplaintDetails(ticketId).subscribe({
      next: (response) => {
        const previousLatest = this.getLatestAdminMessageAt(this.complaint);
        this.complaint = response.data;
        const latestNow = this.getLatestAdminMessageAt(this.complaint);

        if (!this.lastSeenAdminMessageAt && latestNow) {
          this.lastSeenAdminMessageAt = latestNow;
        }

        if (latestNow && this.lastSeenAdminMessageAt && this.isAfter(latestNow, this.lastSeenAdminMessageAt)) {
          this.hasNewAdminMessage = true;
          this.flashAdminMessage(latestNow);
        }

        if (previousLatest && latestNow && this.isAfter(latestNow, previousLatest)) {
          this.notification.info('Le ticket a reçu une nouvelle réponse');
        }
      },
      error: () => {
        this.notification.error('Impossible de charger cette réclamation');
        this.router.navigate(['/user/complaints']);
      }
    });
  }

  private startAutoRefresh(): void {
    this.stopAutoRefresh();
    this.refreshTimer = setInterval(() => {
      if (!this.replying && this.activeTicketId) {
        this.loadComplaint(this.activeTicketId);
      }
    }, 10000);
  }

  refreshNow(): void {
    if (!this.activeTicketId) return;
    this.loadComplaint(this.activeTicketId);
    this.notification.info('Rafraîchissement lancé');
  }

  private stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  private flashAdminMessage(messageAt: string): void {
    this.highlightedMessageAt = messageAt;
    this.clearHighlightTimer();
    this.highlightTimer = setTimeout(() => {
      this.highlightedMessageAt = null;
      this.highlightTimer = null;
    }, 3000);
  }

  private clearHighlightTimer(): void {
    if (this.highlightTimer) {
      clearTimeout(this.highlightTimer);
      this.highlightTimer = null;
    }
  }

  sendMessage(): void {
    if (!this.complaint || !this.replyText.trim()) return;

    this.replying = true;
    this.api.addMyComplaintMessage(this.complaint.ticketId, { message: this.replyText.trim() }).subscribe({
      next: (response) => {
        this.replying = false;
        this.replyText = '';
        this.complaint = response.data;
        this.lastSeenAdminMessageAt = this.getLatestAdminMessageAt(response.data);
        this.hasNewAdminMessage = false;
        this.notification.success('Message envoyé');
      },
      error: () => {
        this.replying = false;
        this.notification.error('Échec de l\'envoi du message');
      }
    });
  }

  cancelComplaint(): void {
    if (!this.complaint) return;
    const reason = prompt('Raison de l\'annulation ?') || 'Cancelled by user';
    this.api.cancelMyComplaint(this.complaint.ticketId, reason).subscribe({
      next: (response) => {
        this.complaint = response.data;
        this.lastSeenAdminMessageAt = this.getLatestAdminMessageAt(response.data);
        this.hasNewAdminMessage = false;
        this.notification.success('Réclamation annulée');
      },
      error: () => {
        this.notification.error('Annulation impossible');
      }
    });
  }

  canCancel(complaint: Complaint): boolean {
    return ['open', 'in_progress', 'pending_user'].includes(complaint.status);
  }

  labelStatus(status: string): string {
    const labels: Record<string, string> = {
      open: 'Ouverte', in_progress: 'En cours', pending_user: 'En attente user', resolved: 'Résolue', closed: 'Fermée', rejected: 'Rejetée'
    };
    return labels[status] || status;
  }

  labelPriority(priority: string): string {
    const labels: Record<string, string> = { low: 'Basse', medium: 'Moyenne', high: 'Haute', urgent: 'Urgente' };
    return labels[priority] || priority;
  }

  labelCategory(category: string): string {
    const labels: Record<string, string> = { technical: 'Technique', billing: 'Facturation', access: 'Accès', security: 'Sécurité', other: 'Autre' };
    return labels[category] || category;
  }

  formatDate(value?: string): string {
    return value ? new Date(value).toLocaleString('fr-FR') : '-';
  }

  markAsRead(): void {
    this.lastSeenAdminMessageAt = this.getLatestAdminMessageAt(this.complaint);
    this.hasNewAdminMessage = false;
  }

  isHighlightedMessage(message: { authorType: string; createdAt: string; isInternalNote?: boolean }): boolean {
    return (
      message.authorType === 'admin' &&
      !message.isInternalNote &&
      !!this.highlightedMessageAt &&
      message.createdAt === this.highlightedMessageAt
    );
  }

  private getLatestAdminMessageAt(complaint: Complaint | null): string | null {
    if (!complaint?.messages?.length) return null;

    const adminMessages = complaint.messages
      .filter((entry) => entry.authorType === 'admin' && !entry.isInternalNote)
      .map((entry) => entry.createdAt)
      .filter(Boolean)
      .sort();

    return adminMessages.length ? adminMessages[adminMessages.length - 1] : null;
  }

  private isAfter(left: string, right: string): boolean {
    return new Date(left).getTime() > new Date(right).getTime();
  }
}
