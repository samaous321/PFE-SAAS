import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Folder, SecureFile } from '../../../core/models/file.model';

@Component({
  selector: 'app-folder-tree',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './folder-tree.component.html',
  styleUrls: ['./folder-tree.component.scss']
})
export class FolderTreeComponent implements OnInit, OnChanges {
  @Input() folders: Folder[] = [];
  @Input() files: SecureFile[] = [];
  @Input() currentFolderId: string | null = null;
  @Input() selectedFolderId: string | null = null;
  @Output() folderSelected = new EventEmitter<string | null>();
  @Output() folderCreated = new EventEmitter<{ name: string; parentId: string | null }>();
  @Output() folderRenamed = new EventEmitter<{ folderId: string; name: string }>();
  @Output() folderDeleted = new EventEmitter<string>();

  expandedFolders: Set<string> = new Set();
  showCreateInput: { [key: string]: boolean } = {};
  newFolderName = '';

  ngOnInit() {
    // Expand root folders by default on initial load
    this.folders.filter(f => !f.parentId).forEach(f => this.expandedFolders.add(f._id));
  }

  ngOnChanges(changes: SimpleChanges): void {
    const folderChange = changes['folders'];
    if (folderChange && folderChange.firstChange) {
      const folders: Folder[] = folderChange.currentValue || [];
      folders.filter((f) => !f.parentId).forEach((f) => this.expandedFolders.add(f._id));
    }

    const selectedFolderChange = changes['selectedFolderId'];
    if (selectedFolderChange && selectedFolderChange.currentValue) {
      this.expandFolderPath(selectedFolderChange.currentValue);
    }
  }

  getRootFolders(): Folder[] {
    return this.folders.filter(f => !f.parentId);
  }

  getChildFolders(parentId: string): Folder[] {
    return this.folders.filter(f => f.parentId === parentId);
  }

  toggleFolder(folderId: string) {
    if (this.expandedFolders.has(folderId)) {
      this.expandedFolders.delete(folderId);
    } else {
      this.expandedFolders.add(folderId);
    }
  }

  selectFolder(folderId: string | null) {
    if (folderId) {
      this.expandFolderPath(folderId);
    }
    this.folderSelected.emit(folderId);
  }

  private expandFolderPath(folderId: string): void {
    let currentFolder: Folder | undefined = this.folders.find(f => f._id === folderId);

    while (currentFolder) {
      if (currentFolder.parentId) {
        this.expandedFolders.add(currentFolder.parentId);
      }
      this.expandedFolders.add(currentFolder._id);

      const parentId = currentFolder.parentId;
      currentFolder = parentId ? this.folders.find(f => f._id === parentId) : undefined;
    }
  }

  isSelected(folderId: string | null): boolean {
    return this.selectedFolderId === folderId;
  }

  isCurrent(folderId: string | null): boolean {
    return this.currentFolderId === folderId;
  }

  hasChildren(folderId: string): boolean {
    return this.getChildFolders(folderId).length > 0;
  }

  showCreateFolderInput(parentId: string | null) {
    const key = parentId || 'root';
    this.showCreateInput[key] = true;
    this.newFolderName = '';
  }

  hideCreateFolderInput(parentId: string | null) {
    const key = parentId || 'root';
    this.showCreateInput[key] = false;
    this.newFolderName = '';
  }

  createFolder(parentId: string | null) {
    if (this.newFolderName.trim()) {
      if (parentId) {
        this.expandedFolders.add(parentId);
      }
      this.folderCreated.emit({
        name: this.newFolderName.trim(),
        parentId
      });
      this.hideCreateFolderInput(parentId);
    }
  }

  startRename(folder: Folder) {
    const newName = prompt('Nouveau nom du dossier', folder.name);
    if (newName && newName.trim() && newName !== folder.name) {
      this.folderRenamed.emit({
        folderId: folder._id,
        name: newName.trim()
      });
    }
  }

  deleteFolder(folder: Folder) {
    if (confirm(`Supprimer le dossier "${folder.name}" et tout son contenu ?`)) {
      this.folderDeleted.emit(folder._id);
    }
  }

  getFolderIcon(folder: Folder): string {
    if (this.hasChildren(folder._id) || this.getFileCount(folder._id) > 0) {
      return this.expandedFolders.has(folder._id) ? '📂' : '📁';
    }
    return '📁';
  }

  getOwnerSpaceId(file: SecureFile): string {
    if (!file.ownerSpaceId) {
      return '';
    }
    if (typeof file.ownerSpaceId === 'string') {
      return file.ownerSpaceId;
    }
    return file.ownerSpaceId._id;
  }

  getFilesInFolder(folderId: string): SecureFile[] {
    return this.files
      .filter((file) => this.getOwnerSpaceId(file) === folderId)
      .sort((a, b) => this.getDateValue(b.createdAt) - this.getDateValue(a.createdAt));
  }

  getFileCount(folderId: string): number {
    return this.files.filter((file) => this.getOwnerSpaceId(file) === folderId).length;
  }

  private getDateValue(date?: string): number {
    const value = date ? new Date(date).getTime() : 0;
    return Number.isNaN(value) ? 0 : value;
  }

  getFileListPreview(folderId: string): string {
    const fileNames = this.getFilesInFolder(folderId).map((file) => file.originalName);
    if (!fileNames.length) {
      return '';
    }

    const preview = fileNames.slice(0, 3).join(', ');
    if (fileNames.length <= 3) {
      return preview;
    }

    return `${preview} +${fileNames.length - 3} autres`;
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
        return '🗜️';
      case 'mp4':
      case 'mov':
      case 'mkv':
        return '🎬';
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

  formatFileDate(date?: string): string {
    if (!date) {
      return '';
    }
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) {
      return '';
    }
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit'
    });
  }

  getFolderPath(folder: Folder): string {
    const path: string[] = [];
    let current: Folder | undefined = folder;

    while (current) {
      path.unshift(current.name);
      current = this.folders.find(f => f._id === current!.parentId);
    }

    return path.join(' / ');
  }

  getSelectedFolderPath(): string {
    if (!this.selectedFolderId) {
      return 'Tous les fichiers';
    }

    const folder = this.folders.find(f => f._id === this.selectedFolderId);
    return folder ? this.getFolderPath(folder) : 'Tous les fichiers';
  }
}