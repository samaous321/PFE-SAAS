import { Injectable } from '@angular/core';

export interface FileExtensionInfo {
  icon: string;
  category: string;
  mimeType?: string;
}

@Injectable({
  providedIn: 'root'
})
export class FileExtensionService {
  private readonly extensionMap: Record<string, FileExtensionInfo> = {
    // Documents
    pdf: { icon: '📄', category: 'document', mimeType: 'application/pdf' },
    doc: { icon: '📝', category: 'document', mimeType: 'application/msword' },
    docx: { icon: '📝', category: 'document', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
    txt: { icon: '📋', category: 'document', mimeType: 'text/plain' },
    rtf: { icon: '📝', category: 'document', mimeType: 'application/rtf' },
    
    // Spreadsheets
    xls: { icon: '📊', category: 'spreadsheet', mimeType: 'application/vnd.ms-excel' },
    xlsx: { icon: '📊', category: 'spreadsheet', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    csv: { icon: '📊', category: 'spreadsheet', mimeType: 'text/csv' },
    
    // Presentations
    ppt: { icon: '🎯', category: 'presentation', mimeType: 'application/vnd.ms-powerpoint' },
    pptx: { icon: '🎯', category: 'presentation', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' },
    odp: { icon: '🎯', category: 'presentation', mimeType: 'application/vnd.oasis.opendocument.presentation' },
    
    // Images
    jpg: { icon: '🖼️', category: 'image', mimeType: 'image/jpeg' },
    jpeg: { icon: '🖼️', category: 'image', mimeType: 'image/jpeg' },
    png: { icon: '🖼️', category: 'image', mimeType: 'image/png' },
    gif: { icon: '🖼️', category: 'image', mimeType: 'image/gif' },
    webp: { icon: '🖼️', category: 'image', mimeType: 'image/webp' },
    svg: { icon: '🖼️', category: 'image', mimeType: 'image/svg+xml' },
    bmp: { icon: '🖼️', category: 'image', mimeType: 'image/bmp' },
    tiff: { icon: '🖼️', category: 'image', mimeType: 'image/tiff' },
    
    // Audio
    mp3: { icon: '🎵', category: 'audio', mimeType: 'audio/mpeg' },
    wav: { icon: '🎵', category: 'audio', mimeType: 'audio/wav' },
    flac: { icon: '🎵', category: 'audio', mimeType: 'audio/flac' },
    aac: { icon: '🎵', category: 'audio', mimeType: 'audio/aac' },
    m4a: { icon: '🎵', category: 'audio', mimeType: 'audio/mp4' },
    
    // Video
    mp4: { icon: '🎬', category: 'video', mimeType: 'video/mp4' },
    avi: { icon: '🎬', category: 'video', mimeType: 'video/x-msvideo' },
    mov: { icon: '🎬', category: 'video', mimeType: 'video/quicktime' },
    mkv: { icon: '🎬', category: 'video', mimeType: 'video/x-matroska' },
    webm: { icon: '🎬', category: 'video', mimeType: 'video/webm' },
    flv: { icon: '🎬', category: 'video', mimeType: 'video/x-flv' },
    
    // Archives
    zip: { icon: '📦', category: 'archive', mimeType: 'application/zip' },
    rar: { icon: '📦', category: 'archive', mimeType: 'application/x-rar-compressed' },
    '7z': { icon: '📦', category: 'archive', mimeType: 'application/x-7z-compressed' },
    tar: { icon: '📦', category: 'archive', mimeType: 'application/x-tar' },
    gz: { icon: '📦', category: 'archive', mimeType: 'application/gzip' },
    
    // Code
    js: { icon: '💻', category: 'code', mimeType: 'text/javascript' },
    ts: { icon: '💻', category: 'code', mimeType: 'text/typescript' },
    py: { icon: '💻', category: 'code', mimeType: 'text/x-python' },
    java: { icon: '💻', category: 'code', mimeType: 'text/x-java-source' },
    cpp: { icon: '💻', category: 'code', mimeType: 'text/x-c++src' },
    c: { icon: '💻', category: 'code', mimeType: 'text/x-csrc' },
    html: { icon: '🌐', category: 'code', mimeType: 'text/html' },
    css: { icon: '🌐', category: 'code', mimeType: 'text/css' },
    json: { icon: '💾', category: 'code', mimeType: 'application/json' },
    xml: { icon: '💾', category: 'code', mimeType: 'application/xml' },
    
    // Default
    default: { icon: '📁', category: 'file', mimeType: 'application/octet-stream' }
  };

  /**
   * Get file extension info (icon and category)
   */
  getExtensionInfo(filename: string): FileExtensionInfo {
    if (!filename) {
      return this.extensionMap['default'];
    }

    const ext = filename.split('.').pop()?.toLowerCase() || '';
    return this.extensionMap[ext] || this.extensionMap['default'];
  }

  /**
   * Get icon emoji for file extension
   */
  getIcon(filename: string): string {
    return this.getExtensionInfo(filename).icon;
  }

  /**
   * Get category for file extension
   */
  getCategory(filename: string): string {
    return this.getExtensionInfo(filename).category;
  }

  /**
   * Sanitize and normalize filename
   * - Removes special characters that could cause issues
   * - Preserves the file extension
   * - Removes excessive whitespace
   */
  sanitizeFilename(filename: string): string {
    if (!filename) {
      return 'fichier_sans_nom';
    }

    // Split name and extension
    const parts = filename.split('.');
    const ext = parts.length > 1 ? parts.pop() : '';
    let name = parts.join('.');

    // Remove invalid characters: < > : " / \ | ? * and control characters
    name = name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_');

    // Replace multiple spaces/underscores with single underscore
    name = name.replace(/[\s_]+/g, '_');

    // Remove leading/trailing underscores/spaces
    name = name.replace(/^[\s_]+|[\s_]+$/g, '');

    // Ensure name is not empty
    if (!name) {
      name = 'fichier';
    }

    // Limit name to 200 characters (leaving room for extension)
    if (name.length > 200) {
      name = name.substring(0, 200);
    }

    // Reconstruct filename
    return ext ? `${name}.${ext}` : name;
  }

  /**
   * Clean filename and get icon
   */
  getCleanedNameWithIcon(filename: string): { name: string; icon: string } {
    return {
      name: this.sanitizeFilename(filename),
      icon: this.getIcon(filename)
    };
  }

  /**
   * Check if file is image
   */
  isImage(filename: string): boolean {
    return this.getCategory(filename) === 'image';
  }

  /**
   * Check if file is audio
   */
  isAudio(filename: string): boolean {
    return this.getCategory(filename) === 'audio';
  }

  /**
   * Check if file is video
   */
  isVideo(filename: string): boolean {
    return this.getCategory(filename) === 'video';
  }

  /**
   * Check if file is document
   */
  isDocument(filename: string): boolean {
    return this.getCategory(filename) === 'document';
  }

  /**
   * Check if file is archive
   */
  isArchive(filename: string): boolean {
    return this.getCategory(filename) === 'archive';
  }
}
