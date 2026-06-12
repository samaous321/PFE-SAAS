import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FileApiService } from '../../../core/services/file-api.service';

interface SearchResult {
  id: string;
  name: string;
  type: 'file' | 'folder';
  mimeType?: string;
  size?: number;
  path?: string;
  parentId?: string;
  isRoot?: boolean;
  folderId?: string;
  createdAt: string;
}

@Component({
  selector: 'app-search',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './search.component.html',
  styleUrl: './search.component.scss'
})
export class SearchComponent {
  @Output() resultSelected = new EventEmitter<SearchResult>();

  searchQuery = '';
  searchResults: SearchResult[] = [];
  isSearching = false;
  hasSearched = false;
  searchType: 'all' | 'files' | 'folders' = 'all';

  private searchTimeout?: number;

  constructor(private fileApi: FileApiService) {}

  onSearchInput() {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    if (this.searchQuery.trim().length >= 2) {
      this.searchTimeout = window.setTimeout(() => {
        this.performSearch();
      }, 300);
    } else {
      this.searchResults = [];
      this.hasSearched = false;
    }
  }

  onSearchTypeChange(type: 'all' | 'files' | 'folders') {
    this.searchType = type;
    if (this.searchQuery.trim().length >= 2) {
      this.performSearch();
    }
  }

  private performSearch() {
    this.isSearching = true;
    this.hasSearched = true;

    const options: any = {
      limit: 20
    };

    if (this.searchType !== 'all') {
      options.type = this.searchType;
    }

    this.fileApi.searchFilesAndFolders(this.searchQuery.trim(), options).subscribe({
      next: (response) => {
        this.searchResults = response.results;
        this.isSearching = false;
      },
      error: (error) => {
        console.error('Search error:', error);
        this.searchResults = [];
        this.isSearching = false;
      }
    });
  }

  selectResult(result: SearchResult) {
    this.resultSelected.emit(result);
    // Clear search after selection
    this.searchQuery = '';
    this.searchResults = [];
    this.hasSearched = false;
  }

  clearSearch() {
    this.searchQuery = '';
    this.searchResults = [];
    this.hasSearched = false;
  }

  getFileIcon(mimeType?: string): string {
    if (!mimeType) return '📄';

    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.startsWith('video/')) return '🎥';
    if (mimeType.startsWith('audio/')) return '🎵';
    if (mimeType.includes('pdf')) return '📕';
    if (mimeType.includes('zip') || mimeType.includes('rar')) return '📦';
    if (mimeType.includes('text')) return '📄';
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return '📊';
    if (mimeType.includes('word') || mimeType.includes('document')) return '📝';

    return '📄';
  }

  formatFileSize(bytes?: number): string {
    if (!bytes) return '';

    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }
}
