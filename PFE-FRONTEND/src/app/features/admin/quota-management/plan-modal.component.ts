import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Plan } from '../../../core/services/tenant-api.service';

@Component({
  standalone: true,
  selector: 'app-plan-modal',
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  template: `
    <div class="modal-overlay" *ngIf="isOpen" (click)="onBackdropClick()">
      <div class="modal-shell" (click)="$event.stopPropagation()">
        <header class="modal-header">
          <div>
            <span class="modal-eyebrow">Plan builder</span>
            <h2>{{ isEditMode ? 'Edit subscription plan' : 'Create subscription plan' }}</h2>
            <p>Shape tier capacity with enterprise-grade control.</p>
          </div>

          <button class="icon-button" type="button" (click)="close()" aria-label="Close modal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </header>

        <div class="modal-body">
          <aside class="plan-preview">
            <div class="preview-card">
              <span class="preview-label">Tier snapshot</span>
              <h3>{{ planForm.get('name')?.value || 'Untitled plan' }}</h3>
              <p>{{ planForm.get('slug')?.value || 'plan-slug' }}</p>
            </div>

            <div class="preview-metrics">
              <div>
                <span>Storage</span>
                <strong>{{ planForm.get('storageGb')?.value || 0 }} GB</strong>
              </div>
              <div>
                <span>Users</span>
                <strong>{{ planForm.get('maxUsers')?.value || 'Unlimited' }}</strong>
              </div>
              <div>
                <span>Files</span>
                <strong>{{ planForm.get('maxFiles')?.value || 'Unlimited' }}</strong>
              </div>
              <div>
                <span>Folders</span>
                <strong>{{ planForm.get('maxFolders')?.value || 'Unlimited' }}</strong>
              </div>
            </div>

            <div class="preview-note">
              <strong>Tip</strong>
              <p>Use 0 to expose unlimited capacity. Keep the slug stable once the plan is in use.</p>
            </div>
          </aside>

          <form class="plan-form" [formGroup]="planForm">
            <section class="form-section">
              <div class="section-title-row">
                <h4>Plan identity</h4>
                <span class="section-chip">Core</span>
              </div>

              <div class="field-grid single">
                <label class="field-group">
                  <span>Slug *</span>
                  <input
                    type="text"
                    id="slug"
                    formControlName="slug"
                    placeholder="ex: custom-plan"
                    class="form-control"
                    [disabled]="isEditMode"
                  />
                  <small>{{ isEditMode ? 'Locked for existing plans.' : 'Unique id with letters, numbers and hyphens.' }}</small>
                </label>

                <label class="field-group">
                  <span>Name *</span>
                  <input
                    type="text"
                    id="name"
                    formControlName="name"
                    placeholder="ex: Plan Premium"
                    class="form-control"
                  />
                </label>

                <label class="field-group">
                  <span>Description</span>
                  <textarea
                    id="description"
                    formControlName="description"
                    placeholder="Short description for the plan"
                    class="form-control"
                    rows="3"
                  ></textarea>
                </label>
              </div>
            </section>

            <section class="form-section">
              <div class="section-title-row">
                <h4>Tenant limits</h4>
                <span class="section-chip blue">Organization</span>
              </div>

              <div class="field-grid">
                <label class="field-group">
                  <span>Storage (GB)</span>
                  <input type="number" id="storageGb" formControlName="storageGb" class="form-control" min="0" placeholder="0 = unlimited" />
                </label>
                <label class="field-group">
                  <span>Max users</span>
                  <input type="number" id="maxUsers" formControlName="maxUsers" class="form-control" min="0" placeholder="0 = unlimited" />
                </label>
                <label class="field-group">
                  <span>Max files</span>
                  <input type="number" id="maxFiles" formControlName="maxFiles" class="form-control" min="0" placeholder="0 = unlimited" />
                </label>
                <label class="field-group">
                  <span>Max folders</span>
                  <input type="number" id="maxFolders" formControlName="maxFolders" class="form-control" min="0" placeholder="0 = unlimited" />
                </label>
              </div>
            </section>

            <section class="form-section">
              <div class="section-title-row">
                <h4>User limits</h4>
                <span class="section-chip green">Per user</span>
              </div>

              <div class="field-grid">
                <label class="field-group">
                  <span>User storage (GB)</span>
                  <input type="number" id="userStorageGb" formControlName="userStorageGb" class="form-control" min="0" placeholder="0 = unlimited" />
                </label>
                <label class="field-group">
                  <span>User max files</span>
                  <input type="number" id="userMaxFiles" formControlName="userMaxFiles" class="form-control" min="0" placeholder="0 = unlimited" />
                </label>
                <label class="field-group">
                  <span>Daily upload (GB)</span>
                  <input type="number" id="userDailyUploadGb" formControlName="userDailyUploadGb" class="form-control" min="0" step="0.1" placeholder="0 = unlimited" />
                </label>
                <label class="field-group">
                  <span>Sort order</span>
                  <input type="number" id="sortOrder" formControlName="sortOrder" class="form-control" min="1" placeholder="1" />
                </label>
              </div>
            </section>

            <section class="form-section inline">
              <label class="toggle-row">
                <input type="checkbox" formControlName="isActive" class="checkbox-input" />
                <span>
                  <strong>Plan active</strong>
                  <small>Inactive plans remain archived but cannot be selected.</small>
                </span>
              </label>
            </section>

            <div class="error-message" *ngIf="errorMessage">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M12 8v4m0 4v.01M21 12c0 4.418-3.582 8-8 8s-8-3.582-8-8 3.582-8 8-8 8 3.582 8 8z"/>
              </svg>
              {{ errorMessage }}
            </div>
          </form>
        </div>

        <footer class="modal-footer">
          <button class="btn secondary" type="button" (click)="close()" [disabled]="isSaving" title="Cancel">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
            <span>Cancel</span>
          </button>
          <button class="btn primary" type="button" (click)="save()" [disabled]="!planForm.valid || isSaving" [title]="isEditMode ? 'Save changes' : 'Create plan'">
            <svg *ngIf="!isSaving" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M5 13l4 4L19 7" />
            </svg>
            <span>{{ isSaving ? 'Saving...' : (isEditMode ? 'Save changes' : 'Create plan') }}</span>
          </button>
        </footer>
      </div>
    </div>
  `,
  styles: [`
    .modal-overlay {
      position: fixed !important;
      inset: 0;
      z-index: 1200;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: rgba(15, 23, 42, 0.62);
      backdrop-filter: blur(12px);
      animation: fadeIn 160ms ease-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .modal-shell {
      width: min(1120px, 100%);
      max-height: min(94vh, 920px);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      border-radius: 28px;
      background: rgba(255, 255, 255, 0.96);
      box-shadow: 0 40px 100px rgba(15, 23, 42, 0.34);
      animation: liftIn 220ms ease-out;
    }

    @keyframes liftIn {
      from { opacity: 0; transform: translateY(16px) scale(0.985); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }

    .modal-header {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: flex-start;
      padding: 24px 28px;
      color: #fff;
      background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
    }

    .modal-eyebrow {
      display: inline-flex;
      margin-bottom: 8px;
      padding: 6px 10px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.08);
      color: rgba(255, 255, 255, 0.72);
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }

    .modal-header h2 {
      margin: 0 0 8px;
      font-size: clamp(1.4rem, 2vw, 2rem);
      letter-spacing: -0.03em;
    }

    .modal-header p {
      margin: 0;
      color: rgba(255, 255, 255, 0.70);
      line-height: 1.6;
    }

    .icon-button {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border: 0;
      border-radius: 14px;
      background: rgba(255, 255, 255, 0.08);
      color: #fff;
      cursor: pointer;
      transition: transform 180ms ease, background 180ms ease;
    }

    .icon-button:hover {
      transform: translateY(-1px);
      background: rgba(255, 255, 255, 0.14);
    }

    .icon-button svg {
      width: 20px;
      height: 20px;
    }

    .modal-body {
      display: grid;
      grid-template-columns: 300px minmax(0, 1fr);
      gap: 20px;
      overflow: auto;
      padding: 24px 28px;
      background: linear-gradient(180deg, #f8fafc, #eef2ff);
    }

    .plan-preview,
    .plan-form {
      min-width: 0;
    }

    .plan-preview {
      display: grid;
      gap: 16px;
      align-content: start;
    }

    .preview-card,
    .preview-note,
    .form-section {
      border-radius: 24px;
      background: rgba(255, 255, 255, 0.96);
      border: 1px solid rgba(148, 163, 184, 0.18);
      box-shadow: 0 10px 24px rgba(15, 23, 42, 0.05);
    }

    .preview-card {
      padding: 22px;
      background: linear-gradient(135deg, rgba(37, 99, 235, 0.10), rgba(255, 255, 255, 0.98));
    }

    .preview-label,
    .section-chip {
      display: inline-flex;
      align-items: center;
      min-height: 30px;
      padding: 0 10px;
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 800;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      background: rgba(37, 99, 235, 0.10);
      color: #1d4ed8;
    }

    .section-chip.green {
      background: rgba(16, 185, 129, 0.12);
      color: #047857;
    }

    .section-chip.blue {
      background: rgba(37, 99, 235, 0.10);
      color: #1d4ed8;
    }

    .preview-card h3 {
      margin: 14px 0 6px;
      font-size: 1.35rem;
    }

    .preview-card p {
      margin: 0;
      color: #64748b;
      font-weight: 700;
    }

    .preview-metrics {
      display: grid;
      gap: 12px;
    }

    .preview-metrics div {
      padding: 16px;
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.92);
      border: 1px solid rgba(148, 163, 184, 0.14);
    }

    .preview-metrics span {
      display: block;
      color: #64748b;
      font-size: 0.72rem;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 800;
    }

    .preview-metrics strong {
      display: block;
      margin-top: 6px;
      font-size: 1.02rem;
    }

    .preview-note {
      padding: 18px 20px;
      background: rgba(15, 23, 42, 0.96);
      color: #fff;
    }

    .preview-note strong {
      display: block;
      margin-bottom: 8px;
    }

    .preview-note p {
      margin: 0;
      color: rgba(255, 255, 255, 0.72);
      line-height: 1.65;
    }

    .plan-form {
      display: grid;
      gap: 16px;
      align-content: start;
    }

    .form-section {
      padding: 20px;
    }

    .form-section.inline {
      padding: 16px 20px;
    }

    .section-title-row {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      margin-bottom: 14px;
    }

    .section-title-row h4 {
      margin: 0;
      font-size: 1rem;
      letter-spacing: -0.02em;
    }

    .field-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
    }

    .field-grid.single {
      grid-template-columns: 1fr;
    }

    .field-group {
      display: grid;
      gap: 8px;
    }

    .field-group > span {
      font-size: 0.84rem;
      color: #334155;
      font-weight: 700;
    }

    .form-control {
      width: 100%;
      min-height: 48px;
      padding: 0 14px;
      border: 1px solid rgba(148, 163, 184, 0.24);
      border-radius: 16px;
      background: #fff;
      outline: none;
      font: inherit;
      transition: border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease;
    }

    .form-control:focus {
      border-color: rgba(37, 99, 235, 0.34);
      box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.08);
    }

    .form-control:disabled {
      background: rgba(241, 245, 249, 0.88);
      color: #94a3b8;
    }

    textarea.form-control {
      min-height: 110px;
      padding: 14px;
      resize: vertical;
    }

    .field-group small {
      color: #64748b;
      line-height: 1.5;
    }

    .toggle-row {
      display: flex;
      align-items: center;
      gap: 14px;
      cursor: pointer;
    }

    .toggle-row strong {
      display: block;
      margin-bottom: 2px;
    }

    .toggle-row small {
      display: block;
      color: #64748b;
    }

    .checkbox-input {
      width: 18px;
      height: 18px;
      accent-color: #2563eb;
    }

    .error-message {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 16px;
      border-radius: 18px;
      background: rgba(239, 68, 68, 0.10);
      border: 1px solid rgba(239, 68, 68, 0.16);
      color: #b91c1c;
      font-weight: 600;
    }

    .error-message svg {
      width: 20px;
      height: 20px;
      flex-shrink: 0;
    }

    .modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 12px;
      padding: 20px 28px 24px;
      background: rgba(255, 255, 255, 0.96);
      border-top: 1px solid rgba(148, 163, 184, 0.16);
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      min-height: 48px;
      padding: 0 18px;
      border: 0;
      border-radius: 16px;
      font: inherit;
      font-weight: 800;
      cursor: pointer;
      transition: transform 180ms ease, box-shadow 180ms ease, background 180ms ease, opacity 180ms ease;
    }

    .btn.primary {
      background: linear-gradient(135deg, #2563eb, #1d4ed8);
      color: #fff;
      box-shadow: 0 14px 30px rgba(37, 99, 235, 0.24);
    }

    .btn svg {
      width: 18px;
      height: 18px;
      stroke-width: 2;
    }

    .btn.secondary {
      background: #fff;
      color: #0f172a;
      border: 1px solid rgba(148, 163, 184, 0.26);
    }

    .btn:hover:not(:disabled) {
      transform: translateY(-1px);
    }

    .btn:disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }

    @media (max-width: 980px) {
      .modal-body {
        grid-template-columns: 1fr;
      }

      .field-grid {
        grid-template-columns: 1fr;
      }

      .modal-footer {
        justify-content: stretch;
      }

      .modal-footer .btn {
        flex: 1;
      }
    }

    @media (max-width: 640px) {
      .modal-overlay {
        padding: 10px;
      }

      .modal-header,
      .modal-body,
      .modal-footer {
        padding-left: 18px;
        padding-right: 18px;
      }
    }
  `]
})
export class PlanModalComponent implements OnInit, OnChanges {
  @Input() isOpen = false;
  @Input() plan: Plan | null = null;
  @Output() close$ = new EventEmitter<void>();
  @Output() save$ = new EventEmitter<Partial<Plan>>();

  private readonly fb = inject(FormBuilder);

  isEditMode = false;
  isSaving = false;
  errorMessage = '';

  planForm = this.fb.nonNullable.group({
    slug: [''],
    name: [''],
    description: [''],
    storageGb: [0],
    maxUsers: [0],
    maxFiles: [0],
    maxFolders: [0],
    userStorageGb: [0],
    userMaxFiles: [0],
    userDailyUploadGb: [0],
    sortOrder: [1],
    isActive: [true]
  });

  ngOnInit(): void {
    this.updateForm();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['plan'] || changes['isOpen']) {
      this.updateForm();
    }
  }

  private updateForm(): void {
    this.isEditMode = !!this.plan;
    this.errorMessage = '';

    if (this.plan) {
      const storageGb = this.plan.storageBytes ? this.plan.storageBytes / (1024 * 1024 * 1024) : 0;
      const userStorageGb = this.plan.userStorageBytes ? this.plan.userStorageBytes / (1024 * 1024 * 1024) : 0;
      const userDailyUploadGb = this.plan.userDailyUploadBytes ? this.plan.userDailyUploadBytes / (1024 * 1024 * 1024) : 0;

      this.planForm.patchValue({
        slug: this.plan.slug,
        name: this.plan.name,
        description: this.plan.description || '',
        storageGb: storageGb,
        maxUsers: this.plan.maxUsers || 0,
        maxFiles: this.plan.maxFiles || 0,
        maxFolders: this.plan.maxFolders || 0,
        userStorageGb: userStorageGb,
        userMaxFiles: this.plan.userMaxFiles || 0,
        userDailyUploadGb: userDailyUploadGb,
        sortOrder: this.plan.sortOrder || 1,
        isActive: this.plan.isActive !== false
      });
    } else {
      this.planForm.reset({ isActive: true, sortOrder: 1, storageGb: 0, maxUsers: 0, maxFiles: 0, maxFolders: 0, userStorageGb: 0, userMaxFiles: 0, userDailyUploadGb: 0 });
    }
  }

  save(): void {
    if (!this.planForm.valid) {
      this.errorMessage = 'Veuillez remplir tous les champs requis';
      return;
    }

    this.isSaving = true;
    const value = this.planForm.getRawValue();

    const toBytes = (gb: number): number | null => {
      if (gb === null || gb === undefined || gb <= 0) {
        return null;
      }
      return gb * 1024 * 1024 * 1024;
    };

    const payload: Partial<Plan> = {
      slug: value.slug,
      name: value.name,
      description: value.description || undefined,
      storageBytes: toBytes(value.storageGb),
      maxUsers: value.maxUsers || null,
      maxFiles: value.maxFiles || null,
      maxFolders: value.maxFolders || null,
      userStorageBytes: toBytes(value.userStorageGb),
      userMaxFiles: value.userMaxFiles || null,
      userDailyUploadBytes: toBytes(value.userDailyUploadGb),
      sortOrder: value.sortOrder,
      isActive: value.isActive
    };

    this.save$.emit(payload);
    this.isSaving = false;
  }

  close(): void {
    this.close$.emit();
  }

  onBackdropClick(): void {
    this.close();
  }
}
