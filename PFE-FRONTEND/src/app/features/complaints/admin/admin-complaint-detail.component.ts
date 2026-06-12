import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Complaint } from '../../../core/models/complaint.model';
import { ComplaintApiService } from '../../../core/services/complaint-api.service';
import { NotificationService } from '../../../core/services/notification.service';

@Component({
  standalone: true,
  selector: 'app-admin-complaint-detail',
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="detail-page" *ngIf="complaint; else loadingTpl">
      <header class="detail-header">
        <div>
          <p class="eyebrow">Ticket {{ complaint.ticketId }}</p>
          <h1>{{ complaint.subject }}</h1>
          <p>Traitement superadmin avec timeline détaillée et actions de gestion.</p>
        </div>
        <a routerLink="/admin/complaints" class="back-link">← Retour à la file</a>
      </header>

      <section class="meta-grid">
        <article class="meta-card"><span>Statut</span><strong>{{ labelStatus(complaint.status) }}</strong></article>
        <article class="meta-card"><span>Priorité</span><strong>{{ labelPriority(complaint.priority) }}</strong></article>
        <article class="meta-card"><span>Demandeur</span><strong>{{ complaint.requester.fullName }}</strong></article>
        <article class="meta-card"><span>Email</span><strong>{{ complaint.requester.email }}</strong></article>
      </section>

      <section class="panel actions-panel">
        <div class="action-row">
          <label>
            Statut
            <select [(ngModel)]="nextStatus" name="nextStatus">
              <option value="in_progress">En cours</option>
              <option value="pending_user">En attente user</option>
              <option value="resolved">Résolue</option>
              <option value="closed">Fermée</option>
              <option value="rejected">Rejetée</option>
            </select>
          </label>
          <label>
            Raison
            <input [(ngModel)]="statusReason" name="statusReason" placeholder="note interne ou raison" />
          </label>
          <button type="button" (click)="updateStatus()">Mettre à jour</button>
        </div>
      </section>

      <section class="panel timeline-panel">
        <h2>Timeline</h2>
        <article *ngFor="let message of complaint.messages || []" class="message-item" [class.admin]="message.authorType === 'admin'">
          <div class="message-head">
            <strong>{{ message.authorType === 'admin' ? 'Administration' : 'Utilisateur' }}</strong>
            <span>{{ formatDate(message.createdAt) }}</span>
          </div>
          <p>{{ message.message }}</p>
          <small *ngIf="message.isInternalNote">Note interne</small>
        </article>
      </section>

      <section class="panel reply-panel">
        <h2>Réponse supervision</h2>
        <form class="reply-form" (ngSubmit)="sendMessage()">
          <textarea [(ngModel)]="replyText" name="replyText" rows="5" placeholder="Réponse à l'utilisateur"></textarea>
          <label class="inline-option">
            <input type="checkbox" [(ngModel)]="internalNote" name="internalNote" />
            Enregistrer comme note interne
          </label>
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
    .eyebrow { margin: 0; color: #0f766e; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; font-size: .76rem; }
    h1,h2,p { margin: 0; }
    h1 { margin-top: .35rem; color: #0f172a; }
    .detail-header p { color: #64748b; margin-top: .35rem; }
    .back-link { color: #1d4ed8; font-weight: 700; text-decoration: none; }
    .meta-grid { display: grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap: .8rem; }
    .meta-card { border: 1px solid #dbe7f3; border-radius: 1rem; background: white; padding: .9rem; display: grid; gap: .35rem; }
    .meta-card span { color: #64748b; font-size: .8rem; }
    .panel { border: 1px solid #dbe7f3; border-radius: 1rem; background: white; padding: 1rem; display: grid; gap: .8rem; }
    .action-row { display: grid; grid-template-columns: 1fr 1fr auto; gap: .8rem; align-items: end; }
    label { display: grid; gap: .35rem; color: #334155; font-weight: 600; }
    input, select, textarea { border: 1px solid #cbd5e1; border-radius: .85rem; padding: .8rem; font: inherit; }
    .message-item { border: 1px solid #dbe7f3; border-radius: .85rem; padding: .8rem; }
    .message-item.admin { background: #eff6ff; border-color: #bfdbfe; }
    .message-head { display: flex; justify-content: space-between; gap: .8rem; font-size: .85rem; color: #475569; }
    .reply-form { display: grid; gap: .8rem; }
    .inline-option { display: flex; align-items: center; gap: .5rem; font-weight: 600; color: #475569; }
    button { border: none; border-radius: .85rem; padding: .8rem 1rem; color: white; font-weight: 800; cursor: pointer; background: linear-gradient(135deg,#0f766e 0%,#2563eb 100%); }
    .loading { padding: 2rem; text-align: center; color: #64748b; }
    @media (max-width: 1100px) { .meta-grid { grid-template-columns: 1fr; } .action-row { grid-template-columns: 1fr; } .detail-header { flex-direction: column; } }
  `]
})
export class AdminComplaintDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly api = inject(ComplaintApiService);
  private readonly notification = inject(NotificationService);

  complaint: Complaint | null = null;
  nextStatus = 'in_progress';
  statusReason = '';
  replyText = '';
  internalNote = false;
  replying = false;

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const ticketId = params.get('ticketId');
      if (!ticketId) {
        this.router.navigate(['/admin/complaints']);
        return;
      }
      this.loadComplaint(ticketId);
    });
  }

  private loadComplaint(ticketId: string): void {
    this.api.getAdminComplaintDetails(ticketId).subscribe({
      next: (response) => {
        this.complaint = response.data;
      },
      error: () => {
        this.notification.error('Ticket introuvable');
        this.router.navigate(['/admin/complaints']);
      }
    });
  }

  updateStatus(): void {
    if (!this.complaint) return;
    this.api.updateComplaintStatus(this.complaint.ticketId, this.nextStatus, this.statusReason).subscribe({
      next: (response) => {
        this.complaint = response.data;
        this.notification.success('Statut mis à jour');
      },
      error: () => this.notification.error('Mise à jour impossible')
    });
  }

  sendMessage(): void {
    if (!this.complaint || !this.replyText.trim()) return;
    this.replying = true;
    this.api.addAdminComplaintMessage(this.complaint.ticketId, {
      message: this.replyText.trim(),
      isInternalNote: this.internalNote
    }).subscribe({
      next: (response) => {
        this.replying = false;
        this.replyText = '';
        this.internalNote = false;
        this.complaint = response.data;
        this.notification.success('Réponse envoyée');
      },
      error: () => {
        this.replying = false;
        this.notification.error('Échec de l\'envoi');
      }
    });
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

  formatDate(value?: string): string {
    return value ? new Date(value).toLocaleString('fr-FR') : '-';
  }
}
