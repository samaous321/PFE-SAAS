import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NotificationService } from '../../../core/services/notification.service';

interface AdminSettings {
  darkMode: boolean;
  emailAlerts: boolean;
}

const SETTINGS_KEY = 'admin_settings';

@Component({
  standalone: true,
  selector: 'app-admin-settings',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="settings-page card">
      <div class="page-header">
        <div>
          <h1>Paramètres</h1>
          <p>Configurez vos préférences de compte et les notifications.</p>
        </div>
      </div>

      <div class="settings-panel">
        <div class="section">
          <h2>Préférences</h2>
          <div class="field">
            <label>
              <input type="checkbox" [(ngModel)]="settings.darkMode" /> Mode sombre
            </label>
          </div>
          <div class="field">
            <label>
              <input type="checkbox" [(ngModel)]="settings.emailAlerts" /> Alertes par email
            </label>
          </div>
        </div>

        <div class="section">
          <h2>Sécurité</h2>
          <p>Vous pouvez gérer ici vos préférences de sécurité et notifications.</p>
          <button class="btn btn-primary" type="button" (click)="save()">Enregistrer les préférences</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .settings-page {
      padding: 1.5rem;
    }

    .page-header {
      margin-bottom: 1.5rem;
    }

    .page-header h1 {
      margin: 0 0 0.5rem;
    }

    .settings-panel {
      display: grid;
      gap: 1.5rem;
      max-width: 720px;
    }

    .section {
      background: #ffffff;
      border-radius: 1rem;
      padding: 1.5rem;
      box-shadow: 0 10px 30px rgba(15, 23, 42, 0.05);
      display: grid;
      gap: 1rem;
    }

    .field {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      font-size: 1rem;
      color: #111827;
    }

    .btn {
      background: #2563eb;
      border: none;
      color: #ffffff;
      padding: 0.85rem 1.2rem;
      border-radius: 0.75rem;
      cursor: pointer;
      font-weight: 600;
    }
  `]
})
export class AdminSettingsComponent implements OnInit {
  private readonly notification = inject(NotificationService);

  settings: AdminSettings = {
    darkMode: false,
    emailAlerts: true
  };

  ngOnInit(): void {
    const stored = localStorage.getItem(SETTINGS_KEY);
    if (stored) {
      try {
        this.settings = JSON.parse(stored) as AdminSettings;
      } catch {
        this.settings = { darkMode: false, emailAlerts: true };
      }
    }
  }

  save(): void {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    this.notification.success('Préférences enregistrées');
  }
}
