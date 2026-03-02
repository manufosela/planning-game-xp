import { ref, push, set, onValue, serverTimestamp, query, orderByChild, get } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js';
import { getMessaging, getToken, onMessage } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging.js';
import { database, app, vapidKey } from '../../firebase-config.js';
import { sanitizeEmailForFirebase } from '../utils/email-sanitizer.js';
import { entityDirectoryService } from './entity-directory-service.js';

class PushNotificationService {
    constructor() {
        this.messaging = null;
        this.userNotificationRefs = new Map();
        this.isInitialized = false;
        this.cleanupInterval = null;
        
        window.pushNotificationService = this;
    }

    static async create() {
        const service = new PushNotificationService();
        await service.initializeMessaging();
        return service;
    }

    async initializeMessaging() {
        try {
            // Skip push notifications in demo mode
            const { demoModeService } = await import('./demo-mode-service.js');
            if (demoModeService.isDemo()) return;

            this.messaging = getMessaging(app);

            // Solicitar permisos de notificación
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
              await this.setupFCMToken();
            }

            // Configurar listener para mensajes en primer plano
            onMessage(this.messaging, (payload) => {
              this.showInAppNotification(payload);
            });

            // Iniciar limpieza automática de notificaciones expiradas
            this.startAutoCleanup();

            this.isInitialized = true;
        } catch (error) {
            // Silently ignore initialization errors
        }
    }

    startAutoCleanup() {
        // Ejecutar limpieza cada 24 horas
        const CLEANUP_INTERVAL = 24 * 60 * 60 * 1000; // 24 horas en milisegundos
        
        // Limpiar notificaciones expiradas al iniciar
        this.clearAllExpiredNotifications();

        // Configurar limpieza periódica
        this.cleanupInterval = setInterval(() => {
            this.clearAllExpiredNotifications();
        }, CLEANUP_INTERVAL);
        
    }

    async setupFCMToken() {
        try {
            // vapidKey importado desde firebase-config.js
            const token = await getToken(this.messaging, { vapidKey });

            if (token) {
                // Guardar token en la base de datos para el usuario actual
                if (window.currentUser?.email) {
                    await this.saveUserToken(window.currentUser.email, token);
                }
                return token;
            }
        } catch (error) {
            // Silently ignore token setup errors
        }
        return null;
    }

    async saveUserToken(userEmail, token) {
        try {
            const userTokenRef = ref(database, `userTokens/${this.sanitizeEmail(userEmail)}`);
            await set(userTokenRef, {
                token: token,
                timestamp: serverTimestamp(),
                email: userEmail,
                lastUpdated: Date.now()
            });
        } catch (error) {
            // Silently ignore token save errors
        }
    }

  sanitizeEmail(email) {
        // Usar email completo sanitizado para coincidir con las reglas de Firebase
        return sanitizeEmailForFirebase(email, false);
  }

    async createNotification(userEmail, notification) {
        try {
            const notificationsRef = ref(database, `notifications/${this.sanitizeEmail(userEmail)}`);
            const newNotificationRef = push(notificationsRef);
            
            // Calcular fecha de expiración (7 días desde ahora)
            const now = Date.now();
            const expiryDate = now + (7 * 24 * 60 * 60 * 1000); // 7 días en milisegundos
            
            const notificationData = {
                id: newNotificationRef.key,
                title: notification.title,
                message: notification.message,
                type: notification.type || 'info',
                read: false,
                timestamp: serverTimestamp(),
                createdAt: now, // Timestamp local para cálculos
                expiryDate: expiryDate, // Fecha de expiración
                data: notification.data || {},
                projectId: notification.projectId || null,
                taskId: notification.taskId || null,
                bugId: notification.bugId || null
            };

            await set(newNotificationRef, notificationData);
            
            // Enviar push notification si el usuario no está activo
            if (!this.isUserActive()) {
                await this.sendPushNotification(userEmail, notificationData);
            }
return notificationData;
        } catch (error) {
throw error;
        }
    }

    async subscribeToNotifications(userEmail, callback) {
        try {
            const sanitizedEmail = this.sanitizeEmail(userEmail);
            const notificationsRef = ref(database, `notifications/${sanitizedEmail}`);
            const notificationsQuery = query(notificationsRef, orderByChild('timestamp'));

            const unsubscribe = onValue(notificationsQuery, (snapshot) => {
                const notifications = [];
                const now = Date.now();
                
                if (snapshot.exists()) {
                    snapshot.forEach((childSnapshot) => {
                        const notification = {
                            ...childSnapshot.val(),
                            id: childSnapshot.key
                        };
                        
                        // Filtrar notificaciones expiradas
                        // Si no tiene expiryDate (notificaciones antiguas), se mantienen
                        // Si tiene expiryDate, verificar que no haya expirado
                        if (!notification.expiryDate || notification.expiryDate > now) {
                            notifications.push(notification);
                        }
                    });
                }
                
                // Ordenar por timestamp descendente (más recientes primero)
                notifications.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                callback(notifications);
            });

            this.userNotificationRefs.set(userEmail, { ref: notificationsRef, unsubscribe });
            return unsubscribe;
        } catch (error) {
throw error;
        }
    }

    async markAsRead(userEmail, notificationId) {
        try {
            const notificationRef = ref(database, `notifications/${this.sanitizeEmail(userEmail)}/${notificationId}/read`);
            await set(notificationRef, true);
        } catch (error) {
            // Silently ignore - notification will show as unread
        }
    }

    async markAllAsRead(userEmail) {
        try {
            const notificationsRef = ref(database, `notifications/${this.sanitizeEmail(userEmail)}`);
            const snapshot = await new Promise((resolve) => {
                onValue(notificationsRef, resolve, { onlyOnce: true });
            });

            if (snapshot.exists()) {
                const updates = {};
                snapshot.forEach((childSnapshot) => {
                    if (!childSnapshot.val().read) {
                        updates[`${childSnapshot.key}/read`] = true;
                    }
                });

                if (Object.keys(updates).length > 0) {
                    await Promise.all(
                        Object.entries(updates).map(([path, value]) => {
                            const updateRef = ref(database, `notifications/${this.sanitizeEmail(userEmail)}/${path}`);
                            return set(updateRef, value);
                        })
                    );
                }
            }
        } catch (error) {
            // Silently ignore - notifications will show as unread
        }
    }

    async clearReadNotifications(userEmail) {
        try {
            const notificationsRef = ref(database, `notifications/${this.sanitizeEmail(userEmail)}`);
            const snapshot = await new Promise((resolve) => {
                onValue(notificationsRef, resolve, { onlyOnce: true });
            });

            if (snapshot.exists()) {
                const promises = [];
                snapshot.forEach((childSnapshot) => {
                    if (childSnapshot.val().read) {
                        const childRef = ref(database, `notifications/${this.sanitizeEmail(userEmail)}/${childSnapshot.key}`);
                        promises.push(set(childRef, null));
                    }
                });

                await Promise.all(promises);
            }
        } catch (error) {
            // Silently ignore clear errors
        }
    }

    async clearExpiredNotifications(userEmail) {
        try {
            const now = Date.now();
            const notificationsRef = ref(database, `notifications/${this.sanitizeEmail(userEmail)}`);
            const snapshot = await new Promise((resolve) => {
                onValue(notificationsRef, resolve, { onlyOnce: true });
            });

            if (snapshot.exists()) {
                const promises = [];
                let expiredCount = 0;
                
                snapshot.forEach((childSnapshot) => {
                    const notification = childSnapshot.val();
                    // Eliminar notificaciones que tengan expiryDate y hayan expirado
                    if (notification.expiryDate && notification.expiryDate <= now) {
                        const childRef = ref(database, `notifications/${this.sanitizeEmail(userEmail)}/${childSnapshot.key}`);
                        promises.push(set(childRef, null));
                        expiredCount++;
                    }
                });

                if (promises.length > 0) {
                    await Promise.all(promises);
}
                
                return expiredCount;
            }
            
            return 0;
        } catch (error) {
return 0;
        }
    }

    async clearAllExpiredNotifications() {
        try {
            const now = Date.now();
            const notificationsRootRef = ref(database, 'notifications');
            const snapshot = await get(notificationsRootRef);
            
            if (!snapshot.exists()) {
                return 0;
            }

            let totalExpired = 0;
            const promises = [];

            // Iterar por cada usuario
            snapshot.forEach((userSnapshot) => {
                const userEmail = userSnapshot.key;
                
                // Iterar por cada notificación del usuario
                userSnapshot.forEach((notificationSnapshot) => {
                    const notification = notificationSnapshot.val();
                    
                    // Verificar si la notificación ha expirado
                    if (notification.expiryDate && notification.expiryDate <= now) {
                        const notificationRef = ref(database, `notifications/${userEmail}/${notificationSnapshot.key}`);
                        promises.push(set(notificationRef, null));
                        totalExpired++;
                    }
                });
            });

            if (promises.length > 0) {
                await Promise.all(promises);
}
            
            return totalExpired;
        } catch (error) {
return 0;
        }
    }

    // Métodos para crear notificaciones específicas de eventos
    async notifyUserAssignment(assignedUserEmail, assignerEmail, itemType, itemTitle, itemId, projectId) {
        const notification = {
            title: `Nuevo ${itemType} asignado`,
            message: `${assignerEmail} te ha asignado: "${itemTitle}"`,
            type: 'assignment',
            projectId: projectId,
            data: {
                itemType,
                itemId,
                assignerEmail,
                action: 'assigned'
            }
        };

        if (itemType === 'task') {
            notification.taskId = itemId;
        } else if (itemType === 'bug') {
            notification.bugId = itemId;
        }

        return await this.createNotification(assignedUserEmail, notification);
    }

    async notifyUserUnassignment(unassignedUserEmail, unassignerEmail, itemType, itemTitle, itemId, projectId) {
        const notification = {
            title: `${itemType} desasignado`,
            message: `${unassignerEmail} te ha desasignado de: "${itemTitle}"`,
            type: 'unassignment',
            projectId: projectId,
            data: {
                itemType,
                itemId,
                unassignerEmail,
                action: 'unassigned'
            }
        };

        if (itemType === 'task') {
            notification.taskId = itemId;
        } else if (itemType === 'bug') {
            notification.bugId = itemId;
        }

        return await this.createNotification(unassignedUserEmail, notification);
    }

    async sendPushNotification(userIdentifier, notificationData) {
        try {
            // Verificar si la notificación ha expirado antes de enviarla
            const now = Date.now();
            if (notificationData.expiryDate && notificationData.expiryDate <= now) {
return;
            }
            
// Intentar usar service worker para notificaciones persistentes (funciona cuando la página está cerrada)
            if ('serviceWorker' in navigator && 'Notification' in window && Notification.permission === 'granted') {
                try {
                    const registration = await navigator.serviceWorker.ready;
                    if (registration && registration.showNotification) {
                        await registration.showNotification(notificationData.title, {
                            body: notificationData.message,
                            icon: '/favicon.ico',
                            badge: '/favicon.ico',
                            tag: notificationData.id,
                            data: {
                                ...notificationData.data,
                                url: notificationData.url || '/'
                            },
                            requireInteraction: true,
                            actions: notificationData.url ? [
                                { action: 'open', title: 'Abrir' },
                                { action: 'close', title: 'Cerrar' }
                            ] : []
                        });
                        return;
                    }
                } catch (swError) {
                    // Silently ignore SW errors - will fallback to local notification
                }
            }

            // Fallback: Enviar push notification local si el navegador lo permite
            if ('Notification' in window && Notification.permission === 'granted') {
                const notification = new Notification(notificationData.title, {
                    body: notificationData.message,
                    icon: '/favicon.ico',
                    tag: notificationData.id,
                    data: notificationData.data
                });
                
                // Manejar clics en la notificación
                notification.onclick = (event) => {
                    event.preventDefault();
                    window.focus();
                    if (notificationData.url) {
                        window.open(notificationData.url, '_blank');
                    }
                    notification.close();
                };
            }
        } catch (error) {
            // Silently ignore notification errors
        }
    }
    
    async getUserEmailFromIdentifier(userIdentifier) {
        try {
            await entityDirectoryService.waitForInit?.();
            const devEmail = entityDirectoryService.resolveDeveloperEmail(userIdentifier);
            if (devEmail) {
                return devEmail;
            }
            const stkEmail = entityDirectoryService.resolveStakeholderEmail(userIdentifier);
            if (stkEmail) {
                return stkEmail;
            }
            
            // Si no se encuentra, devolver el identificador original
            return userIdentifier;
        } catch (error) {
return userIdentifier;
        }
    }

    showInAppNotification(payload) {
        // Mostrar notificación dentro de la aplicación
        const event = new CustomEvent('new-notification', {
            detail: {
                title: payload.notification?.title || payload.data?.title,
                message: payload.notification?.body || payload.data?.message,
                data: payload.data
            }
        });
        document.dispatchEvent(event);
    }

    isUserActive() {
        // Verificar si el usuario está actualmente navegando en la aplicación
        return document.visibilityState === 'visible';
    }

    // Método público para reinicializar FCM cuando cambie el usuario
    async reinitializeForUser(userEmail) {
        if (!this.isInitialized) {
// Esperar hasta que se inicialice
            await new Promise(resolve => {
                const checkInitialized = () => {
                    if (this.isInitialized) {
                        resolve();
                    } else {
                        setTimeout(checkInitialized, 100);
                    }
                };
                checkInitialized();
            });
        }

        if (this.messaging && userEmail) {
await this.setupFCMToken();
        }
    }

    unsubscribeFromNotifications(userEmail) {
        const subscription = this.userNotificationRefs.get(userEmail);
        if (subscription) {
            subscription.unsubscribe();
            this.userNotificationRefs.delete(userEmail);
        }
    }

    destroy() {
        // Limpiar todas las suscripciones
        this.userNotificationRefs.forEach((subscription) => {
            subscription.unsubscribe();
        });
        this.userNotificationRefs.clear();
        
        // Limpiar el intervalo de limpieza automática
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
}
    }

    // Función para crear notificación de prueba desde consola
    async createTestNotification(userEmail = null) {
        const testEmail = userEmail || window.currentUser?.email;
        if (!testEmail) {
return;
        }

        const testNotification = {
            title: 'Test Notification',
            message: 'Esta es una notificación de prueba para verificar el sistema FCM',
            type: 'info',
            data: {
                test: true,
                timestamp: Date.now()
            }
        };

        try {
            const result = await this.createNotification(testEmail, testNotification);
return result;
        } catch (error) {
throw error;
        }
    }

    // Función para crear notificación expirada de prueba (para testing)
    async createExpiredTestNotification(userEmail = null) {
        const testEmail = userEmail || window.currentUser?.email;
        if (!testEmail) {
return;
        }

        try {
            const notificationsRef = ref(database, `notifications/${this.sanitizeEmail(testEmail)}`);
            const newNotificationRef = push(notificationsRef);
            
            // Crear una notificación con fecha de expiración en el pasado
            const now = Date.now();
            const expiredDate = now - (24 * 60 * 60 * 1000); // Expirada hace 1 día
            
            const notificationData = {
                id: newNotificationRef.key,
                title: 'Notificación Expirada (Test)',
                message: 'Esta notificación está expirada y debería ser filtrada',
                type: 'info',
                read: false,
                timestamp: serverTimestamp(),
                createdAt: expiredDate,
                expiryDate: now - 1000, // Expirada hace 1 segundo
                data: {
                    test: true,
                    expired: true
                }
            };

            await set(newNotificationRef, notificationData);
// Verificar que la limpieza funciona
            setTimeout(async () => {
                await this.clearExpiredNotifications(testEmail);
}, 2000);
            
            return notificationData;
        } catch (error) {
throw error;
        }
    }

    // Función para probar el sistema de caducidad completo
    async testExpirySystem(userEmail = null) {
        const testEmail = userEmail || window.currentUser?.email;
        if (!testEmail) {
return;
        }
// 1. Crear notificación normal
await this.createTestNotification(testEmail);
        
        // 2. Crear notificación expirada
await this.createExpiredTestNotification(testEmail);
        
        // 3. Esperar y verificar suscripción
        setTimeout(() => {
          this.subscribeToNotifications(testEmail, () => {
            // Verification callback - intentionally empty
          });
        }, 3000);
        
        return '🔔 Test iniciado. Revisa los logs en los próximos segundos...';
    }
}

export const pushNotificationServicePromise = PushNotificationService.create();
