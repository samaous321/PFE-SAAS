import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Complaint, ComplaintRequest } from '../../../core/models/complaint.model';
import { ComplaintApiService } from '../../../core/services/complaint-api.service';
import { NotificationService } from '../../../core/services/notification.service';

@Component({
  standalone: true,
  selector: 'app-user-complaints',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="complaints-page">
      <header class="page-header">
        <div>
          <p class="eyebrow">Module Réclamation</p>
          <h1>Mes réclamations</h1>
          <p>Créez une réclamation, suivez son état et échangez avec l’équipe administrative.</p>
        </div>
        <div class="header-pill">{{ complaints.length }} ticket(s)</div>
      </header>

      <section class="grid-layout">
        <article class="panel create-panel">
          <div class="panel-head">
            <h2>Nouvelle réclamation</h2>
            <span class="panel-badge">User</span>
          </div>

          <form class="form-grid" (ngSubmit)="createComplaint()">
            <label>
              Sujet
              <input type="text" [(ngModel)]="draft.subject" name="subject" placeholder="Ex: Problème d'accès" required />
            </label>

            <label>
              Catégorie
              <select [(ngModel)]="draft.category" name="category">
                <option value="technical">Technique</option>
                <option value="billing">Facturation</option>
                <option value="access">Accès</option>
                <option value="security">Sécurité</option>
                <option value="other">Autre</option>
              </select>
            </label>

            <label>
              Priorité
              <select [(ngModel)]="draft.priority" name="priority">
                <option value="low">Basse</option>
                <option value="medium">Moyenne</option>
                <option value="high">Haute</option>
                <option value="urgent">Urgente</option>
              </select>
            </label>

            <label class="full-width">
              Description
              <textarea [(ngModel)]="draft.description" name="description" rows="6" placeholder="Expliquez votre problème en détail" required></textarea>
            </label>

            <label class="full-width">
              Tags
              <input type="text" [(ngModel)]="tagsText" name="tagsText" placeholder="séparés par des virgules" />
            </label>

            <div class="form-actions full-width">
              <button type="submit" [disabled]="creating">
                {{ creating ? 'Création...' : 'Créer la réclamation' }}
              </button>
            </div>
          </form>
        </article>

        <article class="panel list-panel">
          <div class="panel-head">
            <h2>Historique</h2>
            <button type="button" class="ghost" (click)="refreshNow()">Rafraîchir</button>
          </div>

          <div *ngIf="loading" class="empty-state">Chargement...</div>

          <div *ngIf="!loading && complaints.length" class="complaint-list">
            <button
              type="button"
              *ngFor="let complaint of complaints"
              class="complaint-card"
              [class.active]="selected?.ticketId === complaint.ticketId"
              (click)="selectComplaint(complaint)"
            >
              <div class="complaint-top">
                <strong>{{ complaint.ticketId }}</strong>
                <span class="status" [ngClass]="complaint.status">{{ labelStatus(complaint.status) }}</span>
              </div>
              <div class="complaint-subject">{{ complaint.subject }}</div>
              <div class="complaint-meta">
                <span>{{ labelPriority(complaint.priority) }}</span>
                <span>{{ labelCategory(complaint.category) }}</span>
              </div>
            </button>
          </div>

          <div *ngIf="!loading && !complaints.length" class="empty-state">
            Aucune réclamation pour le moment.
          </div>
        </article>
      </section>

      <section *ngIf="selected" class="panel detail-panel">
        <div class="panel-head">
          <div>
            <h2>{{ selected.ticketId }}</h2>
            <p>{{ selected.subject }}</p>
          </div>
          <div class="head-actions">
            <span class="new-badge" *ngIf="hasNewAdminMessage">Nouveau message admin</span>
            <button type="button" class="ghost" (click)="markAsRead()" *ngIf="hasNewAdminMessage">Marquer comme lu</button>
            <button type="button" class="ghost" (click)="openTicketPage()">Ouvrir la page ticket</button>
            <button *ngIf="canCancel(selected)" type="button" class="danger" (click)="cancelComplaint()">Annuler</button>
          </div>
        </div>

        <div class="detail-grid">
          <div class="info-card">
            <span>Statut</span>
            <strong>{{ labelStatus(selected.status) }}</strong>
          </div>
          <div class="info-card">
            <span>Priorité</span>
            <strong>{{ labelPriority(selected.priority) }}</strong>
          </div>
          <div class="info-card">
            <span>Catégorie</span>
            <strong>{{ labelCategory(selected.category) }}</strong>
          </div>
          <div class="info-card">
            <span>Dernière activité</span>
            <strong>{{ formatDate(selected.lastActivityAt || selected.updatedAt) }}</strong>
          </div>
        </div>

        <div class="timeline">
          <article
            *ngFor="let message of selected.messages || []"
            class="message-item"
            [class.admin]="message.authorType === 'admin'"
            [class.new-highlight]="isHighlightedMessage(message)"
          >
            <div class="message-head">
              <strong>{{ message.authorType === 'admin' ? 'Administration' : 'Vous' }}</strong>
              <span>{{ formatDate(message.createdAt) }}</span>
            </div>
            <p>{{ message.message }}</p>
            <small *ngIf="message.isInternalNote">Note interne admin</small>
          </article>
        </div>

        <form class="reply-box" (ngSubmit)="sendMessage()">
          <textarea [(ngModel)]="replyText" name="replyText" rows="4" placeholder="Ajouter un message à votre réclamation"></textarea>
          <div class="form-actions">
            <button type="submit" [disabled]="replying || !replyText.trim()">
              {{ replying ? 'Envoi...' : 'Envoyer le message' }}
            </button>
          </div>
        </form>
      </section>
    </div>
  `,
  styles: [`
    .complaints-page { padding: 1.5rem; display: grid; gap: 1.25rem; background: linear-gradient(180deg, #f8fbff 0%, #f4f8fb 100%); min-height: 100%; }
    .page-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; padding: 1.25rem 1.5rem; border: 1px solid #dbe7f3; border-radius: 1.25rem; background: rgba(255,255,255,.85); box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06); }
    .eyebrow { margin: 0; color: #2563eb; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; font-size: .76rem; }
    h1, h2, p { margin: 0; }
    .page-header h1 { font-size: 2rem; color: #0f172a; margin-top: .35rem; }
    .page-header p { color: #475569; margin-top: .3rem; max-width: 720px; }
    .header-pill { padding: .7rem 1rem; border-radius: 999px; background: #e0f2fe; color: #075985; font-weight: 700; }
    .grid-layout { display: grid; grid-template-columns: 1.1fr .9fr; gap: 1.25rem; align-items: start; }
    .panel { background: #fff; border: 1px solid #dbe7f3; border-radius: 1.25rem; box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06); padding: 1.25rem; }
    .panel-head { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-bottom: 1rem; }
    .head-actions { display: flex; gap: .65rem; align-items: center; }
    .new-badge { background: #dcfce7; color: #15803d; border: 1px solid #86efac; border-radius: 999px; padding: .38rem .7rem; font-size: .75rem; font-weight: 800; }
    .panel-head h2 { font-size: 1.15rem; color: #0f172a; }
    .panel-head p { color: #64748b; margin-top: .25rem; }
    .panel-badge, .status { display: inline-flex; align-items: center; border-radius: 999px; font-size: .75rem; font-weight: 700; padding: .4rem .7rem; }
    .panel-badge { background: #ecfeff; color: #0f766e; }
    .ghost, button { border: none; border-radius: .85rem; cursor: pointer; }
    .ghost { background: #eef2ff; color: #4338ca; padding: .7rem 1rem; font-weight: 700; }
    .create-panel .form-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .9rem; }
    label { display: grid; gap: .45rem; color: #334155; font-weight: 600; }
    input, select, textarea { width: 100%; border: 1px solid #cbd5e1; border-radius: .9rem; padding: .85rem 1rem; font: inherit; background: #fff; color: #0f172a; }
    textarea { resize: vertical; }
    .full-width { grid-column: 1 / -1; }
    .form-actions { display: flex; justify-content: flex-end; }
    button[type='submit'], .danger { padding: .85rem 1.1rem; font-weight: 800; color: white; background: linear-gradient(135deg, #0f766e 0%, #2563eb 100%); }
    .danger { background: linear-gradient(135deg, #dc2626 0%, #ef4444 100%); }
    .complaint-list { display: grid; gap: .8rem; }
    .complaint-card { width: 100%; text-align: left; padding: 1rem; background: #f8fafc; border: 1px solid #dbe7f3; }
    .complaint-card.active { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37, 99, 235, .1); }
    .complaint-top { display: flex; justify-content: space-between; gap: 1rem; align-items: center; }
    .complaint-subject { margin: .45rem 0; color: #0f172a; font-weight: 700; }
    .complaint-meta { display: flex; gap: .6rem; flex-wrap: wrap; color: #64748b; font-size: .85rem; }
    .status.open { background: #dbeafe; color: #1d4ed8; }
    .status.in_progress { background: #fef3c7; color: #b45309; }
    .status.pending_user { background: #ede9fe; color: #6d28d9; }
    .status.resolved { background: #dcfce7; color: #15803d; }
    .status.closed { background: #e2e8f0; color: #475569; }
    .status.rejected { background: #fee2e2; color: #b91c1c; }
    .detail-panel { display: grid; gap: 1rem; }
    .detail-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: .8rem; }
    .info-card { border: 1px solid #dbe7f3; background: #f8fafc; border-radius: 1rem; padding: .9rem; display: grid; gap: .35rem; }
    .info-card span { color: #64748b; font-size: .8rem; }
    .message-item { border: 1px solid #dbe7f3; border-radius: 1rem; padding: 1rem; background: #fff; display: grid; gap: .45rem; transition: border-color .25s ease, background-color .25s ease, box-shadow .25s ease; }
    .message-item.admin { background: #eff6ff; border-color: #bfdbfe; }
    .message-item.new-highlight { border-color: #22c55e; background: #f0fdf4; box-shadow: 0 0 0 3px rgba(34, 197, 94, .18); }
    .message-head { display: flex; justify-content: space-between; gap: 1rem; color: #475569; font-size: .85rem; }
    .reply-box { display: grid; gap: .85rem; }
    .empty-state { padding: 1rem; color: #64748b; text-align: center; }
    @media (max-width: 1100px) { .grid-layout, .detail-grid { grid-template-columns: 1fr; } .create-panel .form-grid { grid-template-columns: 1fr; } }
  `]
})
export class UserComplaintsComponent implements OnInit, OnDestroy {
  private readonly api = inject(ComplaintApiService);
  private readonly notification = inject(NotificationService);
  private readonly router = inject(Router);
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  loading = false;
  creating = false;
  replying = false;
  complaints: Complaint[] = [];
  selected: Complaint | null = null;
  replyText = '';
  tagsText = '';
  hasNewAdminMessage = false;
  private lastSeenAdminMessageAt: string | null = null;
  private highlightedMessageAt: string | null = null;
  private highlightTimer: ReturnType<typeof setTimeout> | null = null;

  draft: ComplaintRequest = {
    category: 'other',
    priority: 'medium',
    subject: '',
    description: ''
  };

  ngOnInit(): void {
    this.loadComplaints();
    this.startAutoRefresh();
  }

  ngOnDestroy(): void {
    this.stopAutoRefresh();
    this.clearHighlightTimer();
  }

  loadComplaints(): void {
    this.loading = true;
    this.api.getMyComplaints({ limit: 50, sortBy: '-createdAt' }).subscribe({
      next: (response) => {
        this.complaints = response.data || [];
        this.loading = false;

        if (this.complaints.length && !this.selected) {
          this.selectComplaint(this.complaints[0]);
          return;
        }

        if (!this.complaints.length) {
          this.selected = null;
          return;
        }

        if (this.selected) {
          const stillExists = this.complaints.some((item) => item.ticketId === this.selected?.ticketId);
          if (!stillExists) {
            this.selected = this.complaints[0];
          }
          this.refreshSelectedComplaint(true);
        }
      },
      error: () => {
        this.loading = false;
        this.notification.error('Erreur de chargement des réclamations');
      }
    });
  }

  private refreshSelectedComplaint(silent: boolean = false): void {
    if (!this.selected?.ticketId) return;

    this.api.getComplaintDetails(this.selected.ticketId).subscribe({
      next: (response) => {
        const latestBefore = this.getLatestAdminMessageAt(this.selected);
        this.selected = response.data;
        const latestAfter = this.getLatestAdminMessageAt(this.selected);

        if (latestAfter && this.lastSeenAdminMessageAt && this.isAfter(latestAfter, this.lastSeenAdminMessageAt)) {
          this.hasNewAdminMessage = true;
          this.flashAdminMessage(latestAfter);
          if (!silent) {
            this.notification.info('Nouvelle réponse admin reçue');
          }
        }

        if (!this.lastSeenAdminMessageAt && latestAfter) {
          this.lastSeenAdminMessageAt = latestAfter;
        }

        if (latestBefore && latestAfter && this.isAfter(latestAfter, latestBefore) && !silent) {
          this.notification.info('Le ticket a été mis à jour');
        }
      },
      error: () => {
        if (!silent) {
          this.notification.error('Impossible de charger ce ticket');
        }
      }
    });
  }

  private startAutoRefresh(): void {
    this.stopAutoRefresh();
    this.refreshTimer = setInterval(() => {
      if (!this.creating && !this.replying) {
        this.loadComplaints();
      }
    }, 10000);
  }

  refreshNow(): void {
    this.loadComplaints();
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

  createComplaint(): void {
    if (!this.draft.subject.trim() || !this.draft.description.trim()) return;

    this.creating = true;
    const payload: ComplaintRequest = {
      ...this.draft,
      tags: this.tagsText
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
    };

    this.api.createComplaint(payload).subscribe({
      next: (response) => {
        this.creating = false;
        this.draft = { category: 'other', priority: 'medium', subject: '', description: '' };
        this.tagsText = '';
        this.loadComplaints();
        this.notification.success('Réclamation créée avec succès');
        if (response.data) {
          this.selectComplaint(response.data);
        }
      },
      error: () => {
        this.creating = false;
        this.notification.error('Impossible de créer la réclamation');
      }
    });
  }

  selectComplaint(complaint: Complaint): void {
    this.selected = complaint;
    this.hasNewAdminMessage = false;
    this.lastSeenAdminMessageAt = this.getLatestAdminMessageAt(complaint);
    this.refreshSelectedComplaint();
  }

  sendMessage(): void {
    if (!this.selected || !this.replyText.trim()) return;

    this.replying = true;
    this.api.addMyComplaintMessage(this.selected.ticketId, { message: this.replyText.trim() }).subscribe({
      next: (response) => {
        this.replying = false;
        this.replyText = '';
        this.selected = response.data;
        this.lastSeenAdminMessageAt = this.getLatestAdminMessageAt(response.data);
        this.hasNewAdminMessage = false;
        this.loadComplaints();
        this.notification.success('Message envoyé');
      },
      error: () => {
        this.replying = false;
        this.notification.error('Échec de l\'envoi du message');
      }
    });
  }

  cancelComplaint(): void {
    if (!this.selected) return;

    const reason = prompt('Raison de l\'annulation ?') || 'Cancelled by user';
    this.api.cancelMyComplaint(this.selected.ticketId, reason).subscribe({
      next: (response) => {
        this.selected = response.data;
        this.loadComplaints();
        this.notification.success('Réclamation annulée');
      },
      error: () => {
        this.notification.error('Annulation impossible');
      }
    });
  }

  openTicketPage(): void {
    if (!this.selected) return;
    this.markAsRead();
    this.router.navigate(['/user/complaints', this.selected.ticketId]);
  }

  markAsRead(): void {
    if (!this.selected) return;
    this.lastSeenAdminMessageAt = this.getLatestAdminMessageAt(this.selected);
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

  canCancel(complaint: Complaint): boolean {
    return ['open', 'in_progress', 'pending_user'].includes(complaint.status);
  }

  labelStatus(status: string): string {
    const labels: Record<string, string> = {
      open: 'Ouverte',
      in_progress: 'En cours',
      pending_user: 'En attente user',
      resolved: 'Résolue',
      closed: 'Fermée',
      rejected: 'Rejetée'
    };
    return labels[status] || status;
  }

  labelPriority(priority: string): string {
    const labels: Record<string, string> = {
      low: 'Basse',
      medium: 'Moyenne',
      high: 'Haute',
      urgent: 'Urgente'
    };
    return labels[priority] || priority;
  }

  labelCategory(category: string): string {
    const labels: Record<string, string> = {
      technical: 'Technique',
      billing: 'Facturation',
      access: 'Accès',
      security: 'Sécurité',
      other: 'Autre'
    };
    return labels[category] || category;
  }

  formatDate(value?: string): string {
    if (!value) return '-';
    return new Date(value).toLocaleString('fr-FR');
  }
}
