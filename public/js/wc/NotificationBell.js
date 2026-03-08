import { LitElement, html } from 'https://unpkg.com/lit@3/index.js?module';
import { dalService } from '../services/dal-service.js';
import { sanitizeEmailForFirebase } from '../utils/email-sanitizer.js';
import { NotificationBellStyles } from './notification-bell-styles.js';

class NotificationBell extends LitElement {
    static properties = {
        unreadCount: { type: Number },
        isOpen: { type: Boolean },
        notifications: { type: Array },
        currentUser: { type: Object }
    };

    static get styles() {
        return NotificationBellStyles;
    }

    constructor() {
        super();
        this.unreadCount = 0;
        this.isOpen = false;
        this.notifications = [];
        this.currentUser = null;
        this.unsubscribe = null;
        this.boundCloseModal = this.closeModal.bind(this);
        this.isInitialized = false; // Flag to prevent duplicate initialization
        this.previousUnreadCount = 0; // Track changes to reduce logging
        this.previousNotificationCount = 0; // Track changes to reduce logging
    }

    connectedCallback() {
        super.connectedCallback();
        document.addEventListener('click', this.boundCloseModal);
        
        // Listen for user authentication changes
        document.addEventListener('user-authenticated', (e) => {
            this.currentUser = e.detail.user;
            this.initializeNotifications();
        });
        
        // Listen for user sign out
        document.addEventListener('user-signed-out', () => {
if (this.unsubscribe) {
                this.unsubscribe();
                this.unsubscribe = null;
            }
            this.currentUser = null;
            this.currentUserKey = null;
            this.notifications = [];
            this.unreadCount = 0;
            this.isInitialized = false;
            this.requestUpdate();
        });

        // Initialize if user already exists
        if (window.currentUser) {
            this.currentUser = window.currentUser;
            this.initializeNotifications();
        }
    }

    disconnectedCallback() {
        super.disconnectedCallback();
        document.removeEventListener('click', this.boundCloseModal);
        if (this.unsubscribe) {
            this.unsubscribe();
        }
        // Reset initialization flag to allow fresh initialization if reconnected
        this.isInitialized = false;
        this.currentUserKey = null;
    }

    sanitizeEmail(email) {
        // Usar email completo sanitizado para coincidir con las reglas de Firebase
        return sanitizeEmailForFirebase(email, false);
    }

    initializeNotifications() {
        if (!this.currentUser?.email) {
return;
        }

        // Prevent duplicate initialization for the same user
        const userKey = this.sanitizeEmail(this.currentUser.email);
        if (this.isInitialized && this.currentUserKey === userKey) {
return;
        }

        // Unsubscribe from previous listener if exists
        if (this.unsubscribe) {
            this.unsubscribe();
        }

        this.currentUserKey = userKey;
        this.unsubscribe = dalService.notifications.subscribeToNotifications(userKey, (data) => {
            const notifications = [];
            let notificationsWithUrl = 0;

            if (data) {
                for (const [id, val] of Object.entries(data)) {
                    const notification = { id, ...val };
                    if (notification.url) {
                        notificationsWithUrl++;
                    }
                    notifications.push(notification);
                }
            }

            // Ordenar por timestamp descendente (más recientes primero)
            notifications.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

            this.notifications = notifications;
            this.unreadCount = notifications.filter(n => !n.read).length;

            // Log consolidado más limpio - solo cuando hay cambios significativos
            if (this.previousUnreadCount !== this.unreadCount || notifications.length !== this.previousNotificationCount) {
                this.previousUnreadCount = this.unreadCount;
                this.previousNotificationCount = notifications.length;
            }

            this.requestUpdate();
        });

        this.isInitialized = true;
    }

    toggleModal() {
        this.isOpen = !this.isOpen;
        this.requestUpdate();
    }

    closeModal(event) {
        if (!this.contains(event.target)) {
            this.isOpen = false;
            this.requestUpdate();
        }
    }

    async markAsRead(notification) {
        if (!notification.read && this.currentUser?.email) {
            const userKey = this.sanitizeEmail(this.currentUser.email);
            try {
                await dalService.notifications.markAsRead(userKey, notification.id);
            } catch (error) {
                console.error('NotificationBell: Failed to mark notification as read', error.code);
            }
        }
    }

    async markAllAsRead() {
        if (!this.currentUser?.email) return;

        const unreadNotifications = this.notifications.filter(n => !n.read);
        const userKey = this.sanitizeEmail(this.currentUser.email);

        try {
            for (const notification of unreadNotifications) {
                await dalService.notifications.markAsRead(userKey, notification.id);
            }
        } catch (error) {
            console.error('NotificationBell: Failed to mark all notifications as read', error.code);
        }
    }

    /**
     * Filtra las notificaciones para mostrar: todas las no leídas + máximo 5 leídas más recientes
     * @returns {Array} Array de notificaciones filtradas para mostrar
     */
    getNotificationsToDisplay() {
        if (!this.notifications || this.notifications.length === 0) {
            return [];
        }

        // Separar notificaciones leídas y no leídas
        const unreadNotifications = this.notifications.filter(n => !n.read);
        const readNotifications = this.notifications.filter(n => n.read);

        // Tomar solo las 5 notificaciones leídas más recientes
        const recentReadNotifications = readNotifications.slice(0, 5);

        // Combinar: todas las no leídas + máximo 5 leídas más recientes
        const notificationsToDisplay = [...unreadNotifications, ...recentReadNotifications];

        // Ordenar por timestamp descendente (más recientes primero)
        return notificationsToDisplay.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }

    formatTime(timestamp) {
        if (!timestamp) return 'Hace un momento';
        
        const now = Date.now();
        const time = typeof timestamp === 'object' ? timestamp.seconds * 1000 : timestamp;
        const diffMs = now - time;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Ahora mismo';
        if (diffMins < 60) return `Hace ${diffMins}m`;
        if (diffHours < 24) return `Hace ${diffHours}h`;
        if (diffDays < 7) return `Hace ${diffDays}d`;
        
        return new Date(time).toLocaleDateString('es-ES', { 
            day: 'numeric', 
            month: 'short' 
        });
    }

    render() {
        const notificationsToDisplay = this.getNotificationsToDisplay();
        const totalUnread = this.unreadCount;
        const totalRead = this.notifications.filter(n => n.read).length;

        return html`
            <div class="bell-container" @click="${this.toggleModal}">
                <svg class="bell-icon" viewBox="0 0 24 24">
                    <path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 19V20H3V19L5 17V11C5 7.9 7 5.2 10 4.3C10 4.2 10 4.1 10 4C10 2.9 10.9 2 12 2S14 2.9 14 4C14 4.1 14 4.2 14 4.3C17 5.2 19 7.9 19 11V17L21 19ZM12 22C13.1 22 14 21.1 14 20H10C10 21.1 10.9 22 12 22Z"/>
                </svg>
                ${this.unreadCount > 0 ? html`
                    <div class="badge">${this.unreadCount > 99 ? '99+' : this.unreadCount}</div>
                ` : ''}
            </div>

            <div class="notification-modal ${this.isOpen ? 'open' : ''}">
                <div class="modal-header">
                    <h3 class="modal-title">
                        Notificaciones 
                        ${totalUnread > 0 ? html`<span style="color: #007bff;">(${totalUnread} nuevas)</span>` : ''}
                    </h3>
                    ${totalRead > 5 ? html`
                        <p style="font-size: 0.8rem; color: #6c757d; margin: 0.25rem 0 0 0;">
                            Mostrando ${Math.min(5, totalRead)} de ${totalRead} leídas
                        </p>
                    ` : ''}
                </div>

                <div class="notification-list">
                    ${notificationsToDisplay.length === 0 ? html`
                        <div class="empty-state">
                            No tienes notificaciones
                        </div>
                    ` : notificationsToDisplay.map(notification => html`
                        <div 
                            class="notification-item ${notification.read ? '' : 'unread'}"
                            @click="${() => this.markAsRead(notification)}"
                        >
                            <div class="notification-header">
                                <div class="notification-title">${notification.title || 'Notificación'}</div>
                                ${notification.url ? html`
                                    <a href="${notification.url}" 
                                       class="notification-link" 
                                       title="Ir a la tarea: ${notification.url}"
                                       @click="${(e) => e.stopPropagation()}">
                                        🔗
                                    </a>
                                ` : html`
                                    <!-- No URL available: ${JSON.stringify(notification)} -->
                                `}
                            </div>
                            <div class="notification-message">${notification.message || notification.body || 'Sin mensaje'}</div>
                            <div class="notification-time">${this.formatTime(notification.timestamp)}</div>
                        </div>
                    `)}
                </div>

                ${this.notifications.length > 0 && this.notifications.some(n => !n.read) ? html`
                    <div class="notification-actions">
                        <button class="action-button primary" @click="${this.markAllAsRead}">
                            Marcar todas como leídas
                        </button>
                    </div>
                ` : ''}
            </div>
        `;
    }
}

customElements.define('notification-bell', NotificationBell);