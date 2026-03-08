import { storage } from '../../firebase-config.js';
import { ref as storageRef, uploadBytesResumable, getDownloadURL, deleteObject } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js';
import { dalService } from './dal-service.js';
/**
 * Service for handling Firebase Storage video uploads for Sprint demos
 * Direct upload to Firebase Storage without Cloud Functions
 */
export class FirebaseVideoService {
  constructor() {
    this.maxFileSize = 500 * 1024 * 1024; // 500MB max
    this.allowedTypes = [
      'video/mp4', 
      'video/webm', 
      'video/ogg', 
      'video/quicktime', 
      'video/x-msvideo',
      'video/x-matroska', // MKV
      'video/mkv',        // MKV alternative MIME type
      'video/x-flv',      // FLV
      'video/3gpp',       // 3GP
      'video/mp2t',       // TS
      'video/x-ms-wmv'    // WMV
    ];
  }

  /**
   * Validate video file before upload
   */
  validateVideoFile(file) {
    // Check file size
    if (file.size > this.maxFileSize) {
      throw new Error(`El archivo es muy grande. Máximo permitido: ${this.maxFileSize / (1024 * 1024)}MB`);
    }

    // Check file type
    if (!this.allowedTypes.includes(file.type)) {
      throw new Error(`Tipo de archivo no permitido. Formatos aceptados: ${this.allowedTypes.join(', ')}`);
    }

    // Check file name
    if (!file.name) {
      throw new Error('El archivo no tiene nombre');
    }

    return true;
  }

  /**
   * Convert file to base64
   */
  async fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        // Remove data:video/mp4;base64, prefix
        const base64 = reader.result.split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  }

  /**
   * Upload sprint demo video directly to Firebase Storage
   * @param {File} file - Video file to upload
   * @param {Object} metadata - Sprint metadata
   * @returns {Promise<Object>} Upload result with Firebase Storage file info
   */
  async uploadSprintDemoVideo(file, metadata) {
    try {
      // Validate file
      this.validateVideoFile(file);

      // Show upload progress notification
      const progressNotification = this.showProgressNotification('Subiendo video...', 0);

      // Create unique filename
      const timestamp = Date.now();
      const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
      const finalFileName = `${metadata.projectId}_${metadata.sprintId}_${timestamp}_${sanitizedFileName}`;
      const filePath = `sprint-demos/${metadata.projectId}/${metadata.sprintId}/${finalFileName}`;

      // Create storage reference
      const storageReference = storageRef(storage, filePath);

      // Upload with resumable upload for large files
      const uploadTask = uploadBytesResumable(storageReference, file, {
        contentType: file.type,
        customMetadata: {
          sprintId: metadata.sprintId,
          projectId: metadata.projectId,
          originalFileName: file.name,
          title: metadata.title || `Sprint ${metadata.sprintId} Demo`,
          description: metadata.description || ''
        }
      });

      // Monitor upload progress
      const uploadResult = await new Promise((resolve, reject) => {
        uploadTask.on('state_changed',
          (snapshot) => {
            // Update progress
            const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 90; // Reserve 10% for metadata
            this.updateProgressNotification(progressNotification, 
              `Subiendo video... ${Math.round(progress)}%`, progress);
          },
          (error) => {
reject(error);
          },
          async () => {
            // Upload completed successfully
            try {
              const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
              resolve({
                filePath: filePath,
                downloadURL: downloadURL,
                fileName: finalFileName,
                originalFileName: file.name,
                size: file.size,
                contentType: file.type
              });
            } catch (error) {
              reject(error);
            }
          }
        );
      });

      // Update progress
      this.updateProgressNotification(progressNotification, 'Guardando metadatos...', 95);

      // Get current user email from localStorage or auth
      const userEmail = localStorage.getItem('userEmail') || 'unknown';

      // Save metadata directly to Firebase Realtime Database
      const videoRef = {
        fileId: uploadResult.filePath,
        filePath: uploadResult.filePath,
        fileName: uploadResult.fileName,
        originalFileName: uploadResult.originalFileName,
        downloadUrl: uploadResult.downloadURL,
        publicUrl: uploadResult.downloadURL,
        size: uploadResult.size,
        uploadedAt: new Date().toISOString(),
        uploadedBy: userEmail,
        path: uploadResult.filePath,
        title: metadata.title || `Sprint ${metadata.sprintId} Demo`,
        description: metadata.description || '',
        contentType: uploadResult.contentType
      };

      // Update the sprint card directly using its Firebase ID
      await dalService.cards.updateCard(metadata.projectId, 'sprint', metadata.firebaseId, {
        demoVideo: videoRef,
        lastUpdated: new Date().toISOString()
      });

      // Update progress
      this.updateProgressNotification(progressNotification, 'Video subido exitosamente', 100);

      const result = {
        success: true,
        video: videoRef,
        message: 'Video uploaded successfully to Firebase Storage'
      };
      
      // Hide notification after 3 seconds
      setTimeout(() => {
        progressNotification.remove();
      }, 3000);
// Show success message
      this.showSuccessMessage('Video subido exitosamente a Firebase Storage');
      
      return result;

    } catch (error) {
// Show error message
      this.showErrorMessage(`Error al subir video: ${error.message}`);
      
      throw error;
    }
  }

  /**
   * Delete sprint demo video from Firebase Storage
   * @param {string} sprintId - Sprint ID
   * @param {string} projectId - Project ID
   * @param {string} filePath - Firebase Storage file path
   * @returns {Promise<Object>} Delete result
   */
  async deleteSprintDemoVideo(sprintId, firebaseId, projectId, filePath) {
    try {
// Delete from Firebase Storage directly
      const storageReference = storageRef(storage, filePath);
      await deleteObject(storageReference);

      // Remove metadata from the sprint card directly using Firebase ID
      await dalService.cards.updateCard(projectId, 'sprint', firebaseId, {
        demoVideo: null,
        lastUpdated: new Date().toISOString()
      });

      const result = {
        success: true,
        message: 'Video deleted successfully from Firebase Storage'
      };
// Show success message
      this.showSuccessMessage('Video eliminado exitosamente');
      
      return result;

    } catch (error) {
// Show error message
      this.showErrorMessage(`Error al eliminar video: ${error.message}`);
      
      throw error;
    }
  }

  /**
   * Get video streaming URL from Firebase Storage
   * @param {string} filePath - Firebase Storage file path
   * @returns {Promise<Object>} Video URL and metadata
   */
  async getVideoUrl(filePath) {
    try {
      // Get direct URL from Firebase Storage
      const storageReference = storageRef(storage, filePath);
      const url = await getDownloadURL(storageReference);
      
      return {
        success: true,
        url: url,
        publicUrl: url,
        name: filePath.split('/').pop(),
        contentType: 'video/mp4' // Default, actual type is in metadata
      };
    } catch (error) {
throw error;
    }
  }

  /**
   * Create video player element
   * @param {string} videoUrl - Video URL
   * @param {Object} options - Player options
   * @returns {HTMLVideoElement} Video player element
   */
  createVideoPlayer(videoUrl, options = {}) {
    const video = document.createElement('video');
    video.src = videoUrl;
    video.controls = true;
    video.style.width = options.width || '100%';
    video.style.maxWidth = options.maxWidth || '800px';
    video.style.height = options.height || 'auto';
    video.style.borderRadius = '8px';
    video.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.1)';
    
    if (options.autoplay) video.autoplay = true;
    if (options.muted) video.muted = true;
    if (options.loop) video.loop = true;
    if (options.poster) video.poster = options.poster;
    
    return video;
  }

  /**
   * Create video upload interface
   * @param {Function} onUpload - Callback when video is uploaded
   * @returns {HTMLElement} Upload interface element
   */
  createUploadInterface(onUpload) {
    const container = document.createElement('div');
    container.className = 'video-upload-container';
    container.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 1rem;
      padding: 1rem;
      border: 2px dashed var(--border-default, #ccc);
      border-radius: 8px;
      background: var(--bg-secondary, #f8f9fa);
      min-height: 150px;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.3s ease;
    `;

    // File input (hidden)
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = this.allowedTypes.join(',');
    fileInput.style.display = 'none';

    // Upload icon and text
    container.innerHTML = `
      <div style="text-align: center;">
        <div style="font-size: 3rem;">📹</div>
        <div style="font-size: 1.2rem; font-weight: bold; margin: 0.5rem 0;">Subir Video de Demo</div>
        <div style="color: var(--text-muted, #666); font-size: 0.9rem;">
          Haz clic o arrastra el video aquí<br>
          Formatos: MP4, WebM, OGG, MOV, AVI, MKV, FLV, 3GP, TS, WMV<br>
          Tamaño máximo: 500MB
        </div>
      </div>
    `;

    // Hover effect
    container.addEventListener('mouseenter', () => {
      container.style.borderColor = '#6366f1';
      container.style.background = '#eef2ff';
    });

    container.addEventListener('mouseleave', () => {
      container.style.borderColor = '#ccc';
      container.style.background = '#f8f9fa';
    });

    // Click to upload
    container.addEventListener('click', () => {
      fileInput.click();
    });

    // Drag and drop support
    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      container.style.borderColor = '#10b981';
      container.style.background = '#ecfdf5';
    });

    container.addEventListener('dragleave', () => {
      container.style.borderColor = '#ccc';
      container.style.background = '#f8f9fa';
    });

    container.addEventListener('drop', (e) => {
      e.preventDefault();
      container.style.borderColor = '#ccc';
      container.style.background = '#f8f9fa';

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFileSelection(files[0]);
      }
    });

    // File selection handler
    const handleFileSelection = (file) => {
      try {
        this.validateVideoFile(file);
        
        // Show file preview
        container.innerHTML = `
          <div style="text-align: center;">
            <div style="font-size: 3rem;">🎬</div>
            <div style="font-size: 1.1rem; font-weight: bold;">${file.name}</div>
            <div style="color: var(--text-muted, #666); font-size: 0.9rem;">
              Tamaño: ${(file.size / (1024 * 1024)).toFixed(2)}MB<br>
              Tipo: ${file.type}
            </div>
            <button id="change-video-btn" style="margin-top: 1rem; padding: 0.5rem 1rem; background: var(--text-muted, #6c757d); color: var(--text-inverse, white); border: none; border-radius: 4px; cursor: pointer;">
              Cambiar video
            </button>
          </div>
        `;

        // Allow changing file
        document.getElementById('change-video-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          fileInput.click();
        });

        // Callback with selected file
        if (onUpload) {
          onUpload(file);
        }

      } catch (error) {
        this.showErrorMessage(error.message);
      }
    };

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        handleFileSelection(file);
      }
    });

    container.appendChild(fileInput);
    return container;
  }

  /**
   * Show progress notification
   */
  showProgressNotification(message, progress) {
    const notification = document.createElement('div');
    notification.className = 'video-upload-progress';
    notification.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: var(--bg-primary, white);
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      padding: 1rem;
      min-width: 300px;
      z-index: 10000;
    `;

    notification.innerHTML = `
      <div style="display: flex; align-items: center; gap: 1rem;">
        <div class="spinner" style="width: 24px; height: 24px; border: 3px solid var(--border-default, #f3f3f3); border-top: 3px solid var(--brand-primary, #6366f1); border-radius: 50%; animation: spin 1s linear infinite;"></div>
        <div style="flex: 1;">
          <div style="font-weight: bold;">${message}</div>
          <div style="margin-top: 0.5rem; height: 4px; background: var(--bg-tertiary, #e9ecef); border-radius: 2px; overflow: hidden;">
            <div style="height: 100%; width: ${progress}%; background: var(--brand-primary, #6366f1); transition: width 0.3s ease;"></div>
          </div>
        </div>
      </div>
      <style>
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    `;

    document.body.appendChild(notification);
    return notification;
  }

  /**
   * Update progress notification
   */
  updateProgressNotification(notification, message, progress) {
    const messageEl = notification.querySelector('div[style*="font-weight: bold"]');
    const progressBar = notification.querySelector('div[style*="background: #007bff"]');
    
    if (messageEl) messageEl.textContent = message;
    if (progressBar) progressBar.style.width = `${progress}%`;
    
    if (progress === 100) {
      const spinner = notification.querySelector('.spinner');
      if (spinner) {
        spinner.style.display = 'none';
      }
    }
  }

  /**
   * Show success message
   */
  showSuccessMessage(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: var(--color-success, #28a745);
      color: var(--text-inverse, white);
      padding: 1rem 1.5rem;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 10000;
      animation: slideIn 0.3s ease;
    `;
    toast.textContent = message;

    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  /**
   * Show error message
   */
  showErrorMessage(message) {
    const toast = document.createElement('div');
    toast.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: var(--color-error, #f43f5e);
      color: var(--text-inverse, white);
      padding: 1rem 1.5rem;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 10000;
      animation: slideIn 0.3s ease;
    `;
    toast.textContent = message;

    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 5000);
  }
}

// Export singleton instance
export const firebaseVideoService = new FirebaseVideoService();