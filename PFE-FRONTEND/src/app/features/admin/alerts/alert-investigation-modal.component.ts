import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MalwareAlert } from '../../../core/models/file.model';

@Component({
  standalone: true,
  selector: 'app-alert-investigation-modal',
  imports: [CommonModule],
  templateUrl: './alert-investigation-modal.component.html',
  styleUrls: ['./alert-investigation-modal.component.scss']
})
export class AlertInvestigationModalComponent {
  @Input() alert: MalwareAlert | null = null;
  @Input() tenantName = '';
  @Input() ownerName = '';
  @Input() busy = false;

  @Output() close = new EventEmitter<void>();
  @Output() download = new EventEmitter<void>();
  @Output() approve = new EventEmitter<void>();
  @Output() block = new EventEmitter<void>();
  @Output() deleteFile = new EventEmitter<void>();
  @Output() openVirusTotal = new EventEmitter<void>();

  get severityScore(): number {
    if (!this.alert) {
      return 0;
    }

    let score = 0;
    const quarantineStatus = String(this.alert.scanMetadata?.quarantineStatus || '').toLowerCase();

    if (this.alert.status === 'blocked') score += 45;
    if (quarantineStatus === 'quarantined') score += 25;
    if (this.alert.scanMetadata?.clamavResult?.isInfected) score += 20;
    if (this.alert.scanMetadata?.virustotalResult?.isInfected) score += 15;

    return Math.min(score, 100);
  }

  get severityTone(): 'critical' | 'high' | 'medium' | 'low' {
    const score = this.severityScore;
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  }

  get statusLabel(): string {
    if (!this.alert) return '-';
    if (String(this.alert.scanMetadata?.quarantineStatus || '').toLowerCase() === 'quarantined') return 'Quarantaine';
    if (this.alert.status === 'blocked') return 'Bloqué';
    if (this.alert.scanMetadata?.clamavResult?.isInfected || this.alert.scanMetadata?.virustotalResult?.isInfected) return 'Infecté';
    return 'Alerte';
  }

  get viruses(): string {
    const viruses = [
      ...(this.alert?.scanMetadata?.clamavResult?.viruses || []),
      ...(this.alert?.scanMetadata?.virustotalResult?.viruses || [])
    ];

    return [...new Set(viruses)].join(', ');
  }

  get investigationNotes(): string {
    return this.alert?.scanMetadata?.investigationNotes || this.alert?.investigationNotes || 'Aucune note d investigation enregistrée.';
  }

  get approvalInfo(): string {
    return this.alert?.scanMetadata?.whitelistReason || this.alert?.whitelistReason || 'Non approuvé';
  }

  get whitelistDate(): string {
    return this.alert?.scanMetadata?.whitelistDate || this.alert?.whitelistDate || '';
  }

  get fileHash(): string {
    return this.alert?.contentHash || 'Non calculé';
  }

  get downloadCount(): number {
    return Number(this.alert?.downloadCount || 0);
  }

  get maxDownloads(): string {
    return this.alert?.maxDownloads ? String(this.alert.maxDownloads) : 'Illimité';
  }

  formatDate(value?: string): string {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  formatBytes(bytes: number | undefined): string {
    const size = Number(bytes || 0);
    if (size <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const exponent = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
    const value = size / Math.pow(1024, exponent);
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[exponent]}`;
  }
}
