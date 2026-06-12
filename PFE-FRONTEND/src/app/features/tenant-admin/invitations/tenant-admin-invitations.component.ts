import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

@Component({
  standalone: true,
  selector: 'app-tenant-admin-invitations',
  imports: [CommonModule],
  template: `
    <section class="page-card">
      <div class="hero-card">
        <div>
          <p class="eyebrow">Tenant Admin</p>
          <h1>Invitations</h1>
          <p>Invitez de nouveaux membres dans le tenant et suivez les invitations en attente.</p>
        </div>
      </div>

      <div class="content-grid">
        <article class="info-card">
          <span class="card-label">Nouvelle invitation</span>
          <strong>Invitation e-mail</strong>
          <p>Préparez l’ajout d’un utilisateur au tenant avec le bon niveau d’accès.</p>
        </article>
        <article class="info-card">
          <span class="card-label">Suivi</span>
          <strong>Demandes en cours</strong>
          <p>Consultez l’état des invitations et les accès accordés.</p>
        </article>
      </div>
    </section>
  `,
  styles: [`
    .page-card { display: grid; gap: 1rem; }
    .hero-card, .info-card {
      background: rgba(255,255,255,0.88);
      border: 1px solid rgba(148,163,184,0.18);
      border-radius: 1.25rem;
      box-shadow: 0 18px 50px rgba(15,23,42,0.06);
    }
    .hero-card { padding: 1.5rem; }
    .eyebrow { margin: 0 0 .4rem; color: #2563eb; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; font-size: .72rem; }
    h1 { margin: 0 0 .35rem; font-size: 1.8rem; color: #0f172a; }
    .hero-card p, .info-card p { margin: 0; color: #64748b; }
    .content-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; }
    .info-card { padding: 1.25rem; display: grid; gap: .35rem; }
    .card-label { color: #64748b; font-size: .78rem; text-transform: uppercase; letter-spacing: .08em; font-weight: 700; }
    .info-card strong { color: #0f172a; font-size: 1.05rem; }
    @media (max-width: 900px) { .content-grid { grid-template-columns: 1fr; } }
  `]
})
export class TenantAdminInvitationsComponent {}