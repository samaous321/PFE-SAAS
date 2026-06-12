import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpEventType, HttpUploadProgressEvent } from '@angular/common/http';
import { NgChartsModule } from 'ng2-charts';
import { Chart, ChartConfiguration, ChartOptions, registerables } from 'chart.js';
import { AuthStorageService } from '../../../core/services/auth-storage.service';
import { FileApiService } from '../../../core/services/file-api.service';
import { UserApiService, UserQuotaSummary } from '../../../core/services/user-api.service';
import { FileExtensionService } from '../../../core/services/file-extension.service';
import { SecureFile, Folder } from '../../../core/models/file.model';
import { FolderTreeComponent } from '../folder-tree/folder-tree.component';
import { SearchComponent } from '../search/search.component';

Chart.register(...registerables);

interface TenantUser {
  _id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

interface SharedFile {
  linkId: string;
  fileId: string;
  file: SecureFile;
  sharedBy?: TenantUser;
  recipient?: TenantUser;
  recipientUsers?: string[];
  recipientEmail?: string;
  accessControl: string;
  createdAt?: string;
  expiresAt: string;
  usedCount?: number;
  maxUses?: number;
  shareSubject?: string;
  shareDescription?: string;
  shareUrl?: string | null;
  scanStatus?: 'idle' | 'scanning' | 'done';
  scanError?: string;
}

interface SenderFilterOption {
  id: string;
  label: string;
}

interface SpaceFilterOption {
  id: string;
  label: string;
}

interface ScanResult {
  fileId: string;
  shareToken?: string;
  originalName: string;
  mimeType?: string;
  size?: number;
  fileHash?: string;
  isInfected: boolean;
  warning?: string;
  virustotalUrl?: string;
  clamavResult?: {
    isInfected: boolean;
    viruses: string[];
    engine: string;
    warning?: string;
  };
  virustotalResult?: {
    isInfected: boolean;
    detectionRatio?: string;
    stats?: Record<string, unknown>;
    warning?: string;
  };
  scanDate: string;
}

interface ScanResultDownloadTarget {
  token: string;
  fileName: string;
}

interface PublicShareResult {
  shareUrl: string;
  copied: boolean;
}

interface FileDraft extends SecureFile {
  _id: string;
  originalName: string;
}

interface FileStats {
  totalFiles: number;
  totalSize: number;
  recentUploads: number;
  sharedFiles: number;
  downloadsCount: number;
  storageUsedPercent: number;
  storageLimit: number;
  quotaPlan: 'small' | 'standard' | 'large' | 'unlimited';
  quotaScope: 'user' | 'tenant';
}

@Component({
  standalone: true,
  selector: 'app-file-workspace',
  imports: [CommonModule, ReactiveFormsModule, NgChartsModule, FolderTreeComponent, SearchComponent],
  templateUrl: './file-workspace.component.html',
  styleUrls: ['./file-workspace.component.scss'],})
export class FileWorkspaceComponent implements OnInit {
  private readonly fileApi = inject(FileApiService);
  private readonly authStorage = inject(AuthStorageService);
  private readonly fb = inject(FormBuilder);
  private readonly fileExtensionService = inject(FileExtensionService);

  files: SecureFile[] = [];
  sharedWithMe: SharedFile[] = [];
  hiddenSharedWithMe: SharedFile[] = [];
  sharedByMe: SharedFile[] = [];
  tenantUsers: TenantUser[] = [];
  sharedWithMeSenderId = '';
  sharedWithMeSenderOptions: SenderFilterOption[] = [];
  userFolders: Folder[] = [];
  selectedFolderId: string | null = null;
  currentFolderId: string | null = null;
  selectedSpaceFilter = '';
  newSpaceName = '';
  creatingSpace = false;
  updatingSpace = false;
  deletingSpace = false;
  selectedSpaceActionId = '';
  updatingFileSpaceId: string | null = null;
  searchQuery = '';
  draggedFileId: string | null = null;
  spaceCounts: Record<string, number> = {};
  unassignedSpaceCount = 0;
  totalOwnedFilesCount = 0;
  filesPage = 1;
  filesPageSize = 8;
  filesSortBy: 'date_desc' | 'date_asc' | 'name_asc' | 'name_desc' | 'size_desc' | 'size_asc' | 'folder_asc' | 'folder_desc' = 'date_desc';
  sharedPage = 1;
  sharedPageSize = 6;
  sharedSortBy: 'date_desc' | 'date_asc' | 'name_asc' | 'name_desc' | 'sender_asc' | 'sender_desc' = 'date_desc';
  sharedByMePage = 1;
  sharedByMePageSize = 6;
  sharedByMeSortBy: 'date_desc' | 'date_asc' | 'name_asc' | 'name_desc' = 'date_desc';
  trashPage = 1;
  trashPageSize = 6;
  trashSortBy: 'date_desc' | 'date_asc' | 'name_asc' | 'name_desc' = 'date_desc';

  loading = true;
  busy = false;
  error = '';
  success = '';
  uploadProgress = 0;
  uploadStage: 'idle' | 'uploading' | 'scanning' | 'completed' | 'error' = 'idle';
  uploadMessage = '';
  showUploadProgress = false;
  selectedFile: File | null = null;
  activeTab: 'files' | 'shared-with-me' | 'shared-by-me' | 'trash' = 'files';
  showFolders = true; // ContrÃ´le l'affichage de la hiÃ©rarchie des dossiers
  showAdvancedFilters = false; // masquÃ© par dÃ©faut pour allÃ©ger l'interface
  showShareModal = false;
  publicShareResult: PublicShareResult | null = null;
  selectedFileForShare: SecureFile | null = null;
  recipientSearch = '';
  showFileSettingsModal = false;
  editingFile: SecureFile | null = null;
  scanResult: ScanResult | null = null;
  scanResultDownloadTarget: ScanResultDownloadTarget | null = null;
  // PropriÃ©tÃ©s pour le chargement paresseux des onglets
  private sharedDataLoaded = false;
  private trashDataLoaded = false;
  private optimisticFiles: SecureFile[] = [];
  quotaSummary: UserQuotaSummary | null = null;
  stats: FileStats = {
    totalFiles: 0,
    totalSize: 0,
    recentUploads: 0,
    sharedFiles: 0,
    downloadsCount: 0,
    storageUsedPercent: 0,
    storageLimit: 0,
    quotaPlan: 'small',
    quotaScope: 'tenant'
  };

  shareForm = this.fb.nonNullable.group({
    fileId: ['', [Validators.required]],
    shareMode: ['link' as 'link' | 'direct'],
    expiresInHours: [24, [Validators.required]],
    maxUses: [1, [Validators.required]],
    recipientUserIds: [[] as string[]],
    recipientEmail: [''],
    shareSubject: [''],
    shareDescription: ['']
  });

  private readonly userApi = inject(UserApiService);

  fileSettingsForm = this.fb.nonNullable.group({
    description: [''],
    expirationDate: [''],
    maxDownloads: [10, [Validators.required]],
    status: ['active' as 'active' | 'expired' | 'blocked'],
    allowedIPsText: ['']
  });

  ngOnInit(): void {
    this.loadPersistedState();
    this.loadFolders();
    this.loadFiles();
    this.loadSharedFiles();
    this.sharedDataLoaded = true;
    this.trashDataLoaded = true;
    this.loadTenantUsers();
    this.loadQuotaSummary();
  }

  get quotaPercent(): number {
    const percent = this.quotaSummary?.user?.storageUsedPercent ?? this.stats.storageUsedPercent ?? 0;
    return Number.isFinite(percent) ? Math.min(Math.max(percent, 0), 100) : 0;
  }

  get quotaAlertLevel(): 'success' | 'warning' | 'danger' {
    if (this.quotaPercent >= 100) return 'danger';
    if (this.quotaPercent >= 90) return 'warning';
    if (this.quotaPercent >= 80) return 'warning';
    return 'success';
  }

  get quotaAlertMessage(): string {
    if (!this.quotaSummary) {
      return 'Chargement du quota...';
    }

    if (this.quotaPercent >= 100) {
      return 'Quota atteint : nouvel upload bloquÃ© tant que vous n\'avez pas libÃ©rÃ© de l\'espace ou changÃ© de plan.';
    }

    if (this.quotaPercent >= 90) {
      return 'Attention : vous Ãªtes proche de la limite. PrÃ©parez un nettoyage ou une montÃ©e de plan.';
    }

    if (this.quotaPercent >= 80) {
      return 'Alerte quota : l\'espace consommÃ© commence Ã  Ãªtre Ã©levÃ©.';
    }

    return 'Quota confortable : vous pouvez continuer vos uploads normalement.';
  }

  get isAdmin(): boolean {
    return this.authStorage.isAnyAdmin();
  }

  get displayName(): string {
    const session = this.authStorage.getSession();
    if (!session) {
      return '';
    }

    const fullName = `${session.firstName ?? ''} ${session.lastName ?? ''}`.trim();
    if (fullName) {
      return fullName;
    }

    if (session.email) {
      return session.email.split('@')[0];
    }

    return 'Utilisateur';
  }

  get welcomeTitle(): string {
    const hour = new Date().getHours();
    const greeting = hour >= 18 ? 'Bonsoir' : 'Bonjour';
    return `${greeting}, ${this.displayName}`;
  }

  get welcomeSubtitle(): string {
    return this.isAdmin
      ? 'Ravi de vous revoir. Votre espace d\'administration est pret.'
      : 'Ravi de vous revoir. Votre espace secure est pret.';
  }

  get displayedFiles(): SecureFile[] {
    let files = this.files;

    // Filter by selected folder
    if (this.selectedFolderId !== null) {
      files = files.filter((file) => {
        if (!file.ownerSpaceId) return false;
        const spaceId = typeof file.ownerSpaceId === 'string' ? file.ownerSpaceId : file.ownerSpaceId._id;
        return spaceId === this.selectedFolderId;
      });
    }

    // Apply search filter
    const query = this.searchQuery.trim().toLowerCase();
    if (!query) {
      return files;
    }

    return files.filter((file) => {
      const name = String(file.originalName || '').toLowerCase();
      const spaceName = this.getSpaceName(file).toLowerCase();
      return name.includes(query) || spaceName.includes(query);
    });
  }

  get displayedSharedWithMe(): SharedFile[] {
    const query = this.searchQuery.trim().toLowerCase();
    if (!query) {
      return this.sharedWithMe;
    }

    return this.sharedWithMe.filter((item) => {
      const fileName = String(item?.file?.originalName || '').toLowerCase();
      const senderName = `${item?.sharedBy?.firstName || ''} ${item?.sharedBy?.lastName || ''}`.trim().toLowerCase();
      const senderEmail = String(item?.sharedBy?.email || '').toLowerCase();
      return fileName.includes(query) || senderName.includes(query) || senderEmail.includes(query);
    });
  }

  get displayedHiddenSharedWithMe(): SharedFile[] {
    const query = this.searchQuery.trim().toLowerCase();
    if (!query) {
      return this.hiddenSharedWithMe;
    }

    return this.hiddenSharedWithMe.filter((item) => {
      const fileName = String(item?.file?.originalName || '').toLowerCase();
      const senderName = `${item?.sharedBy?.firstName || ''} ${item?.sharedBy?.lastName || ''}`.trim().toLowerCase();
      const senderEmail = String(item?.sharedBy?.email || '').toLowerCase();
      return fileName.includes(query) || senderName.includes(query) || senderEmail.includes(query);
    });
  }

  get currentFolder(): Folder | null {
    return this.userFolders.find((folder) => folder._id === this.selectedFolderId) || null;
  }

  get currentFolderChildren(): Folder[] {
    return this.userFolders.filter((folder) => folder.parentId == this.selectedFolderId);
  }

  get currentFolderPath(): Folder[] {
    const path: Folder[] = [];
    let folder = this.currentFolder;

    while (folder) {
      path.unshift(folder);
      folder = folder.parentId != null ? this.userFolders.find((item) => item._id === folder?.parentId) || null : null;
    }

    return path;
  }

  get sortedDisplayedFiles(): SecureFile[] {
    const list = [...this.displayedFiles];

    switch (this.filesSortBy) {
      case 'date_asc':
        return list.sort((a, b) => this.getDateValue(a.createdAt) - this.getDateValue(b.createdAt));
      case 'name_asc':
        return list.sort((a, b) => this.compareText(a.originalName, b.originalName));
      case 'name_desc':
        return list.sort((a, b) => this.compareText(b.originalName, a.originalName));
      case 'folder_asc':
        return list.sort((a, b) => this.compareText(this.getSpaceName(a), this.getSpaceName(b)));
      case 'folder_desc':
        return list.sort((a, b) => this.compareText(this.getSpaceName(b), this.getSpaceName(a)));
      case 'size_desc':
        return list.sort((a, b) => (b.size || 0) - (a.size || 0));
      case 'size_asc':
        return list.sort((a, b) => (a.size || 0) - (b.size || 0));
      case 'date_desc':
      default:
        return list.sort((a, b) => this.getDateValue(b.createdAt) - this.getDateValue(a.createdAt));
    }
  }

  get pagedDisplayedFiles(): SecureFile[] {
    const start = (this.filesPage - 1) * this.filesPageSize;
    return this.sortedDisplayedFiles.slice(start, start + this.filesPageSize);
  }

  get filesTotalPages(): number {
    return Math.max(1, Math.ceil(this.sortedDisplayedFiles.length / this.filesPageSize));
  }

  get sortedDisplayedSharedWithMe(): SharedFile[] {
    const list = [...this.displayedSharedWithMe];

    switch (this.sharedSortBy) {
      case 'date_asc':
        return list.sort((a, b) => this.getDateValue(a.createdAt) - this.getDateValue(b.createdAt));
      case 'name_asc':
        return list.sort((a, b) => this.compareText(a?.file?.originalName, b?.file?.originalName));
      case 'name_desc':
        return list.sort((a, b) => this.compareText(b?.file?.originalName, a?.file?.originalName));
      case 'sender_asc':
        return list.sort((a, b) => this.compareText(this.getSenderLabel(a), this.getSenderLabel(b)));
      case 'sender_desc':
        return list.sort((a, b) => this.compareText(this.getSenderLabel(b), this.getSenderLabel(a)));
      case 'date_desc':
      default:
        return list.sort((a, b) => this.getDateValue(b.createdAt) - this.getDateValue(a.createdAt));
    }
  }

  get pagedDisplayedSharedWithMe(): SharedFile[] {
    const start = (this.sharedPage - 1) * this.sharedPageSize;
    return this.sortedDisplayedSharedWithMe.slice(start, start + this.sharedPageSize);
  }

  get sharedTotalPages(): number {
    return Math.max(1, Math.ceil(this.sortedDisplayedSharedWithMe.length / this.sharedPageSize));
  }

  get sortedDisplayedHiddenSharedWithMe(): SharedFile[] {
    const list = [...this.displayedHiddenSharedWithMe];

    switch (this.trashSortBy) {
      case 'date_asc':
        return list.sort((a, b) => this.getDateValue(a.createdAt) - this.getDateValue(b.createdAt));
      case 'name_asc':
        return list.sort((a, b) => this.compareText(a?.file?.originalName, b?.file?.originalName));
      case 'name_desc':
        return list.sort((a, b) => this.compareText(b?.file?.originalName, a?.file?.originalName));
      case 'date_desc':
      default:
        return list.sort((a, b) => this.getDateValue(b.createdAt) - this.getDateValue(a.createdAt));
    }
  }

  get pagedDisplayedHiddenSharedWithMe(): SharedFile[] {
    const start = (this.trashPage - 1) * this.trashPageSize;
    return this.sortedDisplayedHiddenSharedWithMe.slice(start, start + this.trashPageSize);
  }

  get trashTotalPages(): number {
    return Math.max(1, Math.ceil(this.sortedDisplayedHiddenSharedWithMe.length / this.trashPageSize));
  }

  private loadFiles(): void {
    this.loading = true;
    this.error = '';

    const request = this.isAdmin
      ? this.fileApi.getTenantFiles()
     : this.fileApi.getMyFiles({
         spaceId: this.selectedSpaceFilter || undefined
       });

    request.subscribe({
      next: (files) => {
        this.files = this.mergeWithOptimisticFiles(files);
        this.filesPage = 1;
        this.refreshSpaceCounters();
        this.loadStats();
        this.loading = false;
      },
      error: (response) => {
        this.error = response?.error?.error ?? 'Impossible de charger les fichiers';
        this.loading = false;
      }
    });
  }

  private refreshSpaceCounters(): void {
    if (this.isAdmin) {
      this.spaceCounts = {};
      this.unassignedSpaceCount = 0;
      this.totalOwnedFilesCount = 0;
      return;
    }

    this.fileApi.getMyFiles().subscribe({
      next: (allFiles) => {
        const counts: Record<string, number> = {};
        let unassigned = 0;
        const folderMap = new Map<string, Folder>();
        const ancestorCache = new Map<string, string[]>();

        for (const folder of this.userFolders) {
          folderMap.set(folder._id, folder);
        }

        const getFolderAncestors = (folderId: string): string[] => {
          if (ancestorCache.has(folderId)) {
            return ancestorCache.get(folderId)!;
          }

          const ancestors: string[] = [];
          let current = folderMap.get(folderId);

          while (current && current.parentId) {
            ancestors.push(current.parentId);
            current = folderMap.get(current.parentId);
          }

          ancestorCache.set(folderId, ancestors);
          return ancestors;
        };

        for (const file of allFiles || []) {
          const spaceId = this.getOwnerSpaceId(file);
          if (!spaceId) {
            unassigned += 1;
            continue;
          }

          const relatedFolders = [spaceId, ...getFolderAncestors(spaceId)];
          for (const folderId of relatedFolders) {
            counts[folderId] = (counts[folderId] || 0) + 1;
          }
        }

        this.spaceCounts = counts;
        this.unassignedSpaceCount = unassigned;
        this.totalOwnedFilesCount = (allFiles || []).length;
      },
      error: () => {
        this.spaceCounts = {};
        this.unassignedSpaceCount = 0;
        this.totalOwnedFilesCount = this.files.length;
      }
    });
  }

  private loadSharedFiles(): void {
    this.fileApi.getFilesSharedWithMe({
      senderId: this.sharedWithMeSenderId || undefined
    }).subscribe({
      next: (files: SharedFile[]) => {
        this.sharedWithMe = files;
        this.sharedPage = 1;
        this.refreshSharedWithMeSenderOptions(files);
        this.loadStats();
      },
      error: () => {
        this.sharedWithMe = [];
        this.refreshSharedWithMeSenderOptions([]);
        this.loadStats();
      }
    });

    this.fileApi.getFilesSharedByMe().subscribe({
      next: (files: SharedFile[]) => {
        this.sharedByMe = files;
        this.loadStats();
      },
      error: () => {
        this.sharedByMe = [];
        this.loadStats();
      }
    });

    this.fileApi.getFilesSharedWithMe({ hiddenScope: 'hidden' }).subscribe({
      next: (files: SharedFile[]) => {
        this.hiddenSharedWithMe = files;
        this.trashPage = 1;
      },
      error: () => {
        this.hiddenSharedWithMe = [];
      }
    });
  }

  private loadTrashFiles(): void {
    // Trash files are already loaded in loadSharedFiles as hiddenSharedWithMe
    // This method is called when switching to trash tab for lazy loading
    this.trashPage = 1;
  }

  private loadFolders(): void {
    if (this.isAdmin) {
      this.userFolders = [];
      return;
    }

    this.fileApi.getUserFolders().subscribe({
      next: (folders) => {
        this.userFolders = folders || [];
        this.refreshSpaceCounters();
      },
      error: () => {
        this.userFolders = [];
      }
    });
  }

  createFolder(): void {
    const name = this.newSpaceName.trim();
    if (!name) {
      this.error = 'Le nom du dossier est obligatoire';
      return;
    }

    this.creatingSpace = true;
    this.error = '';
    this.success = '';

    this.fileApi.createUserFolder({ name }).subscribe({
      next: (folder) => {
        this.userFolders = [...this.userFolders, folder].sort((a, b) => (a.position || 0) - (b.position || 0));
        this.selectedSpaceActionId = folder._id;
        this.newSpaceName = '';
        this.success = 'Dossier créé avec succès';
        this.creatingSpace = false;
        this.refreshSpaceCounters();
      },
      error: (response: any) => {
        this.error = response?.error?.error ?? 'Impossible de créer le dossier';
        this.creatingSpace = false;
      }
    });
  }

  renameSelectedSpace(): void {
    if (!this.selectedSpaceActionId) {
      this.error = 'Sélectionne un dossier à renommer';
      return;
    }

    const current = this.userFolders.find((folder) => folder._id === this.selectedSpaceActionId);
    if (!current) {
      this.error = 'Dossier introuvable';
      return;
    }

    const nextName = window.prompt('Nouveau nom du dossier', current.name);
    if (!nextName) {
      return;
    }

    this.updatingSpace = true;
    this.error = '';
    this.success = '';

    this.fileApi.updateUserFolder(current._id, { name: nextName }).subscribe({
      next: (updated) => {
        this.userFolders = this.userFolders.map((folder) =>
          folder._id === updated._id ? updated : folder
        );
        this.success = 'Dossier renommÃ©';
        this.updatingSpace = false;
      },
      error: (response: any) => {
        this.error = response?.error?.error ?? 'Impossible de renommer ce dossier';
        this.updatingSpace = false;
      }
    });
  }

  deleteSelectedSpace(): void {
    if (!this.selectedSpaceActionId) {
      this.error = 'Sélectionne un dossier à supprimer';
      return;
    }

    const current = this.userFolders.find((folder) => folder._id === this.selectedSpaceActionId);
    if (!current) {
      this.error = 'Dossier introuvable';
      return;
    }

    const confirmed = window.confirm(`Supprimer le dossier "${current.name}" ? Les fichiers reviendront en "Sans dossier".`);
    if (!confirmed) {
      return;
    }

    this.deletingSpace = true;
    this.error = '';
    this.success = '';

    this.fileApi.deleteUserFolder(current._id).subscribe({
      next: () => {
        this.userFolders = this.userFolders.filter((folder) => folder._id !== current._id);
        if (this.selectedSpaceFilter === current._id) {
          this.selectedSpaceFilter = '';
        }
        if (this.selectedSpaceActionId === current._id) {
          this.selectedSpaceActionId = '';
        }
        this.success = 'Dossier supprimé';
        this.deletingSpace = false;
        this.loadFiles();
        this.refreshSpaceCounters();
      },
      error: (response: any) => {
        this.error = response?.error?.error ?? 'Impossible de supprimer ce dossier';
        this.deletingSpace = false;
      }
    });
  }

  onSpaceFilterChange(event: Event): void {
    this.selectedSpaceFilter = String((event.target as HTMLSelectElement).value || '');
    this.filesPage = 1;
    this.loadFiles();
    this.saveState();
  }

  clearSpaceFilter(): void {
    this.selectedSpaceFilter = '';
    this.filesPage = 1;
    this.loadFiles();
    this.saveState();
  }

  moveFileToSpace(file: SecureFile, event: Event): void {
    const nextSpaceId = String((event.target as HTMLSelectElement).value || '');
    const payloadSpaceId = nextSpaceId || null;

    this.updatingFileSpaceId = file._id;
    this.error = '';

    this.fileApi.assignFileToSpace(file._id, payloadSpaceId).subscribe({
      next: (updatedFile) => {
        this.files = this.files.map((current) => current._id === file._id ? updatedFile : current);
        this.optimisticFiles = this.optimisticFiles.map((current) => current._id === file._id ? updatedFile : current);
        this.success = 'Fichier déplacé';
        this.updatingFileSpaceId = null;
        this.refreshSpaceCounters();

        if (this.selectedSpaceFilter && payloadSpaceId !== this.selectedSpaceFilter) {
          this.loadFiles();
        }
      },
      error: (response: any) => {
        this.error = response?.error?.error ?? 'Impossible de dÃ©placer ce fichier';
        this.updatingFileSpaceId = null;
        this.loadFiles();
      }
    });
  }

  onFileDragStart(file: SecureFile): void {
    this.draggedFileId = file._id;
  }

  onFileDragEnd(): void {
    this.draggedFileId = null;
  }

  onSpaceDragOver(event: DragEvent): void {
    event.preventDefault();
  }

  onSpaceDrop(spaceId: string, event: DragEvent): void {
    event.preventDefault();

    if (!this.draggedFileId) {
      return;
    }

    const file = this.files.find((item) => item._id === this.draggedFileId);
    this.draggedFileId = null;

    if (!file) {
      return;
    }

    const currentSpaceId = this.getOwnerSpaceId(file);
    if (currentSpaceId === spaceId) {
      return;
    }

    this.updatingFileSpaceId = file._id;
    this.error = '';

    this.fileApi.assignFileToSpace(file._id, spaceId || null).subscribe({
      next: (updatedFile) => {
        this.files = this.files.map((current) => current._id === file._id ? updatedFile : current);
        this.optimisticFiles = this.optimisticFiles.map((current) => current._id === file._id ? updatedFile : current);
        this.success = 'Fichier déplacé par glisser-déposer';
        this.updatingFileSpaceId = null;
        this.refreshSpaceCounters();

        if (this.selectedSpaceFilter && spaceId !== this.selectedSpaceFilter) {
          this.loadFiles();
        }
      },
      error: (response: any) => {
        this.error = response?.error?.error ?? 'Impossible de dÃ©placer ce fichier';
        this.updatingFileSpaceId = null;
        this.loadFiles();
      }
    });
  }

  onSharedWithMeSenderChange(event: Event): void {
    this.sharedWithMeSenderId = String((event.target as HTMLSelectElement).value || '');
    this.sharedPage = 1;
    this.loadSharedFiles();
  }

  resetSharedWithMeFilters(): void {
    this.sharedWithMeSenderId = '';
    this.sharedPage = 1;
    this.loadSharedFiles();
  }

  private loadTenantUsers(): void {
    this.fileApi.getTenantUsers().subscribe({
      next: (users) => {
        const currentTenantId = this.authStorage.getSession()?.tenantId;
        const currentUserId = this.authStorage.getUserId();
        this.tenantUsers = users.filter(u => u._id !== currentUserId && (!currentTenantId || u.tenantId === currentTenantId));
      },
      error: () => {
        this.tenantUsers = [];
      }
    });
  }

  onFilePicked(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0) ?? null;
    this.selectedFile = file;
  }

  private checkQuotaBeforeUpload(fileSize: number): { allowed: boolean; warning: boolean; message: string } {
    if (!this.quotaSummary) {
      return { allowed: true, warning: false, message: '' }; // Allow upload if quota not loaded yet
    }

    const userQuota = this.quotaSummary.user;
    const tenantQuota = this.quotaSummary.tenant;
    const userStorageUsed = userQuota.storageUsedBytes || 0;
    const userStorageLimit = userQuota.storageLimitBytes;
    const tenantStorageUsed = tenantQuota.storageUsedBytes || 0;
    const tenantStorageLimit = tenantQuota.storageLimitBytes;

    // Check if quota is unlimited for both user and tenant
    const isUserUnlimited = !userStorageLimit || userStorageLimit === 0;
    const isTenantUnlimited = !tenantStorageLimit || tenantStorageLimit === 0;

    if (isUserUnlimited && isTenantUnlimited) {
      return { allowed: true, warning: false, message: '' };
    }

    const userNewStorageUsed = userStorageUsed + fileSize;
    const tenantNewStorageUsed = tenantStorageUsed + fileSize;

    const tenantLimitActive = !isTenantUnlimited;
    const userLimitActive = !isUserUnlimited;

    if (tenantLimitActive) {
      if (tenantStorageUsed >= tenantStorageLimit) {
        const usedGb = (tenantStorageUsed / (1024 * 1024 * 1024)).toFixed(2);
        const limitGb = (tenantStorageLimit / (1024 * 1024 * 1024)).toFixed(2);
        return {
          allowed: false,
          warning: false,
          message: `⛔ Quota tenant atteint ! Le tenant a utilisé ${usedGb} GB sur ${limitGb} GB. Libérez de l'espace ou passez à un plan supérieur.`
        };
      }

      if (tenantNewStorageUsed > tenantStorageLimit) {
        const fileGb = (fileSize / (1024 * 1024 * 1024)).toFixed(2);
        const availableGb = ((tenantStorageLimit - tenantStorageUsed) / (1024 * 1024 * 1024)).toFixed(2);
        return {
          allowed: false,
          warning: false,
          message: `⛔ Ce fichier (${fileGb} GB) dépasse l'espace disponible du tenant (${availableGb} GB). Libérez de l'espace pour continuer.`
        };
      }
    }

    if (userLimitActive) {
      if (userStorageUsed >= userStorageLimit) {
        const usedGb = (userStorageUsed / (1024 * 1024 * 1024)).toFixed(2);
        const limitGb = (userStorageLimit / (1024 * 1024 * 1024)).toFixed(2);
        return {
          allowed: false,
          warning: false,
          message: `⛔ Quota utilisateur atteint ! Vous avez utilisé ${usedGb} GB sur ${limitGb} GB. Libérez de l'espace ou passez à un plan supérieur.`
        };
      }

      if (userNewStorageUsed > userStorageLimit) {
        const fileGb = (fileSize / (1024 * 1024 * 1024)).toFixed(2);
        const availableGb = ((userStorageLimit - userStorageUsed) / (1024 * 1024 * 1024)).toFixed(2);
        return {
          allowed: false,
          warning: false,
          message: `⛔ Ce fichier (${fileGb} GB) dépasse votre espace disponible (${availableGb} GB). Libérez de l'espace pour continuer.`
        };
      }
    }

    const effectiveLimit = userLimitActive ? userStorageLimit : tenantStorageLimit;
    const effectiveUsed = userLimitActive ? userNewStorageUsed : tenantNewStorageUsed;
    const usagePercent = effectiveLimit ? (effectiveUsed / effectiveLimit) * 100 : 0;

    if (effectiveLimit && usagePercent > 90) {
      const availableGb = ((effectiveLimit - effectiveUsed) / (1024 * 1024 * 1024)).toFixed(2);
      return {
        allowed: true,
        warning: true,
        message: `⚠️ Attention : cet upload utilisera ${usagePercent.toFixed(0)}% de votre quota. Vous aurez ${availableGb} GB d'espace libre.`
      };
    }

    return { allowed: true, warning: false, message: '' };
  }

  upload(): void {
    if (!this.selectedFile) {
      this.error = 'Choisis un fichier avant upload';
      return;
    }

    // Check quota before upload
    const quotaCheckResult = this.checkQuotaBeforeUpload(this.selectedFile.size);
    if (!quotaCheckResult.allowed) {
      this.error = quotaCheckResult.message;
      this.busy = false;
      return;
    }

    if (quotaCheckResult.warning) {
      // Show warning toast but allow upload
      console.warn('Quota warning:', quotaCheckResult.message);
    }

    this.busy = true;
    this.error = '';
    this.success = '';

    const selectedSnapshot = this.selectedFile;
    const optimisticId = `temp-${Date.now()}`;
    const cleanedInfo = this.fileExtensionService.getCleanedNameWithIcon(selectedSnapshot?.name || 'Fichier');
    
    const optimisticFile: SecureFile = {
      _id: optimisticId,
      tenantId: this.authStorage.getSession()?.tenantId || '',
      ownerId: this.authStorage.getUserId() || '',
      originalName: cleanedInfo.name,
      mimeType: selectedSnapshot?.type || undefined,
      size: selectedSnapshot?.size || 0,
      downloadCount: 0,
      status: 'active',
      description: '',
      createdAt: new Date().toISOString()
    };

    this.optimisticFiles = [optimisticFile, ...this.optimisticFiles.filter(file => file._id !== optimisticId)];
    this.files = this.mergeWithOptimisticFiles(this.files);
    this.activeTab = 'files';

    // Create a new File object with sanitized name if needed
    const fileToUpload = cleanedInfo.name !== selectedSnapshot.name
      ? new File([selectedSnapshot], cleanedInfo.name, { type: selectedSnapshot.type })
      : selectedSnapshot;

    this.showUploadProgress = true;
    this.uploadStage = 'uploading';
    this.uploadProgress = 0;
    this.uploadMessage = 'Téléversement du fichier...';

    this.fileApi.uploadWithProgress(fileToUpload).subscribe({
      next: (event) => {
        if (event.type === HttpEventType.Sent) {
          this.uploadStage = 'uploading';
          this.uploadMessage = 'Préparation de l’upload...';
        }

        if (event.type === HttpEventType.UploadProgress) {
          const progressEvent = event as HttpUploadProgressEvent;
          if (progressEvent.total) {
            this.uploadProgress = Math.min(100, Math.round((100 * progressEvent.loaded) / progressEvent.total));
          }
          this.uploadStage = 'uploading';
          this.uploadMessage = `Téléversement ${this.uploadProgress}%...`;

          if (progressEvent.total && progressEvent.loaded === progressEvent.total) {
            this.uploadStage = 'scanning';
            this.uploadMessage = 'Scan et analyse en cours...';
          }
        }

        if (event.type === HttpEventType.Response) {
          const createdFile = (event as any).body as SecureFile;
          this.uploadStage = 'completed';
          this.uploadMessage = 'Upload et analyse terminés.';
          this.busy = false;
          this.selectedFile = null;
          this.success = 'Fichier uploadé et sécurisé avec succès.';

          if (createdFile?._id) {
            if (this.selectedSpaceFilter) {
              this.fileApi.assignFileToSpace(createdFile._id, this.selectedSpaceFilter).subscribe({
                next: (movedFile) => {
                  this.files = this.files.map((current) => current._id === movedFile._id ? movedFile : current);
                  this.optimisticFiles = this.optimisticFiles.map((current) => current._id === movedFile._id ? movedFile : current);
                  this.refreshSpaceCounters();
                },
                error: () => {
                  // ignore folder assignment error for upload recovery; the file is still available.
                }
              });
            }

            if (createdFile.status === 'blocked') {
              this.error = '⚠️ Fichier bloqué : menace détectée et mise en quarantaine. Un administrateur a été notifié.';
              this.success = '';
            }

            this.optimisticFiles = [
              createdFile,
              ...this.optimisticFiles.filter(file => file._id !== createdFile._id && !this.matchesFileDraft(file, createdFile))
            ];
            this.files = this.mergeWithOptimisticFiles(this.files);
            this.refreshSpaceCounters();
            this.loadStats();
          }

          this.loadFiles();
          setTimeout(() => this.loadFiles(), 700);
          setTimeout(() => this.loadFiles(), 1800);
          setTimeout(() => { this.showUploadProgress = false; }, 1200);
        }
      },
      error: (response) => {
        if (response?.error?.code === 'QUOTA_LIMIT_EXCEEDED') {
          const metricLabel = response?.error?.details?.metric?.label;
          const baseMessage = response?.error?.error || 'Quota dépassé. Libérez de l’espace ou contactez votre administrateur.';
          this.error = metricLabel
            ? `⛔ ${metricLabel} : ${baseMessage}`
            : baseMessage;
        } else {
          this.error = response?.error?.error ?? 'Upload impossible';
        }
        this.busy = false;
        this.uploadStage = 'error';
        this.uploadMessage = 'Erreur pendant l’upload.';
        this.showUploadProgress = true;
      }
    });
  }

  clearNotifications(): void {
    this.success = '';
    this.error = '';
  }

  getCurrentTime(): string {
    return new Date().toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }

  createShareLink(): void {
    if (this.shareForm.invalid) {
      this.shareForm.markAllAsTouched();
      return;
    }

    const value = this.shareForm.getRawValue();
    const isDirectShare = value.shareMode === 'direct';

    if (isDirectShare && (!value.recipientUserIds || value.recipientUserIds.length === 0)) {
      this.error = 'Sélectionne un destinataire';
      return;
    }

    const payload: any = {
      expiresInHours: Number(value.expiresInHours),
      maxUses: Number(value.maxUses),
      accessControl: isDirectShare ? 'recipient-only' : 'public'
    };

    if (isDirectShare) {
      payload.shareSubject = value.shareSubject || '';
      payload.shareDescription = value.shareDescription || '';
    }

    if (isDirectShare) {
      const selectedUsers = this.tenantUsers.filter(u => value.recipientUserIds.includes(u._id));
      if (selectedUsers.length === 0) {
        this.error = 'Sélectionne au moins un destinataire';
        return;
      }
      payload.recipientUserIds = selectedUsers.map(user => user._id);
      payload.recipientUserId = selectedUsers[0]._id;
      payload.recipientEmail = selectedUsers[0].email;
      if (selectedUsers.length === 1) {
        payload.recipientEmail = selectedUsers[0].email;
      }
    }

    this.busy = true;
    this.error = '';
    this.success = '';

    this.fileApi.share(value.fileId, payload).subscribe({
      next: (result) => {
        if (isDirectShare) {
          const recipientCount = value.recipientUserIds.length;
          this.success = recipientCount > 1
            ? `Fichier partagé avec ${recipientCount} utilisateurs`
            : `Fichier partagé directement avec ${this.tenantUsers.find(u => u._id === value.recipientUserIds[0])?.email}`;
        } else {
          this.success = 'Lien public créé avec succès';
          this.publicShareResult = {
            shareUrl: result.shareUrl,
            copied: false
          };
          this.copyPublicShareLink(true);
        }
        this.busy = false;
        this.shareForm.reset({ shareMode: 'link', expiresInHours: 24, maxUses: 1, recipientUserIds: [], shareSubject: '', shareDescription: '' });
        this.loadSharedFiles();
      },
      error: (response) => {
        this.error = response?.error?.error ?? 'Création du lien impossible';
        this.busy = false;
      }
    });
  }

  download(file: SecureFile): void {
    this.fileApi.download(file._id).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.originalName;
        link.click();
        window.URL.revokeObjectURL(url);
      },
      error: (response) => {
        this.error = response?.error?.error ?? 'Téléchargement impossible';
      }
    });
  }

  openShareModal(file: SecureFile): void {
    this.selectedFileForShare = file;
    this.recipientSearch = '';
    this.shareForm.patchValue({ fileId: file._id, shareMode: 'link', recipientUserIds: [], shareSubject: '', shareDescription: '' });
    this.showShareModal = true;
  }

  toggleRecipient(userId: string): void {
    const current = this.shareForm.get('recipientUserIds')?.value ?? [];
    const next = current.includes(userId)
      ? current.filter((id: string) => id !== userId)
      : [...current, userId];

    this.shareForm.patchValue({ recipientUserIds: next });
    this.shareForm.get('recipientUserIds')?.markAsDirty();
  }

  isRecipientSelected(userId: string): boolean {
    const current = this.shareForm.get('recipientUserIds')?.value ?? [];
    return current.includes(userId);
  }

  get filteredTenantUsers(): TenantUser[] {
    const query = this.recipientSearch.trim().toLowerCase();
    if (!query) {
      return this.tenantUsers;
    }

    return this.tenantUsers.filter(user => {
      const fullName = `${user.firstName} ${user.lastName}`.toLowerCase();
      return fullName.includes(query) || user.email.toLowerCase().includes(query);
    });
  }

  openFileSettings(file: SecureFile): void {
    this.editingFile = file;
    this.fileSettingsForm.patchValue({
      description: file.description || '',
      expirationDate: file.expirationDate ? this.toDatetimeLocal(file.expirationDate) : '',
      maxDownloads: file.maxDownloads || 10,
      status: file.status || 'active',
      allowedIPsText: Array.isArray((file as any).allowedIPs) ? (file as any).allowedIPs.join(', ') : ''
    });
    this.showFileSettingsModal = true;
  }

  closeFileSettings(): void {
    this.showFileSettingsModal = false;
    this.editingFile = null;
  }

  saveFileSettings(): void {
    if (!this.editingFile?._id) {
      return;
    }

    this.busy = true;
    const value = this.fileSettingsForm.getRawValue();
    const payload = {
      description: value.description,
      expirationDate: value.expirationDate || null,
      maxDownloads: Number(value.maxDownloads),
      status: value.status,
      allowedIPs: value.allowedIPsText
        ? value.allowedIPsText.split(',').map(item => item.trim()).filter(Boolean)
        : []
    };

    this.fileApi.updateFileSettings(this.editingFile._id, payload).subscribe({
      next: (updated) => {
        this.files = this.files.map(file => file._id === updated._id ? updated : file);
        this.optimisticFiles = this.optimisticFiles.map(file => file._id === updated._id ? updated : file);
        this.loadStats();
        this.success = 'Paramètres du fichier enregistrés';
        this.busy = false;
        this.closeFileSettings();
      },
      error: (response) => {
        this.error = response?.error?.error ?? 'Mise à jour impossible';
        this.busy = false;
      }
    });
  }

  remove(file: SecureFile): void {
    this.fileApi.delete(file._id).subscribe({
      next: () => {
        this.success = 'Fichier supprimé';
        this.loadFiles();
        this.refreshSpaceCounters();
      },
      error: (response) => {
        this.error = response?.error?.error ?? 'Suppression impossible';
      }
    });
  }

  ownerLabel(file: any): string {
    if (typeof file?.ownerId === 'string') {
      return file.ownerId;
    }

    const first = file?.ownerId?.firstName ?? '';
    const last = file?.ownerId?.lastName ?? '';
    const fullName = `${first} ${last}`.trim();
    return fullName || file?.ownerId?.email || 'Unknown';
  }

  userLabel(user: TenantUser): string {
    return `${user.firstName} ${user.lastName} (${user.email})`;
  }

  setActiveTab(tab: 'files' | 'shared-with-me' | 'shared-by-me' | 'trash'): void {
    this.activeTab = tab;

    if (tab === 'files') {
      this.filesPage = 1;
    } else if (tab === 'shared-with-me') {
      this.sharedPage = 1;
      // Chargement paresseux pour les fichiers partagÃ©s avec moi
      if (!this.sharedDataLoaded) {
        this.loadSharedFiles();
        this.sharedDataLoaded = true;
      }
    } else if (tab === 'shared-by-me') {
      this.sharedByMePage = 1;
      // Chargement paresseux pour les fichiers partagÃ©s par moi
      if (!this.sharedDataLoaded) {
        this.loadSharedFiles();
        this.sharedDataLoaded = true;
      }
    } else if (tab === 'trash') {
      this.trashPage = 1;
      // Chargement paresseux pour la corbeille
      if (!this.trashDataLoaded) {
        this.loadTrashFiles();
        this.trashDataLoaded = true;
      }
    }
    this.saveState();
  }

  toggleAdvancedFilters(): void {
    this.showAdvancedFilters = !this.showAdvancedFilters;
  }

  onSearchInput(event: Event): void {
    this.searchQuery = String((event.target as HTMLInputElement).value || '');
    this.filesPage = 1;
    this.sharedPage = 1;
    this.trashPage = 1;
    this.saveState();
  }

  onFilesSortChange(event: Event): void {
    this.filesSortBy = (event.target as HTMLSelectElement).value as typeof this.filesSortBy;
    this.filesPage = 1;
    this.saveState();
  }

  toggleFilesSort(field: 'name' | 'date' | 'size' | 'folder'): void {
    const current = this.filesSortBy;
    const asc = `${field}_asc` as typeof this.filesSortBy;
    const desc = `${field}_desc` as typeof this.filesSortBy;
    this.filesSortBy = current === asc ? desc : asc;
    this.filesPage = 1;
    this.saveState();
  }

  getFilesSortIcon(field: 'name' | 'date' | 'size' | 'folder'): string {
    const current = this.filesSortBy;
    if (current === `${field}_asc`) {
      return 'â†‘';
    }
    if (current === `${field}_desc`) {
      return 'â†“';
    }
    return 'â‡…';
  }

  onFilesPageSizeChange(event: Event): void {
    this.filesPageSize = Number((event.target as HTMLSelectElement).value || 8);
    this.filesPage = 1;
    this.saveState();
  }

  onSharedSortChange(event: Event): void {
    this.sharedSortBy = (event.target as HTMLSelectElement).value as typeof this.sharedSortBy;
    this.sharedPage = 1;
    this.saveState();
  }

  onSharedPageSizeChange(event: Event): void {
    this.sharedPageSize = Number((event.target as HTMLSelectElement).value || 6);
    this.sharedPage = 1;
    this.saveState();
  }

  onSharedByMeSortChange(event: Event): void {
    this.sharedByMeSortBy = (event.target as HTMLSelectElement).value as typeof this.sharedByMeSortBy;
    this.sharedByMePage = 1;
    this.saveState();
  }

  onSharedByMePageSizeChange(event: Event): void {
    this.sharedByMePageSize = Number((event.target as HTMLSelectElement).value || 6);
    this.sharedByMePage = 1;
    this.saveState();
  }

  onTrashSortChange(event: Event): void {
    this.trashSortBy = (event.target as HTMLSelectElement).value as typeof this.trashSortBy;
    this.trashPage = 1;
    this.saveState();
  }

  onTrashPageSizeChange(event: Event): void {
    this.trashPageSize = Number((event.target as HTMLSelectElement).value || 6);
    this.trashPage = 1;
    this.saveState();
  }

  nextFilesPage(): void {
    this.filesPage = Math.min(this.filesTotalPages, this.filesPage + 1);
    this.saveState();
  }

  prevFilesPage(): void {
    this.filesPage = Math.max(1, this.filesPage - 1);
    this.saveState();
  }

  nextSharedPage(): void {
    this.sharedPage = Math.min(this.sharedTotalPages, this.sharedPage + 1);
    this.saveState();
  }

  prevSharedPage(): void {
    this.sharedPage = Math.max(1, this.sharedPage - 1);
    this.saveState();
  }

  nextTrashPage(): void {
    this.trashPage = Math.min(this.trashTotalPages, this.trashPage + 1);
    this.saveState();
  }

  prevTrashPage(): void {
    this.trashPage = Math.max(1, this.trashPage - 1);
    this.saveState();
  }

  private extractTokenFromShareUrl(url?: string | null): string | null {
    if (!url) {
      return null;
    }

    const marker = '/file/shared/';
    const markerIndex = url.indexOf(marker);

    if (markerIndex === -1) {
      return null;
    }

    const afterMarker = url.slice(markerIndex + marker.length);
    const token = afterMarker.split('/')[0];
    return token || null;
  }

  downloadSharedFile(shared: SharedFile): void {
    const tokenOrId = this.extractTokenFromShareUrl(shared.shareUrl) || shared.linkId;

    this.fileApi.downloadShared(tokenOrId).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = shared.file.originalName;
        link.click();
        window.URL.revokeObjectURL(url);
      },
      error: (response: any) => {
        this.error = response?.error?.error ?? 'TÃ©lÃ©chargement impossible';
      }
    });
  }

  scanSharedFile(shared: SharedFile): void {
    const tokenOrId = this.extractTokenFromShareUrl(shared.shareUrl) || shared.linkId;
    if (!tokenOrId) {
      this.error = 'Impossible de trouver le lien de partage';
      return;
    }

    shared.scanStatus = 'scanning';
    shared.scanError = '';
    this.scanResult = null;
    this.scanResultDownloadTarget = {
      token: tokenOrId,
      fileName: shared.file.originalName
    };

    this.fileApi.rescanShared(tokenOrId).subscribe({
      next: (scanResult) => {
        shared.scanStatus = 'done';
        this.scanResult = { ...scanResult, shareToken: tokenOrId };
      },
      error: (response: any) => {
        shared.scanStatus = 'idle';
        shared.scanError = response?.error?.error ?? 'Impossible de rÃ©analyser le fichier';
        this.scanResultDownloadTarget = null;
      }
    });
  }

  closeScanModal(): void {
    this.scanResult = null;
    this.scanResultDownloadTarget = null;
  }

  openExternalUrl(url: string): void {
    window.open(url, '_blank');
  }

  downloadFromScanModal(): void {
    if (!this.scanResultDownloadTarget) {
      return;
    }

    this.fileApi.downloadShared(this.scanResultDownloadTarget.token).subscribe({
      next: (blob: Blob) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = this.scanResultDownloadTarget?.fileName || this.scanResult?.originalName || 'file';
        link.click();
        window.URL.revokeObjectURL(url);
        this.closeScanModal();

      },
      error: (response: any) => {
        this.error = response?.error?.error ?? 'TÃ©lÃ©chargement impossible';
      }
    });
  }

  hideSharedForMe(shared: SharedFile): void {
    this.busy = true;
    this.error = '';
    this.success = '';

    this.fileApi.hideSharedWithMe(shared.linkId).subscribe({
      next: () => {
        this.sharedWithMe = this.sharedWithMe.filter(item => item.linkId !== shared.linkId);
        this.hiddenSharedWithMe = [shared, ...this.hiddenSharedWithMe];
        this.success = 'Fichier retiré de votre espace';
        this.loadStats();
        this.busy = false;
      },
      error: (response: any) => {
        this.error = response?.error?.error ?? 'Impossible de retirer ce fichier';
        this.busy = false;
      }
    });
  }

  restoreSharedForMe(shared: SharedFile): void {
    this.busy = true;
    this.error = '';
    this.success = '';

    this.fileApi.restoreSharedWithMe(shared.linkId).subscribe({
      next: () => {
        this.hiddenSharedWithMe = this.hiddenSharedWithMe.filter(item => item.linkId !== shared.linkId);
        this.sharedWithMe = [shared, ...this.sharedWithMe];
        this.success = 'Fichier restauré dans votre espace';
        this.busy = false;
      },
      error: (response: any) => {
        this.error = response?.error?.error ?? 'Impossible de restaurer ce fichier';
        this.busy = false;
      }
    });
  }

  copyToClipboard(url: string): void {
    navigator.clipboard.writeText(url).then(() => {
      this.success = 'URL copiée dans le presse-papiers';
      setTimeout(() => this.success = '', 3000);
    }).catch(() => {
      this.error = 'Impossible de copier l\'URL';
      setTimeout(() => this.error = '', 3000);
    });
  }

  copyPublicShareLink(silent = false): void {
    const url = this.publicShareResult?.shareUrl;
    if (!url) {
      return;
    }

    navigator.clipboard.writeText(url).then(() => {
      if (this.publicShareResult) {
        this.publicShareResult = {
          ...this.publicShareResult,
          copied: true
        };
      }

      if (!silent) {
        this.success = 'Lien copié dans le presse-papiers';
      }
    }).catch(() => {
      if (!silent) {
        this.error = 'Impossible de copier le lien';
      }
    });
  }

  closePublicSharePopup(): void {
    this.publicShareResult = null;
  }

  closeShareModal(): void {
    this.showShareModal = false;
    this.recipientSearch = '';
    this.shareForm.reset({ shareMode: 'link', expiresInHours: 24, maxUses: 1, recipientUserIds: [], shareSubject: '', shareDescription: '' });
  }

  private loadStats(): void {
    this.fileApi.getStats().subscribe({
      next: (response) => {
        this.stats.totalFiles = response.totalFiles ?? this.files.length;
        this.stats.totalSize = response.totalSize ?? this.files.reduce((sum, file) => sum + (file.size || 0), 0);
        this.stats.recentUploads = response.recentUploads ?? this.stats.recentUploads;
        this.stats.sharedFiles = response.sharedFiles ?? this.sharedByMe.length;
        this.stats.downloadsCount = response.receivedFiles ?? this.stats.downloadsCount;

        const storageLimit = this.stats.storageLimit || this.quotaSummary?.user?.storageLimitBytes || this.quotaSummary?.tenant?.storageLimitBytes || 0;
        this.stats.storageUsedPercent = storageLimit > 0 ? Math.min((this.stats.totalSize / storageLimit) * 100, 100) : 0;
      },
      error: () => {
        // Fallback to local computation when the aggregate endpoint is unavailable.
        this.stats.totalFiles = this.files.length;
        this.stats.totalSize = this.files.reduce((sum, file) => sum + (file.size || 0), 0);

        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
        this.stats.recentUploads = this.files.filter(file =>
          file.createdAt && new Date(file.createdAt) > oneWeekAgo
        ).length;

        this.stats.sharedFiles = this.sharedByMe.length;
        this.stats.downloadsCount = this.files.length * 2;

        const storageLimit = this.stats.storageLimit || this.quotaSummary?.user?.storageLimitBytes || this.quotaSummary?.tenant?.storageLimitBytes || 0;
        this.stats.storageUsedPercent = storageLimit > 0 ? Math.min((this.stats.totalSize / storageLimit) * 100, 100) : 0;
      }
    });
  }

  private loadQuotaSummary(): void {
    this.userApi.getUserQuota().subscribe({
      next: (quota) => {
        this.quotaSummary = quota;
        this.stats.storageLimit = quota.user.storageLimitBytes || quota.tenant.storageLimitBytes || 0;
        this.stats.quotaPlan = quota.plan;
        this.stats.quotaScope = quota.scope;
        this.loadStats();
      },
      error: () => {
        this.quotaSummary = null;
      }
    });
  }

  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  formatDate(date: string): string {
    return new Date(date).toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  getFileIcon(file: SecureFile): string {
    const extension = file.originalName?.split('.').pop()?.toLowerCase() || '';
    switch (extension) {
      case 'pdf':
        return '📄';
      case 'doc':
      case 'docx':
        return '📝';
      case 'xls':
      case 'xlsx':
      case 'csv':
        return '📊';
      case 'ppt':
      case 'pptx':
        return '📈';
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'webp':
      case 'svg':
        return '🖼️';
      case 'zip':
      case 'rar':
      case '7z':
      case 'tar':
      case 'gz':
        return '📦';
      case 'mp4':
      case 'mov':
      case 'mkv':
        return '🎥';
      case 'mp3':
      case 'wav':
      case 'ogg':
        return '🎵';
      case 'txt':
        return '📄';
      default:
        return '📁';
    }
  }

  hasAiMetadata(file: SecureFile): boolean {
    const scanMetadata = file.scanMetadata;
    return !!scanMetadata?.aiStatus || !!scanMetadata?.aiClassification;
  }

  isApprovedByAdmin(file: SecureFile): boolean {
    return !!file.whitelistedBy || !!file.whitelistDate || !!file.investigationNotes ||
      !!file.scanMetadata?.whitelistedBy || !!file.scanMetadata?.whitelistDate || !!file.scanMetadata?.investigationNotes;
  }

  getApprovalBadgeLabel(file: SecureFile): string {
    const quarantineStatus = String(file.quarantineStatus || file.scanMetadata?.quarantineStatus || '').toLowerCase();
    const approvedByAdmin = !!file.whitelistedBy || !!file.whitelistDate || !!file.scanMetadata?.whitelistedBy || !!file.scanMetadata?.whitelistDate;

    if (approvedByAdmin) {
      return 'Approuvé par l’admin';
    }

    if (quarantineStatus === 'quarantined' || file.status === 'blocked') {
      return 'Mise en quarantaine';
    }

    if (file.investigationNotes) {
      return 'Sous investigation';
    }

    return '';
  }

  getApprovalBadgeClass(file: SecureFile): string {
    const quarantineStatus = String(file.quarantineStatus || file.scanMetadata?.quarantineStatus || '').toLowerCase();
    const approvedByAdmin = !!file.whitelistedBy || !!file.whitelistDate || !!file.scanMetadata?.whitelistedBy || !!file.scanMetadata?.whitelistDate;

    if (approvedByAdmin) {
      return 'approval-approved';
    }

    if (quarantineStatus === 'quarantined' || file.status === 'blocked') {
      return 'approval-blocked';
    }

    if (file.investigationNotes) {
      return 'approval-review';
    }

    return '';
  }

  getAiStatusLabel(file: SecureFile): string {
    const status = String(file.scanMetadata?.aiStatus || '').toLowerCase();
    const quarantineStatus = String(file.quarantineStatus || file.scanMetadata?.quarantineStatus || '').toLowerCase();

    if (quarantineStatus === 'quarantined' || file.status === 'blocked') {
      return 'Menace détectée';
    }

    if (status === 'done') return 'IA prête';
    if (status === 'failed') return 'Analyse IA en échec';
    if (status === 'pending') return 'IA en cours';
    return 'IA inactive';
  }

  getAiStatusClass(file: SecureFile): string {
    const status = String(file.scanMetadata?.aiStatus || '').toLowerCase();
    if (status === 'done') return 'ai-done';
    if (status === 'failed') return 'ai-failed';
    if (status === 'pending') return 'ai-pending';
    return 'ai-idle';
  }

  isSharedFileSuspicious(shared: SharedFile): boolean {
    const file = shared?.file;
    const quarantineStatus = String(file?.quarantineStatus || file?.scanMetadata?.quarantineStatus || '').toLowerCase();

    return Boolean(
      file?.whitelistedBy ||
      file?.whitelistDate ||
      file?.scanMetadata?.whitelistedBy ||
      file?.scanMetadata?.whitelistDate ||
      file?.investigationNotes ||
      file?.scanMetadata?.investigationNotes ||
      quarantineStatus === 'quarantined' ||
      file?.status === 'blocked'
    );
  }

  getSharedFileRiskLabel(shared: SharedFile): string {
    const file = shared?.file;
    const quarantineStatus = String(file?.quarantineStatus || file?.scanMetadata?.quarantineStatus || '').toLowerCase();
    const approvedByAdmin = !!file?.whitelistedBy || !!file?.whitelistDate || !!file?.scanMetadata?.whitelistedBy || !!file?.scanMetadata?.whitelistDate;

    if (approvedByAdmin) {
      return 'Suspect - approuvé admin';
    }

    if (quarantineStatus === 'quarantined' || file?.status === 'blocked') {
      return 'Suspect - accès surveillé';
    }

    if (file?.investigationNotes) {
      return 'Suspect - en investigation';
    }

    return 'Suspect';
  }

  getAiClassificationLabel(file: SecureFile): string {
    const classification = file.scanMetadata?.aiClassification?.classification;
    return classification || 'UNKNOWN';
  }

  getAiRiskLabel(file: SecureFile): string {
    return String(file.scanMetadata?.aiClassification?.pii_risk || 'LOW').toUpperCase();
  }

  getAiConfidenceLabel(file: SecureFile): string {
    const confidence = file.scanMetadata?.aiClassification?.confidence;
    if (confidence === undefined || confidence === null) {
      return '';
    }

    return `${confidence}%`;
  }

  getSpaceName(file: SecureFile): string {
    if (!file.ownerSpaceId) {
      return 'Sans espace';
    }

    if (typeof file.ownerSpaceId === 'string') {
      const folder = this.userFolders.find((item) => item._id === file.ownerSpaceId);
      return folder?.name || 'Sans espace';
    }

    return file.ownerSpaceId.name || 'Sans espace';
  }

  getSenderLabel(item: SharedFile): string {
    const firstName = item?.sharedBy?.firstName || '';
    const lastName = item?.sharedBy?.lastName || '';
    const fullName = `${firstName} ${lastName}`.trim();
    return fullName || item?.sharedBy?.email || '';
  }

  getSpaceCount(spaceId: string): number {
    return this.spaceCounts[spaceId] || 0;
  }

  private compareText(a: string | undefined, b: string | undefined): number {
    return String(a || '').localeCompare(String(b || ''));
  }

  private getDateValue(date: string | undefined): number {
    if (!date) {
      return 0;
    }

    const value = new Date(date).getTime();
    return Number.isFinite(value) ? value : 0;
  }

  getOwnerSpaceId(file: SecureFile): string {
    if (!file.ownerSpaceId) {
      return '';
    }

    if (typeof file.ownerSpaceId === 'string') {
      return file.ownerSpaceId;
    }

    return file.ownerSpaceId._id || '';
  }

  private toDatetimeLocal(date: string): string {
    const value = new Date(date);
    const pad = (number: number) => String(number).padStart(2, '0');
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}`;
  }

  private matchesFileDraft(left: SecureFile, right: SecureFile): boolean {
    return left.originalName === right.originalName && left.size === right.size;
  }

  private mergeWithOptimisticFiles(serverFiles: SecureFile[]): SecureFile[] {
    const merged = [...serverFiles];

    for (const optimistic of this.optimisticFiles) {
      if (!merged.some(file => file._id === optimistic._id)) {
        merged.unshift(optimistic);
      }
    }

    const seen = new Set<string>();
    return merged.filter(file => {
      if (!file?._id || seen.has(file._id)) {
        return false;
      }

      seen.add(file._id);
      return true;
    });
  }

  private refreshSharedWithMeSenderOptions(files: SharedFile[]): void {
    const map = new Map<string, SenderFilterOption>();

    for (const file of files) {
      const senderId = file.sharedBy?._id;
      if (!senderId) {
        continue;
      }

      if (!map.has(senderId)) {
        const firstName = file.sharedBy?.firstName || '';
        const lastName = file.sharedBy?.lastName || '';
        const email = file.sharedBy?.email || '';
        const fullName = `${firstName} ${lastName}`.trim();

        map.set(senderId, {
          id: senderId,
          label: fullName ? `${fullName} (${email})` : email || senderId
        });
      }
    }

    this.sharedWithMeSenderOptions = Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }

  private loadPersistedState(): void {
    const persisted = localStorage.getItem('fileWorkspaceState');
    if (!persisted) {
      return;
    }

    try {
      const state = JSON.parse(persisted);
      this.searchQuery = state.searchQuery || '';
      this.selectedSpaceFilter = state.selectedSpaceFilter || '';
      this.filesSortBy = state.filesSortBy || 'createdAt';
      this.filesPageSize = state.filesPageSize || 8;
      this.sharedSortBy = state.sharedSortBy || 'createdAt';
      this.sharedPageSize = state.sharedPageSize || 6;
      this.trashSortBy = state.trashSortBy || 'createdAt';
      this.trashPageSize = state.trashPageSize || 6;
      this.activeTab = state.activeTab || 'files';
      this.filesPage = state.filesPage || 1;
      this.sharedPage = state.sharedPage || 1;
      this.trashPage = state.trashPage || 1;
    } catch (error) {
      console.warn('Failed to load persisted state:', error);
    }
  }

  private saveState(): void {
    const state = {
      searchQuery: this.searchQuery,
      selectedSpaceFilter: this.selectedSpaceFilter,
      filesSortBy: this.filesSortBy,
      filesPageSize: this.filesPageSize,
      sharedSortBy: this.sharedSortBy,
      sharedPageSize: this.sharedPageSize,
      trashSortBy: this.trashSortBy,
      trashPageSize: this.trashPageSize,
      activeTab: this.activeTab,
      filesPage: this.filesPage,
      sharedPage: this.sharedPage,
      trashPage: this.trashPage
    };

    localStorage.setItem('fileWorkspaceState', JSON.stringify(state));
  }

  // Folder Tree Methods
  onFolderSelected(folderId: string | null): void {
    this.selectedFolderId = folderId;
    this.selectedSpaceFilter = folderId || '';
    this.filesPage = 1;
    this.loadFiles();
  }

  onFolderCreated(data: { name: string; parentId: string | null }): void {
    this.createFolderFromTree(data.name, data.parentId);
  }

  onFolderRenamed(data: { folderId: string; name: string }): void {
    this.renameFolderFromTree(data.folderId, data.name);
  }

  onFolderDeleted(folderId: string): void {
    this.deleteFolderFromTree(folderId);
  }

  toggleFolders(): void {
    this.showFolders = !this.showFolders;
  }

  private createFolderFromTree(name: string, parentId: string | null): void {
    if (!name.trim()) {
      this.error = 'Le nom du dossier est obligatoire';
      return;
    }

    this.creatingSpace = true;
    this.error = '';
    this.success = '';

    const payload: any = { name: name.trim() };
    if (parentId !== null) {
      payload.parentId = parentId;
    }

    this.fileApi.createUserFolder(payload).subscribe({
      next: (folder) => {
        this.userFolders = [...this.userFolders, folder];
        this.success = 'Dossier créé avec succès';
        this.creatingSpace = false;
        this.refreshSpaceCounters();
      },
      error: (response: any) => {
        this.error = response?.error?.error ?? 'Impossible de créer le dossier';
        this.creatingSpace = false;
      }
    });
  }

  private renameFolderFromTree(folderId: string, name: string): void {
    if (!name.trim()) {
      this.error = 'Le nom du dossier est obligatoire';
      return;
    }

    this.updatingSpace = true;
    this.error = '';
    this.success = '';

    this.fileApi.updateUserFolder(folderId, { name: name.trim() }).subscribe({
      next: (updated) => {
        this.userFolders = this.userFolders.map((folder) =>
          folder._id === updated._id ? updated : folder
        );
        this.success = 'Dossier renommÃ©';
        this.updatingSpace = false;
      },
      error: (response: any) => {
        this.error = response?.error?.error ?? 'Impossible de renommer ce dossier';
        this.updatingSpace = false;
      }
    });
  }

  private deleteFolderFromTree(folderId: string): void {
    this.deletingSpace = true;
    this.error = '';
    this.success = '';

    this.fileApi.deleteUserFolder(folderId).subscribe({
      next: () => {
        this.userFolders = this.userFolders.filter((folder) => folder._id !== folderId);
        if (this.selectedFolderId === folderId) {
          this.selectedFolderId = null;
          this.selectedSpaceFilter = '';
          this.loadFiles();
        }
        this.success = 'Dossier supprimé';
        this.deletingSpace = false;
        this.refreshSpaceCounters();
      },
      error: (response: any) => {
        this.error = response?.error?.error ?? 'Impossible de supprimer ce dossier';
        this.deletingSpace = false;
      }
    });
  }

  onSearchResultSelected(result: any): void {
    if (result.type === 'folder') {
      // Navigate to the selected folder
      this.selectedFolderId = result.id;
      this.selectedSpaceFilter = result.id;
      this.loadFiles();
      this.success = `Navigué vers le dossier "${result.name}"`;
    } else if (result.type === 'file') {
      // For files, we could scroll to the file or highlight it
      // For now, just show a message
      this.success = `Fichier trouvé : "${result.name}"`;
      // Optionally, we could navigate to the folder containing the file
      if (result.folderId) {
        this.selectedFolderId = result.folderId;
        this.selectedSpaceFilter = result.folderId;
        this.loadFiles();
      }
    }
  }

  // Share Management Methods
  getShareStatus(shared: SharedFile): string {
    const now = new Date();
    const expiresAt = new Date(shared.expiresAt);

    if (now > expiresAt) {
      return 'expired';
    }

    if ((shared.usedCount || 0) >= (shared.maxUses || 1)) {
      return 'max-uses';
    }

    return 'active';
  }

  getShareStatusText(shared: SharedFile): string {
    const status = this.getShareStatus(shared);

    switch (status) {
      case 'expired':
        return 'ExpirÃ©';
      case 'max-uses':
        return 'Limite atteinte';
      case 'active':
        return 'Actif';
      default:
        return 'Inconnu';
    }
  }

  getRecipientNames(shared: SharedFile): string {
    if (!shared.recipientUsers || shared.recipientUsers.length === 0) {
      return 'Aucun destinataire';
    }

    const names = shared.recipientUsers.map(user => {
      const userInfo = this.tenantUsers.find(u => u._id === user);
      return userInfo ? `${userInfo.firstName} ${userInfo.lastName}`.trim() : user;
    });

    if (names.length <= 2) {
      return names.join(', ');
    }

    return `${names.slice(0, 2).join(', ')} +${names.length - 2} autres`;
  }

  getDownloadCount(shared: SharedFile): string {
    // Pour l'instant, on utilise usedCount comme approximation
    // Ã€ amÃ©liorer avec un vrai comptage des tÃ©lÃ©chargements
    const count = shared.usedCount || 0;
    return `${count} tÃ©lÃ©chargement${count > 1 ? 's' : ''}`;
  }

  copyShareLink(shared: SharedFile): void {
    if (shared.shareUrl) {
      navigator.clipboard.writeText(shared.shareUrl).then(() => {
        this.success = 'Lien copié dans le presse-papiers';
      }).catch(() => {
        this.error = 'Impossible de copier le lien';
      });
    }
  }

  viewShareDetails(shared: SharedFile): void {
    // Pour l'instant, afficher les dÃ©tails dans une alerte
    // Ã€ amÃ©liorer avec un modal dÃ©diÃ©
    const details = `
      Fichier: ${shared.file.originalName}
      Destinataires: ${this.getRecipientNames(shared)}
      CrÃ©Ã© le: ${shared.createdAt ? this.formatDate(shared.createdAt) : 'Date inconnue'}
      Expire le: ${this.formatDate(shared.expiresAt)}
      Utilisations: ${shared.usedCount || 0}/${shared.maxUses}
      Statut: ${this.getShareStatusText(shared)}
    `;

    alert(details.trim());
  }

  revokeShare(shared: SharedFile): void {
    if (confirm(`ÃŠtes-vous sÃ»r de vouloir annuler ce partage ?\n\nFichier: ${shared.file.originalName}\nDestinataires: ${this.getRecipientNames(shared)}`)) {
      this.fileApi.revokeShare(shared.linkId).subscribe({
        next: () => {
          this.success = 'Partage annulé avec succès';
          this.loadSharedFiles(); // Recharger la liste
        },
        error: (response) => {
          this.error = response?.error?.error ?? 'Impossible d\'annuler le partage';
        }
      });
    }
  }
}