import { LitElement, html } from 'https://cdn.jsdelivr.net/npm/lit@3.0.2/+esm';
import './FirebaseStorageUploader.js';
import { AppManagerStyles } from './app-manager-styles.js';
import { database, ref, set, get, push, runDbTransaction, auth, onValue } from '../../firebase-config.js';
import { toFirebaseKey } from '../utils/firebase-key-utils.js';
import { encodeEmailForFirebase } from '../utils/email-sanitizer.js';
import { flattenDownloadEvents, filterDownloadEvents, buildCountsByDate, buildRowsForCsv, buildCsv } from '../utils/download-stats-utils.js';

export class AppManager extends LitElement {
  static get properties() {
    return {
      projectId: { type: String },
      uploadedFiles: { type: Array },
      loading: { type: Boolean },
      isSuperAdmin: { type: Boolean },
      isAppAdmin: { type: Boolean },
      accessChecked: { type: Boolean },
      debugClaimStatus: { type: String },
      showFileTypeError: { type: Boolean },
      downloadEvents: { type: Object },
      selectedAppKey: { type: String },
      dateFrom: { type: String },
      dateTo: { type: String },
      viewMode: { type: String },
      // New properties for app metadata system
      userEmail: { type: String },
      isAppUploader: { type: Boolean },
      isReadOnlyUser: { type: Boolean },
      appMetadata: { type: Object },
      // Upload form state
      pendingUploadType: { type: String },
      pendingUploadChangelog: { type: String },
      isUploading: { type: Boolean },
      changelogError: { type: Boolean },
      selectedFile: { type: Object },
      // Beta access control (per-project)
      canSeeBeta: { type: Boolean }
    };
  }

  static get styles() {
    return AppManagerStyles;
  }

  constructor() {
    super();
    this.projectId = '';
    this.uploadedFiles = [];
    this.loading = false;
    this.isSuperAdmin = false;
    this.isAppAdmin = false;
    this.accessChecked = false;
    this.debugClaimStatus = 'Checking claim status...';
    this.showFileTypeError = false;
    this.downloadEvents = {};
    this.selectedAppKey = 'all';
    this.dateFrom = '';
    this.dateTo = '';
    this.viewMode = 'chart';
    this._statsUnsubscribe = null;
    this._eventsUnsubscribe = null;
    this._metadataUnsubscribe = null;
    this.handleAppAccessChange = this.handleAppAccessChange.bind(this);
    // New properties for app metadata system
    this.userEmail = '';
    this.isAppUploader = false;
    this.isReadOnlyUser = false;
    this.appMetadata = {};
    // Upload form state
    this.pendingUploadType = 'release';
    this.pendingUploadChangelog = '';
    this.isUploading = false;
    this.changelogError = false;
    this.selectedFile = null;
    // Beta access (per-project)
    this.canSeeBeta = false;
  }

  connectedCallback() {
    super.connectedCallback();

    // Get current project from URL
    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get('projectId');
    if (projectId) {
      this.projectId = projectId;
    }

    const initialAccess = window.isAppAdmin;
    if (typeof initialAccess === 'boolean') {
      this.isAppAdmin = initialAccess;
      this.accessChecked = true;
    }

    // Get user email from document body or auth
    this.userEmail = document.body.dataset.userEmail || auth?.currentUser?.email || '';

    // Check if user is app uploader for this project
    this._checkIfAppUploader();

    // Check if user is super admin (from env var)
    this._checkIfSuperAdmin();

    // Check beta access for this project
    this._checkBetaAccess();

    document.addEventListener('app-admin-status-changed', this.handleAppAccessChange);

    // Listen for Firebase uploader ready events
    this.addEventListener('firebase-uploader-ready', this._onUploaderReady.bind(this));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('app-admin-status-changed', this.handleAppAccessChange);
    if (this._statsUnsubscribe) this._statsUnsubscribe();
    if (this._eventsUnsubscribe) this._eventsUnsubscribe();
    if (this._metadataUnsubscribe) this._metadataUnsubscribe();
  }

  async handleAppAccessChange(event) {
    this.isAppAdmin = Boolean(event?.detail?.isAppAdmin);
    this.accessChecked = true;
    this.requestUpdate();
    // Load files for all users (readonly users included)
    // Wait for permission checks to complete before loading files
    // IMPORTANT: Sequential execution - _checkBetaAccess depends on isAppUploader
    if (this.projectId) {
      await this._checkIfAppUploader();
      await this._checkBetaAccess();
      this.loadFiles();
    }
  }

  _onUploaderReady(event) {
    const uploader = event.detail.uploader;
    this._configureUploader(uploader);
  }

  /**
   * Handle file selected from uploader
   */
  _onFileSelected(event) {
    const { file } = event.detail;
    this.selectedFile = file;
  }

  /**
   * Trigger upload after validating changelog
   */
  _triggerUpload() {
    // Validate changelog
    if (!this.pendingUploadChangelog?.trim()) {
      this.changelogError = true;
      this.showMessage('El changelog es obligatorio. Describe los cambios de esta versión.', 'error');
      return;
    }
    this.changelogError = false;

    // Get the uploader component and trigger upload
    const uploader = this.shadowRoot.querySelector('firebase-storage-uploader');
    if (uploader) {
      uploader.triggerUpload();
    }
  }

  /**
   * Format file size for display
   */
  _formatFileSize(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    while (bytes >= 1024 && i < units.length - 1) {
      bytes /= 1024;
      i++;
    }
    return `${bytes.toFixed(1)} ${units[i]}`;
  }

  /**
   * Handle upload start - show loading overlay
   */
  _onUploadStart() {
    this.isUploading = true;
  }

  // Override updated to load files when projectId changes
  async updated(changedProperties) {
    super.updated(changedProperties);

    // Re-check permissions when projectId changes and load files for all users
    // IMPORTANT: Sequential execution - _checkBetaAccess depends on isAppUploader
    if (changedProperties.has('projectId') && this.projectId) {
      await this._checkIfAppUploader();
      await this._checkBetaAccess();
      this.loadFiles();
    }

    // Re-check beta access when isAppAdmin changes
    if (changedProperties.has('isAppAdmin')) {
      await this._checkBetaAccess();
    }
  }

  async _configureUploader(uploader) {
    try {
      // Import Firebase config
      const { firebaseConfig } = await import('../../firebase-config.js');
      
      if (uploader && !uploader.firebaseConfig) {
        uploader.firebaseConfig = firebaseConfig;
uploader.requestUpdate();
      }
    } catch (error) {
      console.error('📱 Error configuring Firebase Storage Uploader:', error);
    }
  }

  async loadFiles() {
    if (!this.projectId) {
      return;
    }

    // Skip Storage access in demo mode (no Storage configured)
    const { demoModeService } = await import('../services/demo-mode-service.js');
    if (demoModeService.isDemo()) {
      this.files = [];
      this.loading = false;
      return;
    }

    // Verify user is authenticated before accessing Storage
    const { auth } = await import('../../firebase-config.js');
    if (!auth.currentUser) {
      this.files = [];
      this.loading = false;
      return;
    }

    // Determine if user is read-only (not admin and not uploader)
    this.isReadOnlyUser = !this.isAppAdmin && !this.isAppUploader;

    this.loading = true;

    try {
      // Load app metadata first
      await this._loadAppMetadata();

      // Import Firebase storage and functions from the app's firebase config
      const { storage } = await import('../../firebase-config.js');
      const { ref: storageRef, listAll, getDownloadURL, getMetadata } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js');

      const storagePath = `apps/${this.projectId}`;
      const appsRef = storageRef(storage, storagePath);
      const result = await listAll(appsRef);
      const files = [];

      for (const itemRef of result.items) {
        try {
          const [downloadURL, metadata] = await Promise.all([
            getDownloadURL(itemRef),
            getMetadata(itemRef)
          ]);

          files.push({
            name: itemRef.name,
            url: downloadURL,
            size: this.formatFileSize(metadata.size),
            sizeBytes: metadata.size,
            uploadDate: new Date(metadata.timeCreated).toLocaleDateString('es-ES'),
            uploadedAt: metadata.timeCreated,
            fullPath: itemRef.fullPath,
            ref: itemRef
          });
        } catch (error) {
          // Skip files that can't be accessed
        }
      }

      let downloadStats = {};
      try {
        const statsSnap = await get(ref(database, `/appDownloads/${this.projectId}`));
        downloadStats = statsSnap.exists() ? statsSnap.val() || {} : {};
      } catch (error) {
        // Ignore stats loading errors
      }

      let downloadEvents = {};
      try {
        const eventsSnap = await get(ref(database, `/appDownloadEvents/${this.projectId}`));
        downloadEvents = eventsSnap.exists() ? eventsSnap.val() || {} : {};
      } catch (error) {
        // Ignore events loading errors
      }

      // Map files with stats and filter by visibility
      const allFiles = files
        .map((file) => {
          const key = toFirebaseKey(file.name);
          const stats = downloadStats?.[key] || {};
          return {
            ...file,
            downloadCount: Number(stats.count) || 0,
            fileKey: key
          };
        })
        .sort((a, b) => new Date(b.uploadedAt || b.uploadDate) - new Date(a.uploadedAt || a.uploadDate));

      // Filter files based on user permissions and app status
      this.uploadedFiles = allFiles.filter((file) => {
        const metadata = this._getEffectiveMetadata(file);
        return this._canUserSeeApp(metadata);
      });

      this.downloadEvents = downloadEvents;
      this._subscribeToDownloadStats();

    } catch (error) {
      this.showMessage('Error al cargar los archivos', 'error');
    } finally {
      this.loading = false;
    }
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  async downloadFile(file) {
    try {
      await this._trackDownload(file, 'app');

      // Create a temporary link to trigger download
      const link = document.createElement('a');
      link.href = file.url;
      link.download = file.name;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
} catch (error) {
this.showMessage('Error al descargar el archivo', 'error');
    }
  }

  async _trackDownload(file, source = 'admin') {
    if (!this.projectId || !file?.name) {
      return;
    }

    try {
      const fileKey = toFirebaseKey(file.name);
      const statsRef = ref(database, `/appDownloads/${this.projectId}/${fileKey}`);
      await runDbTransaction(statsRef, (current) => {
        const next = current && typeof current === 'object' ? { ...current } : {};
        next.count = (Number(next.count) || 0) + 1;
        next.fileName = file.name;
        next.lastDownloadedAt = new Date().toISOString();
        next.lastSource = source;
        return next;
      });

      const eventData = {
        downloadedAt: new Date().toISOString(),
        fileName: file.name,
        source,
        downloadedBy: source === 'app' ? (this.userEmail || auth?.currentUser?.email || null) : null
      };
      const eventRef = push(ref(database, `/appDownloadEvents/${this.projectId}/${fileKey}`));
      await set(eventRef, eventData);

      this._applyDownloadEvent(fileKey, eventRef.key, eventData);
    } catch (error) {
      // Silently ignore download tracking errors
    }
  }

  _subscribeToDownloadStats() {
    if (!this.projectId) return;
    if (this._statsUnsubscribe) this._statsUnsubscribe();
    if (this._eventsUnsubscribe) this._eventsUnsubscribe();

    this._statsUnsubscribe = onValue(ref(database, `/appDownloads/${this.projectId}`), (snapshot) => {
      const stats = snapshot.exists() ? snapshot.val() || {} : {};
      if (!Array.isArray(this.uploadedFiles)) return;
      this.uploadedFiles = this.uploadedFiles.map((file) => {
        const fileStats = stats?.[file.fileKey] || {};
        return {
          ...file,
          downloadCount: Number(fileStats.count) || 0
        };
      });
    });

    this._eventsUnsubscribe = onValue(ref(database, `/appDownloadEvents/${this.projectId}`), (snapshot) => {
      this.downloadEvents = snapshot.exists() ? snapshot.val() || {} : {};
    });
  }

  /**
   * Check if current user is an app uploader for this project
   * Checks /data/appUploaders/{projectId}/{encodedEmail}
   */
  async _checkIfAppUploader() {
    if (!this.projectId || !this.userEmail) {
      this.isAppUploader = false;
      return;
    }

    try {
      const encodedEmail = encodeEmailForFirebase(this.userEmail.toLowerCase().trim());

      // Check new /users/ path first
      const usersPermRef = ref(database, `/users/${encodedEmail}/projects/${this.projectId}/appPermissions/upload`);
      const usersSnap = await get(usersPermRef);
      if (usersSnap.exists() && usersSnap.val() === true) {
        this.isAppUploader = true;
        return;
      }

      // Fallback to legacy path
      const uploaderRef = ref(database, `/data/appUploaders/${this.projectId}/${encodedEmail}`);
      const snapshot = await get(uploaderRef);
      this.isAppUploader = snapshot.exists() && snapshot.val() === true;
    } catch (error) {
      this.isAppUploader = false;
    }
  }

  /**
   * Check if current user is a super admin (from env var only)
   * If superAdmin, ensure they are added to appAdmins for Storage rules
   */
  async _checkIfSuperAdmin() {
    if (!this.userEmail) {
      this.isSuperAdmin = false;
      return;
    }

    try {
      const { superAdminEmail } = await import('../../firebase-config.js');
      const envSuperAdmin = (superAdminEmail || '').toString().trim().toLowerCase();
      const currentUserEmail = this.userEmail.toLowerCase().trim();

      this.isSuperAdmin = envSuperAdmin && currentUserEmail === envSuperAdmin;

      // If superAdmin, ensure they are in appAdmins for Storage rules
      if (this.isSuperAdmin) {
        await this._ensureSuperAdminInAppAdmins();
      }
    } catch (error) {
      this.isSuperAdmin = false;
    }
  }

  /**
   * Ensure superAdmin is added to appAdmins in Firebase
   * This is needed because Storage rules can't read env vars
   */
  async _ensureSuperAdminInAppAdmins() {
    try {
      const encodedEmail = encodeEmailForFirebase(this.userEmail.toLowerCase().trim());
      const appAdminRef = ref(database, `/data/appAdmins/${encodedEmail}`);
      const snapshot = await get(appAdminRef);

      if (!snapshot.exists()) {
        await set(appAdminRef, true);
        // Also set isAppAdmin since we just added them
        this.isAppAdmin = true;
      }
    } catch (error) {
      console.warn('[AppManager] Could not auto-add superAdmin to appAdmins:', error.message);
    }
  }

  /**
   * Check if current user can see beta versions for this project
   * AppAdmins and AppUploaders can always see beta. Other users need to be in /data/betaUsers/{projectId}/{encodedEmail}
   */
  async _checkBetaAccess() {
    // AppAdmins (Approvers) can always see beta versions
    if (this.isAppAdmin) {
      this.canSeeBeta = true;
      return;
    }

    // AppUploaders can always see beta versions (they upload them)
    if (this.isAppUploader) {
      this.canSeeBeta = true;
      return;
    }

    if (!this.projectId || !this.userEmail) {
      this.canSeeBeta = false;
      return;
    }

    try {
      const encodedEmail = encodeEmailForFirebase(this.userEmail.toLowerCase().trim());

      // Check new /users/ path first
      const usersPermRef = ref(database, `/users/${encodedEmail}/projects/${this.projectId}/appPermissions/view`);
      const usersSnap = await get(usersPermRef);
      if (usersSnap.exists() && usersSnap.val() === true) {
        this.canSeeBeta = true;
        return;
      }

      // Fallback to legacy path
      const betaUserRef = ref(database, `/data/betaUsers/${this.projectId}/${encodedEmail}`);
      const snapshot = await get(betaUserRef);
      this.canSeeBeta = snapshot.exists() && snapshot.val() === true;
    } catch (error) {
      this.canSeeBeta = false;
    }
  }

  /**
   * Load app metadata from Firebase
   */
  async _loadAppMetadata() {
    if (!this.projectId) return;

    try {
      const metadataSnap = await get(ref(database, `/appMetadata/${this.projectId}`));
      this.appMetadata = metadataSnap.exists() ? metadataSnap.val() : {};
    } catch (error) {
      this.appMetadata = {};
    }

    // Subscribe to real-time updates
    this._subscribeToMetadata();
  }

  /**
   * Subscribe to metadata changes in real-time
   */
  _subscribeToMetadata() {
    if (!this.projectId) return;
    if (this._metadataUnsubscribe) this._metadataUnsubscribe();

    this._metadataUnsubscribe = onValue(ref(database, `/appMetadata/${this.projectId}`), (snapshot) => {
      this.appMetadata = snapshot.exists() ? snapshot.val() : {};
    });
  }

  /**
   * Save app metadata to Firebase
   * @param {string} fileKey - The file key (normalized file name)
   * @param {Object} metadata - The metadata to save
   */
  async _saveAppMetadata(fileKey, metadata) {
    if (!this.projectId || !fileKey) return;

    try {
      await set(ref(database, `/appMetadata/${this.projectId}/${fileKey}`), metadata);
    } catch (error) {
      console.error('Error saving app metadata:', error);
      throw error;
    }
  }

  /**
   * Ensure app metadata exists, creating default metadata for legacy apps if needed
   * @param {string} fileKey - The file key to check
   * @returns {Promise<Object|null>} - The metadata (existing or newly created), or null if file not found
   */
  async _ensureAppMetadata(fileKey) {
    // If metadata already exists, return it
    if (this.appMetadata?.[fileKey]) {
      return this.appMetadata[fileKey];
    }

    // Find the file in uploadedFiles to get file info
    const file = this.uploadedFiles?.find(f => f.fileKey === fileKey);
    if (!file) {
      return null;
    }

    // Create default metadata for legacy apps (retrocompatibility)
    const defaultMetadata = {
      fileName: file.name,
      type: 'release',
      status: 'approved',
      changelog: null,
      uploadedBy: null,
      uploadedAt: file.uploadedAt || null,
      approvedBy: null,
      approvedAt: null,
      deprecatedBy: null,
      deprecatedAt: null
    };

    // Save to Firebase
    await this._saveAppMetadata(fileKey, defaultMetadata);

    // Update local cache
    this.appMetadata = {
      ...this.appMetadata,
      [fileKey]: defaultMetadata
    };

    return defaultMetadata;
  }

  /**
   * Get effective metadata for a file (with defaults for retrocompatibility)
   * Apps without metadata are treated as: type=release, status=approved
   * @param {Object} file - The file object with fileKey
   * @returns {Object} - The effective metadata
   */
  _getEffectiveMetadata(file) {
    const storedMetadata = this.appMetadata?.[file.fileKey];

    if (storedMetadata) {
      return storedMetadata;
    }

    // Default metadata for legacy apps (retrocompatibility)
    return {
      fileName: file.name,
      type: 'release',
      status: 'approved',
      changelog: null,
      uploadedBy: null,
      uploadedAt: file.uploadedAt || null,
      approvedBy: null,
      approvedAt: null,
      deprecatedBy: null,
      deprecatedAt: null
    };
  }

  /**
   * Check if user can see this app based on metadata and permissions
   * @param {Object} metadata - The app metadata
   * @returns {boolean} - Whether user can see this app
   */
  _canUserSeeApp(metadata) {
    // Super admin / app admin can see everything
    if (this.isAppAdmin) {
      return true;
    }

    // Beta and Admin versions: only visible to users with beta access
    // (same visibility rules for both types)
    if (metadata.type === 'beta' || metadata.type === 'admin') {
      if (!this.canSeeBeta) {
        return false;
      }
      // If user has beta access, still check status below
    }

    // Approved apps are visible to everyone with access
    if (metadata.status === 'approved') {
      return true;
    }

    // Pending apps: only visible to the uploader (developer who uploaded)
    if (metadata.status === 'pending') {
      return this.userEmail && metadata.uploadedBy &&
        this.userEmail.toLowerCase() === metadata.uploadedBy.toLowerCase();
    }

    // Deprecated apps: only visible to admin (handled above)
    return false;
  }

  /**
   * Check if user can perform admin actions on apps
   * @returns {boolean}
   */
  _canPerformAdminActions() {
    return this.isAppAdmin;
  }

  /**
   * Check if user can upload apps (admin or uploader)
   * @returns {boolean}
   */
  _canUploadApps() {
    return this.isAppAdmin || this.isAppUploader;
  }

  /**
   * Approve a pending app (admin only)
   * @param {string} fileKey - The file key to approve
   */
  async _approveApp(fileKey) {
    if (!this.isAppAdmin) {
      this.showMessage('Solo los administradores pueden aprobar apps', 'error');
      return;
    }

    try {
      // Ensure metadata exists (creates default for legacy apps)
      const currentMetadata = await this._ensureAppMetadata(fileKey);
      if (!currentMetadata) {
        this.showMessage('No se encontró la app', 'error');
        return;
      }

      const updatedMetadata = {
        ...currentMetadata,
        status: 'approved',
        approvedBy: this.userEmail || auth?.currentUser?.email || 'unknown',
        approvedAt: new Date().toISOString()
      };

      await this._saveAppMetadata(fileKey, updatedMetadata);
      this.showMessage('App aprobada correctamente', 'success');
    } catch (error) {
      console.error('Error approving app:', error);
      this.showMessage('Error al aprobar la app', 'error');
    }
  }

  /**
   * Deprecate an approved app (admin only)
   * @param {string} fileKey - The file key to deprecate
   */
  async _deprecateApp(fileKey) {
    if (!this.isAppAdmin) {
      this.showMessage('Solo los administradores pueden descatalogar apps', 'error');
      return;
    }

    const confirmed = await this.showConfirmModal(
      'Descatalogar aplicación',
      '¿Estás seguro de que quieres descatalogar esta app? Los usuarios no podrán descargarla.',
      'Descatalogar'
    );

    if (!confirmed) return;

    try {
      // Ensure metadata exists (creates default for legacy apps)
      const currentMetadata = await this._ensureAppMetadata(fileKey);
      if (!currentMetadata) {
        this.showMessage('No se encontró la app', 'error');
        return;
      }

      const updatedMetadata = {
        ...currentMetadata,
        status: 'deprecated',
        deprecatedBy: this.userEmail || auth?.currentUser?.email || 'unknown',
        deprecatedAt: new Date().toISOString()
      };

      await this._saveAppMetadata(fileKey, updatedMetadata);
      this.showMessage('App descatalogada correctamente', 'success');
    } catch (error) {
      console.error('Error deprecating app:', error);
      this.showMessage('Error al descatalogar la app', 'error');
    }
  }

  /**
   * Restore a deprecated app (admin only)
   * @param {string} fileKey - The file key to restore
   */
  async _restoreApp(fileKey) {
    if (!this.isAppAdmin) {
      this.showMessage('Solo los administradores pueden restaurar apps', 'error');
      return;
    }

    try {
      // Ensure metadata exists (creates default for legacy apps)
      const currentMetadata = await this._ensureAppMetadata(fileKey);
      if (!currentMetadata) {
        this.showMessage('No se encontró la app', 'error');
        return;
      }

      const updatedMetadata = {
        ...currentMetadata,
        status: 'approved',
        deprecatedBy: null,
        deprecatedAt: null
      };

      await this._saveAppMetadata(fileKey, updatedMetadata);
      this.showMessage('App restaurada correctamente', 'success');
    } catch (error) {
      console.error('Error restoring app:', error);
      this.showMessage('Error al restaurar la app', 'error');
    }
  }

  async deleteFile(file) {
    // Show confirmation modal
    const confirmed = await this.showConfirmModal(
      'Eliminar archivo',
      `¿Estás seguro de que quieres eliminar "${file.name}"?`
    );
    
    if (!confirmed) {
      return;
    }

    try {
      // Import Firebase storage functions
      const { storage } = await import('../../firebase-config.js');
      const { ref, deleteObject } = await import('https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js');
      
      // Create reference to the file
      const fileRef = ref(storage, file.fullPath);
      
      // Delete the file
      await deleteObject(fileRef);
      
      // Reload the files list to get fresh data from Firebase
      await this.loadFiles();
      
      this.showMessage('Archivo eliminado correctamente', 'success');
} catch (error) {
this.showMessage('Error al eliminar el archivo', 'error');
    }
  }

  async onFileUploaded(event) {
    // FirebaseStorageUploader sends 'filename' and 'url', not 'fileName' and 'downloadURL'
    const { filename } = event.detail;
    const fileName = filename;
    // Hide loading overlay and error messages
    this.isUploading = false;
    this.showFileTypeError = false;

    // Save app metadata
    try {
      const fileKey = toFirebaseKey(fileName);
      const now = new Date().toISOString();

      // All uploads start as pending - requires approval from appAdmin
      const metadata = {
        fileName,
        type: this.pendingUploadType || 'release',
        status: 'pending',
        changelog: this.pendingUploadChangelog?.trim() || null,
        uploadedBy: this.userEmail || auth?.currentUser?.email || 'unknown',
        uploadedAt: now,
        approvedBy: null,
        approvedAt: null,
        deprecatedBy: null,
        deprecatedAt: null
      };

      await this._saveAppMetadata(fileKey, metadata);

      // Reset form fields
      this.pendingUploadType = 'release';
      this.pendingUploadChangelog = '';
      this.selectedFile = null;
    } catch (error) {
      console.error('Error saving app metadata:', error);
      // Continue anyway - the file was uploaded successfully
    }

    // Reset the uploader component and hide file display elements
    const uploader = this.shadowRoot.querySelector('firebase-storage-uploader');
    if (uploader) {
      if (uploader.resetUploader) {
        uploader.resetUploader();
      }

      // Hide any file display elements in the uploader
      setTimeout(() => {
        if (uploader.shadowRoot) {
          // Hide delete buttons
          const deleteButtons = uploader.shadowRoot.querySelectorAll('.delete-file-btn');
          deleteButtons?.forEach(btn => {
            btn.style.display = 'none';
          });

          // Hide uploaded file display container
          const fileDisplays = uploader.shadowRoot.querySelectorAll('.uploaded-file, .file-display, .file-preview, .icon, .thumbnail-wrapper');
          fileDisplays?.forEach(element => {
            element.style.display = 'none';
          });

          // Hide any links to uploaded files
          const fileLinks = uploader.shadowRoot.querySelectorAll('a[href*="storage.googleapis.com"]');
          fileLinks?.forEach(link => {
            link.style.display = 'none';
          });
        }
      }, 100);
    }

    // Reload the files list to show the new file
    this.loadFiles();

    this.showMessage(`Archivo "${fileName}" subido. Pendiente de aprobación.`, 'success');
  }

  onUploadError(event) {
    const { error } = event.detail;
    // Hide loading overlay
    this.isUploading = false;
    // Show file type error if it's a file type issue
    if (error && error.includes && (error.includes('tipo') || error.includes('format'))) {
      this.showFileTypeError = true;
    }

    this.showMessage('Error al subir el archivo', 'error');
  }

  showMessage(message, type = 'info') {
    // Dispatch slide notification event
    document.dispatchEvent(new CustomEvent('show-slide-notification', {
      detail: {
        options: {
          message,
          type: type === 'success' ? 'success' : 'error'
        }
      }
    }));
  }

  async showConfirmModal(title, message, confirmText = 'Eliminar') {
    return new Promise((resolve) => {
      // Create modal dialog
      const dialog = document.createElement('dialog');
      dialog.style.cssText = `
        border: none;
        border-radius: 8px;
        padding: 0;
        max-width: 400px;
        width: 90%;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
      `;

      dialog.innerHTML = `
        <div style="padding: 1.5rem;">
          <h3 style="margin: 0 0 1rem 0; color: #333; font-size: 1.2rem;">${title}</h3>
          <p style="margin: 0 0 1.5rem 0; color: #666; line-height: 1.4;">${message}</p>
          <div style="display: flex; gap: 0.5rem; justify-content: flex-end;">
            <button class="cancel-btn" style="
              padding: 0.5rem 1rem;
              background: #6c757d;
              color: white;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              font-size: 0.9rem;
            ">Cancelar</button>
            <button class="confirm-btn" style="
              padding: 0.5rem 1rem;
              background: #dc3545;
              color: white;
              border: none;
              border-radius: 4px;
              cursor: pointer;
              font-size: 0.9rem;
            ">${confirmText}</button>
          </div>
        </div>
      `;

      // Event handlers
      const cancelBtn = dialog.querySelector('.cancel-btn');
      const confirmBtn = dialog.querySelector('.confirm-btn');

      cancelBtn.addEventListener('click', () => {
        dialog.close();
        resolve(false);
      });

      confirmBtn.addEventListener('click', () => {
        dialog.close();
        resolve(true);
      });

      dialog.addEventListener('close', () => {
        document.body.removeChild(dialog);
      });

      // Show modal
      document.body.appendChild(dialog);
      dialog.showModal();
    });
  }

  async createShareLink(file) {
    if (!file || !file.url) {
      this.showMessage('No se pudo generar el enlace para este archivo', 'error');
      return;
    }

    const password = await this._promptForSharePassword(file.name);
    if (!password) {
      return;
    }

    try {
      const shareId = this._generateShareId();
      const salt = this._generateSalt();
      const passwordHash = await this._hashPassword(password, salt);
      const creator = auth?.currentUser?.email || 'unknown';

      const shareData = {
        shareId,
        projectId: this.projectId,
        fileName: file.name,
        sizeLabel: file.size || '',
        sizeBytes: file.sizeBytes ?? null,
        downloadURL: file.url,
        storagePath: file.fullPath,
        createdAt: new Date().toISOString(),
        createdBy: creator,
        uploadedAt: file.uploadedAt || null,
        salt,
        passwordHash,
        requiresPassword: true
      };

      await set(ref(database, `/publicAppShares/${shareId}`), shareData);

      const shareLink = `${window.location.origin}/app-share?shareId=${shareId}`;
      await this._copyToClipboard(shareLink);

      this.showMessage('Link protegido generado y copiado al portapapeles', 'success');
} catch (error) {
this.showMessage('No se pudo generar el link compartido', 'error');
    }
  }

  _promptForSharePassword(fileName) {
    return new Promise((resolve) => {
      const dialog = document.createElement('dialog');
      dialog.style.cssText = `
        border: none;
        border-radius: 8px;
        padding: 0;
        width: 95%;
        max-width: 420px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.25);
      `;

      dialog.innerHTML = `
        <form method="dialog" class="share-password-form" style="padding: 1.5rem; display:flex; flex-direction:column; gap:1rem;">
          <div>
            <h3 style="margin:0 0 0.5rem 0;">Proteger descarga</h3>
            <p style="margin:0; color:#555;">Configura una contraseña para compartir <strong>${fileName}</strong>.</p>
          </div>
          <label style="display:flex; flex-direction:column; gap:0.25rem; font-size:0.9rem;">
            Contraseña
            <input type="password" id="sharePasswordInput" required minlength="4" style="padding:0.5rem; border:1px solid #ccc; border-radius:4px;">
          </label>
          <label style="display:flex; flex-direction:column; gap:0.25rem; font-size:0.9rem;">
            Confirmar contraseña
            <input type="password" id="sharePasswordConfirm" required minlength="4" style="padding:0.5rem; border:1px solid #ccc; border-radius:4px;">
          </label>
          <p class="dialog-error" style="color:#dc3545; margin:0; display:none;"></p>
          <div style="display:flex; justify-content:flex-end; gap:0.5rem;">
            <button type="button" class="cancel-btn" style="padding:0.5rem 1rem; background:#6c757d; color:#fff; border:none; border-radius:4px; cursor:pointer;">Cancelar</button>
            <button type="submit" class="confirm-btn" style="padding:0.5rem 1rem; background:#198754; color:#fff; border:none; border-radius:4px; cursor:pointer;">Generar link</button>
          </div>
        </form>
      `;

      const form = dialog.querySelector('form');
      const passwordInput = dialog.querySelector('#sharePasswordInput');
      const confirmInput = dialog.querySelector('#sharePasswordConfirm');
      const cancelBtn = dialog.querySelector('.cancel-btn');
      const errorEl = dialog.querySelector('.dialog-error');

      const cleanup = (value) => {
        dialog.close();
        if (document.body.contains(dialog)) {
          document.body.removeChild(dialog);
        }
        resolve(value);
      };

      cancelBtn.addEventListener('click', () => cleanup(null));

      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const password = passwordInput.value.trim();
        const confirmPassword = confirmInput.value.trim();

        if (password.length < 4) {
          errorEl.textContent = 'La contraseña debe tener al menos 4 caracteres.';
          errorEl.style.display = 'block';
          return;
        }

        if (password !== confirmPassword) {
          errorEl.textContent = 'Las contraseñas no coinciden.';
          errorEl.style.display = 'block';
          return;
        }

        cleanup(password);
      });

      dialog.addEventListener('close', () => {
        if (document.body.contains(dialog)) {
          document.body.removeChild(dialog);
        }
      });

      document.body.appendChild(dialog);
      dialog.showModal();
      passwordInput.focus();
    });
  }

  _generateShareId() {
    if (crypto?.randomUUID) {
      return crypto.randomUUID().replace(/-/g, '');
    }
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  _generateSalt(length = 16) {
    const array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async _hashPassword(password, salt) {
    const encoder = new TextEncoder();
    const data = encoder.encode(`${salt}:${password}`);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async _copyToClipboard(text) {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const tempInput = document.createElement('input');
    tempInput.value = text;
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand('copy');
    document.body.removeChild(tempInput);
  }

  /**
   * Render read-only view for regular users (no admin/developer permissions)
   */
  _renderReadOnlyView() {
    return html`
      <div class="app-layout readonly-mode">
        <div class="files-column full-width">
          <div class="app-section">
            <h3 class="section-title">📱 Aplicaciones Disponibles</h3>
            <div class="files-list">
              ${this.loading ? html`
                <div class="loading">
                  <div class="spinner"></div>
                  Cargando aplicaciones...
                </div>
              ` : this.uploadedFiles.length === 0 ? html`
                <div class="no-files">
                  No hay aplicaciones disponibles para este proyecto
                </div>
              ` : html`
                ${this._renderAppsListReadOnly()}
              `}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render the list of apps for read-only users
   * Groups apps by type (release, beta, admin) with latest version highlighted
   */
  _renderAppsListReadOnly() {
    // Filter only approved apps for readonly users
    const approvedApps = this.uploadedFiles.filter(file => {
      const metadata = this._getEffectiveMetadata(file);
      return metadata.status === 'approved';
    });

    if (approvedApps.length === 0) {
      return html`<div class="no-files">No hay aplicaciones disponibles</div>`;
    }

    // Sort apps by date (most recent first)
    const sortedApps = [...approvedApps].sort((a, b) =>
      new Date(b.uploadedAt || b.uploadDate) - new Date(a.uploadedAt || a.uploadDate)
    );

    // Group apps by type
    const releaseApps = sortedApps.filter(f => this._getEffectiveMetadata(f).type === 'release');
    const betaApps = sortedApps.filter(f => this._getEffectiveMetadata(f).type === 'beta');
    const adminApps = sortedApps.filter(f => this._getEffectiveMetadata(f).type === 'admin');

    // Get latest version of each type
    const latestRelease = releaseApps[0];
    const latestBeta = betaApps[0];
    const latestAdmin = adminApps[0];

    // Other versions (excluding latest)
    const otherReleases = releaseApps.slice(1);
    const otherBetas = betaApps.slice(1);
    const otherAdmins = adminApps.slice(1);

    return html`
      <!-- RELEASE BLOCK -->
      ${latestRelease ? html`
        <div class="app-type-block release-block">
          <div class="block-header">
            <span class="block-title">🚀 Release</span>
          </div>
          ${this._renderLatestVersion(latestRelease, 'release', true)}
          ${otherReleases.length > 0 ? this._renderOtherVersions(otherReleases, 'release') : ''}
        </div>
      ` : ''}

      <!-- BETA BLOCK - Only for users with beta access -->
      ${this.canSeeBeta && betaApps.length > 0 ? html`
        <div class="app-type-block beta-block">
          <div class="block-header">
            <span class="block-title">🧪 Beta</span>
          </div>
          ${latestBeta ? this._renderLatestVersion(latestBeta, 'beta', false) : ''}
          ${otherBetas.length > 0 ? this._renderOtherVersions(otherBetas, 'beta') : ''}
        </div>
      ` : ''}

      <!-- ADMIN BLOCK - Only for users with beta access -->
      ${this.canSeeBeta && adminApps.length > 0 ? html`
        <div class="app-type-block admin-block">
          <div class="block-header">
            <span class="block-title">🔐 Admin</span>
          </div>
          ${latestAdmin ? this._renderLatestVersion(latestAdmin, 'admin', false) : ''}
          ${otherAdmins.length > 0 ? this._renderOtherVersions(otherAdmins, 'admin') : ''}
        </div>
      ` : ''}
    `;
  }

  /**
   * Render the latest/highlighted version of a type
   */
  _renderLatestVersion(file, type, isRecommended) {
    const metadata = this._getEffectiveMetadata(file);

    return html`
      <div class="latest-version ${isRecommended ? 'recommended' : ''}">
        ${isRecommended ? html`
          <div class="recommended-badge">✨ Versión Recomendada</div>
        ` : html`
          <div class="latest-badge">📌 Última versión</div>
        `}
        <div class="version-content">
          <div class="version-main-info">
            <div class="version-title">
              <span class="app-icon">📱</span>
              <span class="app-name">${file.name}</span>
            </div>
            <div class="version-meta">
              <span>📅 ${file.uploadDate}</span>
              <span>📏 ${file.size}</span>
              ${this._renderDownloadCount(file)}
            </div>
          </div>
          <div class="version-actions">
            <button
              class="info-btn"
              @click="${() => this._showChangelogModal(file, metadata)}"
              title="Ver información y changelog"
            >
              ℹ️ Info
            </button>
            <button
              class="download-btn ${isRecommended ? 'primary' : ''}"
              @click="${() => this.downloadFile(file)}"
              title="Descargar"
            >
              ⬇️ Descargar
            </button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render collapsible list of other versions
   */
  _renderOtherVersions(versions, type) {
    const typeLabels = {
      release: 'releases',
      beta: 'betas',
      admin: 'versiones admin'
    };

    return html`
      <div class="other-versions">
        <details>
          <summary class="other-versions-header">
            <span>📦 Otras ${typeLabels[type]} (${versions.length})</span>
          </summary>
          <div class="other-versions-list">
            ${versions.map(version => {
              const versionMetadata = this._getEffectiveMetadata(version);
              return html`
                <div class="other-version-item">
                  <div class="version-info">
                    <span class="version-name">${version.name}</span>
                    <span class="version-date">${version.uploadDate}</span>
                    <span class="version-size">${version.size}</span>
                    ${this._renderDownloadCount(version, true)}
                  </div>
                  <div class="version-actions">
                    <button
                      class="info-btn small"
                      @click="${() => this._showChangelogModal(version, versionMetadata)}"
                      title="Ver changelog"
                    >
                      ℹ️
                    </button>
                    <button
                      class="download-btn small"
                      @click="${() => this.downloadFile(version)}"
                      title="Descargar"
                    >
                      ⬇️
                    </button>
                  </div>
                </div>
              `;
            })}
          </div>
        </details>
      </div>
    `;
  }

  /**
   * Render download count with tooltip trigger
   */
  _renderDownloadCount(file, isSmall = false) {
    const count = file.downloadCount || 0;
    const fileEvents = this.downloadEvents?.[file.fileKey] || {};
    const hasEvents = Object.keys(fileEvents).length > 0;

    if (hasEvents) {
      return html`
        <span
          class="download-count ${isSmall ? 'small' : ''} clickable"
          @click="${(e) => this._toggleDownloadHistoryTooltip(e, file)}"
        >
          ⬇️ ${count} 📊
        </span>
      `;
    }

    return html`
      <span class="download-count ${isSmall ? 'small' : ''}">
        ⬇️ ${count}
      </span>
    `;
  }

  /**
   * Toggle tooltip visibility on click
   */
  _toggleDownloadHistoryTooltip(event, file) {
    event.stopPropagation();

    // If clicking on the same element and tooltip is open, close it
    if (this._currentTooltip && this._currentTooltipFile === file.fileKey) {
      this._hideDownloadHistoryTooltip();
      return;
    }

    this._showDownloadHistoryTooltip(event, file);
    this._currentTooltipFile = file.fileKey;
  }

  /**
   * Show tooltip with download history
   */
  _showDownloadHistoryTooltip(event, file) {
    // Remove existing tooltip
    this._hideDownloadHistoryTooltip();

    // Add click outside listener to close tooltip
    this._closeTooltipHandler = (e) => {
      if (this._currentTooltip && !this._currentTooltip.contains(e.target)) {
        this._hideDownloadHistoryTooltip();
      }
    };
    setTimeout(() => {
      document.addEventListener('click', this._closeTooltipHandler);
    }, 10);

    const fileEvents = this.downloadEvents?.[file.fileKey] || {};
    const eventsList = Object.values(fileEvents)
      .sort((a, b) => new Date(b.downloadedAt) - new Date(a.downloadedAt))
      .slice(0, 20); // Limit to 20 most recent

    if (eventsList.length === 0) return;

    const tooltip = document.createElement('div');
    tooltip.innerHTML = `
      <style>
        .download-history-tooltip {
          background: #fff;
          border-radius: 8px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.25);
          min-width: 280px;
          max-width: 400px;
          overflow: hidden;
          font-family: system-ui, -apple-system, sans-serif;
        }
        .tooltip-header {
          background: linear-gradient(135deg, #1565c0 0%, #1976d2 100%);
          color: #fff;
          padding: 0.6rem 1rem;
          font-weight: 600;
          font-size: 0.9rem;
        }
        .tooltip-content {
          max-height: 300px;
          overflow-y: auto;
        }
        .tooltip-row {
          display: flex;
          justify-content: space-between;
          padding: 0.5rem 1rem;
          border-bottom: 1px solid #f0f0f0;
          font-size: 0.85rem;
        }
        .tooltip-row:last-child {
          border-bottom: none;
        }
        .tooltip-row:hover {
          background: #f5f5f5;
        }
        .tooltip-user {
          color: #333;
          font-weight: 500;
          max-width: 180px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .tooltip-date {
          color: #666;
          font-size: 0.8rem;
        }
        .tooltip-more {
          padding: 0.5rem 1rem;
          text-align: center;
          color: #999;
          font-size: 0.8rem;
          font-style: italic;
        }
      </style>
      <div class="download-history-tooltip">
        <div class="tooltip-header">📊 Historial de descargas</div>
        <div class="tooltip-content">
          ${eventsList.map(ev => {
            const date = new Date(ev.downloadedAt).toLocaleDateString('es-ES', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            });
            const user = ev.downloadedBy || 'Anónimo';
            return `<div class="tooltip-row"><span class="tooltip-user">${user}</span><span class="tooltip-date">${date}</span></div>`;
          }).join('')}
          ${Object.keys(fileEvents).length > 20 ? `<div class="tooltip-more">... y ${Object.keys(fileEvents).length - 20} más</div>` : ''}
        </div>
      </div>
    `;

    // Position tooltip
    const rect = event.target.getBoundingClientRect();
    tooltip.style.cssText = `
      position: fixed;
      z-index: 10000;
      left: ${rect.left}px;
      top: ${rect.bottom + 8}px;
    `;

    // Adjust if tooltip goes off screen
    document.body.appendChild(tooltip);
    const tooltipRect = tooltip.getBoundingClientRect();
    if (tooltipRect.right > window.innerWidth) {
      tooltip.style.left = `${window.innerWidth - tooltipRect.width - 16}px`;
    }
    if (tooltipRect.bottom > window.innerHeight) {
      tooltip.style.top = `${rect.top - tooltipRect.height - 8}px`;
    }

    this._currentTooltip = tooltip;
  }

  /**
   * Hide download history tooltip
   */
  _hideDownloadHistoryTooltip() {
    if (this._currentTooltip) {
      this._currentTooltip.remove();
      this._currentTooltip = null;
      this._currentTooltipFile = null;
    }
    if (this._closeTooltipHandler) {
      document.removeEventListener('click', this._closeTooltipHandler);
      this._closeTooltipHandler = null;
    }
  }

  /**
   * Show modal with changelog and app info
   */
  _showChangelogModal(file, metadata) {
    const modal = document.createElement('dialog');
    modal.style.cssText = `
      border: none;
      border-radius: 12px;
      padding: 0;
      max-width: 500px;
      width: 90%;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    `;
    modal.innerHTML = `
      <style>
        dialog::backdrop {
          background: rgba(0, 0, 0, 0.5);
        }
      </style>
      <div style="display: flex; flex-direction: column;">
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.25rem; background: linear-gradient(135deg, #ec3e95 0%, #d63384 100%); color: white; border-radius: 12px 12px 0 0;">
          <h3 style="margin: 0; font-size: 1.1rem; font-weight: 600;">📱 ${file.name}</h3>
          <button class="close-btn" type="button" style="background: none; border: none; color: white; font-size: 1.5rem; cursor: pointer; line-height: 1; padding: 0; opacity: 0.8;">&times;</button>
        </div>
        <div style="padding: 1.25rem;">
          <div style="background: #f8f9fa; padding: 0.75rem 1rem; border-radius: 6px; margin-bottom: 1rem;">
            <p style="margin: 0.25rem 0;"><strong>Tipo:</strong> ${metadata.type === 'beta' ? '🧪 Beta' : metadata.type === 'admin' ? '🔐 Admin' : '🚀 Release'}</p>
            <p style="margin: 0.25rem 0;"><strong>Fecha:</strong> ${file.uploadDate}</p>
            <p style="margin: 0.25rem 0;"><strong>Tamaño:</strong> ${file.size}</p>
            ${metadata.uploadedBy ? `<p style="margin: 0.25rem 0;"><strong>Subido por:</strong> ${metadata.uploadedBy}</p>` : ''}
          </div>
          <div>
            <h4 style="margin: 0 0 0.75rem 0; font-size: 1rem; color: #333;">📋 Changelog</h4>
            <div style="white-space: pre-wrap; line-height: 1.5; color: #555; background: #f8f9fa; padding: 1rem; border-radius: 6px; max-height: 200px; overflow-y: auto;">${metadata.changelog || 'No hay changelog disponible para esta versión.'}</div>
          </div>
        </div>
        <div style="padding: 1rem 1.25rem; border-top: 1px solid #e9ecef; display: flex; justify-content: flex-end;">
          <button class="download-btn" type="button" style="padding: 0.5rem 1.5rem; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem;">⬇️ Descargar</button>
        </div>
      </div>
    `;

    // Event handlers
    const closeBtn = modal.querySelector('.close-btn');
    const downloadBtn = modal.querySelector('.download-btn');

    closeBtn.addEventListener('click', () => modal.close());
    downloadBtn.addEventListener('click', () => {
      this.downloadFile(file);
      modal.close();
    });
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.close();
    });
    modal.addEventListener('close', () => modal.remove());

    document.body.appendChild(modal);
    modal.showModal();
  }

  /**
   * Show modal to edit app metadata
   */
  _showEditAppModal(file) {
    const metadata = this._getEffectiveMetadata(file);
    const modal = document.createElement('dialog');
    modal.style.cssText = `
      border: none;
      border-radius: 12px;
      padding: 0;
      max-width: 500px;
      width: 90%;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    `;
    modal.innerHTML = `
      <style>
        dialog::backdrop {
          background: rgba(0, 0, 0, 0.5);
        }
      </style>
      <div style="display: flex; flex-direction: column;">
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 1rem 1.25rem; background: linear-gradient(135deg, #ec3e95 0%, #d63384 100%); color: white; border-radius: 12px 12px 0 0;">
          <h3 style="margin: 0; font-size: 1.1rem; font-weight: 600;">✏️ Editar App</h3>
          <button class="close-btn" type="button" style="background: none; border: none; color: white; font-size: 1.5rem; cursor: pointer; line-height: 1; padding: 0; opacity: 0.8;">&times;</button>
        </div>
        <div style="padding: 1.25rem;">
          <div style="background: #f8f9fa; padding: 0.75rem 1rem; border-radius: 6px; margin-bottom: 1rem;">
            <p style="margin: 0; font-weight: 600;">📱 ${file.name}</p>
            <p style="margin: 0.25rem 0 0 0; font-size: 0.9rem; color: #666;">📅 ${file.uploadDate} · 📏 ${file.size}</p>
          </div>
          <div style="margin-bottom: 1rem;">
            <label for="edit-app-type" style="display: block; margin-bottom: 0.5rem; font-weight: 500; color: #333;">Tipo de versión</label>
            <select id="edit-app-type" style="width: 100%; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; font-size: 1rem;">
              <option value="release" ${metadata.type === 'release' ? 'selected' : ''}>🚀 Release</option>
              <option value="beta" ${metadata.type === 'beta' ? 'selected' : ''}>🧪 Beta</option>
              <option value="admin" ${metadata.type === 'admin' ? 'selected' : ''}>🔐 Admin</option>
            </select>
          </div>
          <div style="margin-bottom: 1rem;">
            <label for="edit-app-changelog" style="display: block; margin-bottom: 0.5rem; font-weight: 500; color: #333;">Changelog / Notas de versión</label>
            <textarea id="edit-app-changelog" rows="6" placeholder="Describe los cambios de esta versión..." style="width: 100%; padding: 0.5rem; border: 1px solid #ddd; border-radius: 4px; font-size: 1rem; resize: vertical; box-sizing: border-box;">${metadata.changelog || ''}</textarea>
          </div>
        </div>
        <div style="padding: 1rem 1.25rem; border-top: 1px solid #e9ecef; display: flex; justify-content: flex-end; gap: 0.5rem;">
          <button class="cancel-btn" type="button" style="padding: 0.5rem 1rem; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem;">Cancelar</button>
          <button class="save-btn" type="button" style="padding: 0.5rem 1.5rem; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 0.9rem;">💾 Guardar cambios</button>
        </div>
      </div>
    `;

    // Event handlers
    const closeBtn = modal.querySelector('.close-btn');
    const cancelBtn = modal.querySelector('.cancel-btn');
    const saveBtn = modal.querySelector('.save-btn');
    const typeSelect = modal.querySelector('#edit-app-type');
    const changelogTextarea = modal.querySelector('#edit-app-changelog');

    closeBtn.addEventListener('click', () => modal.close());
    cancelBtn.addEventListener('click', () => modal.close());

    saveBtn.addEventListener('click', async () => {
      const newType = typeSelect.value;
      const newChangelog = changelogTextarea.value.trim();

      saveBtn.disabled = true;
      saveBtn.textContent = '⏳ Guardando...';

      try {
        await this._saveAppMetadata(file.fileKey, {
          type: newType,
          changelog: newChangelog
        });
        modal.close();
        this.showMessage('Metadatos actualizados correctamente', 'success');
        await this.loadFiles();
      } catch (error) {
        console.error('Error saving app metadata:', error);
        this.showMessage('Error al guardar los metadatos', 'error');
        saveBtn.disabled = false;
        saveBtn.textContent = '💾 Guardar cambios';
      }
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.close();
    });
    modal.addEventListener('close', () => modal.remove());

    document.body.appendChild(modal);
    modal.showModal();
  }

  /**
   * Save app metadata, creating entry if it doesn't exist (for legacy apps)
   */
  async _saveAppMetadata(fileKey, updates) {
    const metadataRef = ref(database, `appMetadata/${this.projectId}/${fileKey}`);

    // Get current metadata or create defaults for legacy apps
    const snapshot = await get(metadataRef);
    let currentMetadata = snapshot.val();

    if (!currentMetadata) {
      // Legacy app: create default metadata structure
      const file = this.uploadedFiles.find(f => f.fileKey === fileKey);
      currentMetadata = {
        fileName: file?.name || 'unknown',
        type: 'release',
        status: 'approved',
        changelog: '',
        uploadedBy: auth?.currentUser?.email || 'unknown',
        createdAt: file?.uploadedAt || new Date().toISOString()
      };
    }

    // Merge updates
    const updatedMetadata = {
      ...currentMetadata,
      ...updates,
      updatedAt: new Date().toISOString(),
      updatedBy: auth?.currentUser?.email || 'unknown'
    };

    await set(metadataRef, updatedMetadata);
  }

  /**
   * Group files by base name (without version/extension)
   * @param {Array} files - List of files to group
   * @returns {Object} - Object with base names as keys and arrays of versions as values
   */
  _groupAppsByName(files) {
    const groups = {};

    for (const file of files) {
      const baseName = this._extractBaseName(file.name);

      if (!groups[baseName]) {
        groups[baseName] = [];
      }
      groups[baseName].push(file);
    }

    // Sort each group by date (most recent first)
    for (const baseName in groups) {
      groups[baseName].sort((a, b) =>
        new Date(b.uploadedAt || b.uploadDate) - new Date(a.uploadedAt || a.uploadDate)
      );
    }

    return groups;
  }

  /**
   * Extract base name from filename (remove version and extension)
   * @param {string} fileName - The full file name
   * @returns {string} - The base name
   */
  _extractBaseName(fileName) {
    // Remove extension
    const withoutExt = fileName.replace(/\.[^/.]+$/, '');
    // Remove common version patterns
    return withoutExt
      .replace(/_v?\d+(\.\d+)*$/i, '')
      .replace(/_\d{4}-\d{2}-\d{2}$/, '')
      .replace(/-v?\d+(\.\d+)*$/i, '')
      .trim() || withoutExt;
  }

  /**
   * Handle version selection in readonly mode - download selected version
   */
  _onVersionSelectReadOnly(event, baseName) {
    const selectedFileKey = event.target.value;
    if (!selectedFileKey) return;

    const file = this.uploadedFiles.find(f => f.fileKey === selectedFileKey);
    if (file) {
      this.downloadFile(file);
      // Reset select after download
      event.target.value = '';
    }
  }

  render() {
    // Show loading while checking access
    if (!this.accessChecked) {
      return html`
        <div class="app-access-info">
          <div class="loading">
            <div class="spinner"></div>
            Verificando permisos de acceso...
          </div>
        </div>
      `;
    }

    if (!this.projectId) {
      return html`
        <div class="no-files">
          Selecciona un proyecto para ver sus aplicaciones
        </div>
      `;
    }

    // Read-only view for regular users (not admin and not developer)
    if (this.isReadOnlyUser) {
      return this._renderReadOnlyView();
    }

    // Full view for admins and developers
    return html`
      <div class="app-layout">
        <div class="upload-column">
          <div class="app-section">
            <h3 class="section-title">📱 Subir Nueva App</h3>
            <div class="upload-area">
              ${this.showFileTypeError ? html`
                <p class="upload-description error">
                  ⚠️ Tipo de archivo no válido.<br>
                  Formatos soportados: .exe, .msi, .dmg, .pkg, .deb, .rpm, .app, .zip, .rar, .7z
                </p>
              ` : ''}

              <!-- Upload metadata form -->
              <div class="upload-metadata-form">
                <div class="form-row">
                  <label class="form-label">
                    Tipo de versión
                    <select
                      class="form-select"
                      .value=${this.pendingUploadType}
                      @change=${(e) => this.pendingUploadType = e.target.value}
                      ?disabled=${this.isUploading}
                    >
                      <option value="release">🚀 Release (versión estable)</option>
                      <option value="beta">🧪 Beta (versión de prueba)</option>
                      <option value="admin">🔐 Admin (permisos especiales)</option>
                    </select>
                  </label>
                </div>
                <div class="form-row">
                  <label class="form-label">
                    Changelog <span class="required-label">(obligatorio)</span>
                    <textarea
                      class="form-textarea ${this.changelogError ? 'input-error' : ''}"
                      placeholder="- Nueva funcionalidad X&#10;- Corrección de bug Y&#10;- Mejora en rendimiento"
                      .value=${this.pendingUploadChangelog}
                      @input=${(e) => {
                        this.pendingUploadChangelog = e.target.value;
                        if (e.target.value.trim()) this.changelogError = false;
                      }}
                      rows="4"
                      ?disabled=${this.isUploading}
                    ></textarea>
                  </label>
                </div>
              </div>

              <div class="uploader-wrapper">
                <firebase-storage-uploader
                  storage-path="apps/${this.projectId}"
                  accept=".exe,.msi,.dmg,.pkg,.deb,.rpm,.app,.zip,.rar,.7z"
                  project-name="${this.projectId}"
                  filename-template="{projectName}_{version}"
                  generate-unique-filenames="false"
                  auto-upload="false"
                  @file-selected="${this._onFileSelected}"
                  @file-uploaded="${this.onFileUploaded}"
                  @upload-error="${this.onUploadError}"
                  @uploading="${this._onUploadStart}"
                ></firebase-storage-uploader>
              </div>

              ${this.selectedFile ? html`
                <div class="selected-file-info">
                  <span class="file-icon">📄</span>
                  <span class="file-name">${this.selectedFile.name}</span>
                  <span class="file-size">(${this._formatFileSize(this.selectedFile.size)})</span>
                </div>
                <button
                  class="upload-btn"
                  @click="${this._triggerUpload}"
                  ?disabled="${this.isUploading}"
                >
                  ${this.isUploading ? '⏳ Subiendo...' : '⬆️ Subir archivo'}
                </button>
              ` : ''}

              <p class="upload-notice">
                ℹ️ Las apps subidas quedarán pendientes de aprobación.
              </p>

              ${this.isUploading ? html`
                <div class="upload-overlay">
                  <div class="upload-overlay-content">
                    <div class="spinner large"></div>
                    <p>Subiendo archivo...</p>
                  </div>
                </div>
              ` : ''}
            </div>
          </div>
        </div>
        
        <div class="files-column">
          <div class="app-section">
            <h3 class="section-title">📂 Aplicaciones Disponibles</h3>
            <div class="files-list">
          ${this.loading ? html`
            <div class="loading">
              <div class="spinner"></div>
              Cargando archivos...
            </div>
          ` : this.uploadedFiles.length === 0 ? html`
            <div class="no-files">
              No hay aplicaciones subidas para este proyecto
            </div>
          ` : html`
            ${(() => {
              // Find the recommended version (latest approved release)
              const sortedFiles = [...this.uploadedFiles].sort((a, b) =>
                new Date(b.uploadedAt || b.uploadDate) - new Date(a.uploadedAt || a.uploadDate)
              );
              const recommendedFile = sortedFiles.find(f => {
                const m = this._getEffectiveMetadata(f);
                return m.type === 'release' && m.status === 'approved';
              });

              return this.uploadedFiles.map(file => {
                const metadata = this._getEffectiveMetadata(file);
                const statusClass = metadata.status === 'deprecated' ? 'deprecated' :
                                    metadata.status === 'pending' ? 'pending' : '';
                const isRecommended = recommendedFile && file.fileKey === recommendedFile.fileKey;

                return html`
                  <div class="file-item ${statusClass} ${isRecommended ? 'recommended' : ''}">
                    <div class="file-info">
                      <div class="file-name">📱 ${file.name}</div>
                      <div class="file-badges">
                        ${isRecommended ? html`
                          <span class="app-badge badge-recommended">✨ Recomendada</span>
                        ` : ''}
                        <span class="app-badge badge-${metadata.type}">
                          ${metadata.type === 'beta' ? '🧪 Beta' : metadata.type === 'admin' ? '🔐 Admin' : '🚀 Release'}
                        </span>
                        ${metadata.status === 'pending' ? html`
                          <span class="app-badge badge-pending">⏳ Pendiente</span>
                        ` : ''}
                        ${metadata.status === 'deprecated' ? html`
                          <span class="app-badge badge-deprecated">🚫 Descatalogada</span>
                        ` : ''}
                    </div>
                    <div class="file-meta">
                      <span>📅 ${file.uploadDate}</span>
                      <span>📏 ${file.size}</span>
                      ${this._renderDownloadCount(file)}
                      ${metadata.uploadedBy ? html`<span>👤 ${metadata.uploadedBy}</span>` : ''}
                    </div>
                    ${metadata.changelog ? html`
                      <div class="changelog-preview">${metadata.changelog}</div>
                    ` : ''}
                  </div>
                  <div class="file-actions">
                    ${metadata.status === 'approved' ? html`
                      <button
                        class="download-btn"
                        @click="${() => this.downloadFile(file)}"
                        title="Descargar archivo"
                      >
                        ⬇️ Descargar
                      </button>
                    ` : ''}
                    ${this.isAppAdmin && metadata.status === 'pending' ? html`
                      <button
                        class="approve-btn"
                        @click="${() => this._approveApp(file.fileKey)}"
                        title="Aprobar esta app para hacerla visible"
                      >
                        ✅ Aprobar
                      </button>
                    ` : ''}
                    ${this.isAppAdmin && metadata.status === 'approved' ? html`
                      <button
                        class="share-btn"
                        @click="${() => this.createShareLink(file)}"
                        title="Generar un enlace compartible protegido con contraseña"
                      >
                        🔗 Compartir
                      </button>
                    ` : ''}
                    ${this.isAppAdmin && metadata.status === 'approved' ? html`
                      <button
                        class="deprecate-btn"
                        @click="${() => this._deprecateApp(file.fileKey)}"
                        title="Descatalogar aplicación"
                      >
                        🚫 Descatalogar
                      </button>
                    ` : ''}
                    ${this.isAppAdmin && metadata.status === 'deprecated' ? html`
                      <button
                        class="restore-btn"
                        @click="${() => this._restoreApp(file.fileKey)}"
                        title="Restaurar esta app"
                      >
                        ♻️ Restaurar
                      </button>
                    ` : ''}
                    ${this.isAppAdmin ? html`
                      <button
                        class="edit-btn"
                        @click="${() => this._showEditAppModal(file)}"
                        title="Editar metadatos de la app"
                      >
                        ✏️ Editar
                      </button>
                    ` : ''}
                    ${this.isAppAdmin ? html`
                      <button
                        class="delete-btn"
                        @click="${() => this.deleteFile(file)}"
                        title="Eliminar archivo"
                      >
                        🗑️ Eliminar
                      </button>
                    ` : ''}
                  </div>
                </div>
              `;
              });
            })()}
          `}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  _renderDownloadStats() {
    const events = flattenDownloadEvents(this.downloadEvents);
    const filteredEvents = filterDownloadEvents(events, {
      fileKey: this.selectedAppKey,
      from: this.dateFrom,
      to: this.dateTo
    });
    const countsByDate = buildCountsByDate(filteredEvents);
    const totalDownloads = filteredEvents.length;
    const csvRows = buildRowsForCsv(filteredEvents);

    return html`
      <div class="download-stats">
        <div class="stats-header">
          <div>
            <h4>📊 Estadísticas de descargas</h4>
            <p>Total descargas: <strong>${totalDownloads}</strong></p>
          </div>
          <div class="stats-actions">
            <button class="secondary-button" type="button" @click=${() => this._exportStatsCsv(csvRows)} ?disabled=${csvRows.length === 0}>Exportar CSV</button>
          </div>
        </div>
        <div class="stats-filters">
          <label>
            App
            <select @change=${this._handleAppFilterChange} .value=${this.selectedAppKey}>
              <option value="all">Todas</option>
              ${this.uploadedFiles.map(file => html`
                <option value=${file.fileKey}>${file.name}</option>
              `)}
            </select>
          </label>
          <label>
            Desde
            <input type="date" .value=${this.dateFrom} @change=${this._handleDateFromChange} />
          </label>
          <label>
            Hasta
            <input type="date" .value=${this.dateTo} @change=${this._handleDateToChange} />
          </label>
          <div class="view-toggle">
            <button class=${this.viewMode === 'chart' ? 'active' : ''} @click=${() => this._setViewMode('chart')}>Gráfico</button>
            <button class=${this.viewMode === 'table' ? 'active' : ''} @click=${() => this._setViewMode('table')}>Tabla</button>
          </div>
        </div>
        ${this.viewMode === 'table'
          ? this._renderStatsTable(csvRows)
          : this._renderStatsChart(countsByDate)}
      </div>
    `;
  }

  _renderStatsTable(rows) {
    return html`
      <table class="stats-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>App</th>
            <th>Descargas</th>
          </tr>
        </thead>
        <tbody>
          ${rows.length === 0 ? html`
            <tr><td colspan="3">Sin datos para el filtro seleccionado</td></tr>
          ` : rows.map(row => html`
            <tr>
              <td>${row.date}</td>
              <td>${row.fileName}</td>
              <td>${row.count}</td>
            </tr>
          `)}
        </tbody>
      </table>
    `;
  }

  _renderStatsChart(countsByDate) {
    const entries = Object.entries(countsByDate).sort(([a], [b]) => a.localeCompare(b));
    if (entries.length === 0) {
      return html`<p class="stats-empty">Sin datos para el filtro seleccionado</p>`;
    }
    const max = Math.max(...entries.map(([, value]) => value));

    return html`
      <div class="stats-chart">
        ${entries.map(([date, value]) => {
          const width = max ? Math.round((value / max) * 100) : 0;
          return html`
            <div class="chart-row">
              <span class="chart-label">${date}</span>
              <div class="chart-bar">
                <span style="width:${width}%"></span>
              </div>
              <span class="chart-value">${value}</span>
            </div>
          `;
        })}
      </div>
    `;
  }

  _handleAppFilterChange(e) {
    this.selectedAppKey = e.target.value;
  }

  _handleDateFromChange(e) {
    this.dateFrom = e.target.value;
  }

  _handleDateToChange(e) {
    this.dateTo = e.target.value;
  }

  _setViewMode(mode) {
    this.viewMode = mode;
  }

  _exportStatsCsv(rows) {
    try {
      const csv = buildCsv(rows);
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `download-stats-${this.projectId || 'project'}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
this.showMessage('No se pudo exportar el CSV', 'error');
    }
  }

  _applyDownloadEvent(fileKey, eventId, eventData) {
    if (!fileKey || !eventId || !eventData) {
      return;
    }

    const eventsByFile = { ...(this.downloadEvents || {}) };
    const fileEvents = { ...(eventsByFile[fileKey] || {}) };
    fileEvents[eventId] = eventData;
    eventsByFile[fileKey] = fileEvents;
    this.downloadEvents = eventsByFile;

    if (Array.isArray(this.uploadedFiles)) {
      this.uploadedFiles = this.uploadedFiles.map((file) => {
        if (file.fileKey !== fileKey) {
          return file;
        }
        return {
          ...file,
          downloadCount: (Number(file.downloadCount) || 0) + 1
        };
      });
    }
  }
}

customElements.define('app-manager', AppManager);
