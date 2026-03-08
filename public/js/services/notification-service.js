import { dalService } from './dal-service.js';
import { sanitizeEmailForFirebase } from '../utils/email-sanitizer.js';
import { pushNotificationServicePromise } from './push-notification-service.js';
import { entityDirectoryService } from './entity-directory-service.js';
import { APP_CONSTANTS } from '../constants/app-constants.js';

class NotificationService {
    constructor() {
        window.notificationService = this;
    }

    sanitizeEmail(email) {
        // Usar email completo sanitizado para coincidir con las reglas de Firebase
        return sanitizeEmailForFirebase(email, false);
    }

    // Función para obtener el identificador correcto del usuario
    // Puede recibir un email o un nombre y devuelve la clave sanitizada
    async getUserKey(userIdentifier) {
// Si es un email, usar la parte antes del @
        if (userIdentifier.includes('@')) {
            return this.sanitizeEmail(userIdentifier);
        }
        
        // Resolver por directorio de entidades (developers/stakeholders)
        try {
            await entityDirectoryService.waitForInit?.();
            const devEmail = entityDirectoryService.resolveDeveloperEmail(userIdentifier);
            if (devEmail) {
                return this.sanitizeEmail(devEmail);
            }
            const stkEmail = entityDirectoryService.resolveStakeholderEmail(userIdentifier);
            if (stkEmail) {
                return this.sanitizeEmail(stkEmail);
            }
        } catch (error) {
            // Silently ignore - will fallback to name-based key
        }

        // Si no se encuentra en Firebase, crear una clave basada en el nombre
return userIdentifier
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // Remover acentos
            .replace(/\s+/g, '_') // Espacios a guiones bajos
            .replace(/[^a-z0-9_]/g, ''); // Solo letras, números y guiones bajos
    }

    async createNotification(userIdentifier, notification) {
        try {
            const userKey = await this.getUserKey(userIdentifier);

            const notificationData = {
                title: notification.title || 'Notificación',
                message: notification.message || notification.body || 'Sin mensaje',
                type: notification.type || 'info',
                read: false,
                timestamp: Date.now(),
                url: notification.url || null,
                data: notification.data || {},
                projectId: notification.projectId || null,
                taskId: notification.taskId || null,
                bugId: notification.bugId || null
            };

            const notificationId = await dalService.notifications.addNotification(userKey, notificationData);
            notificationData.id = notificationId;
            
            // Enviar push notification utilizando el PushNotificationService
            
            if ((await pushNotificationServicePromise) && !(await pushNotificationServicePromise).isUserActive()) {
              await (await pushNotificationServicePromise).sendPushNotification(userIdentifier, notificationData);
            }
            return notificationData;
        } catch (error) {
throw error;
        }
    }

    // Función para crear notificación de prueba desde consola
    async createTestNotification(userIdentifier = null) {
        const testUser = userIdentifier || window.currentUser?.email;
        if (!testUser) {
return;
        }

        const testNotification = {
            title: 'Test Notification',
            message: 'Esta es una notificación de prueba para verificar el sistema',
            type: 'info',
            data: {
                test: true,
                timestamp: Date.now()
            }
        };

        try {
            const result = await this.createNotification(testUser, testNotification);
return result;
        } catch (error) {
throw error;
        }
    }

    // Función para generar URL de la tarea/elemento
    generateItemUrl(itemType, itemId, projectId) {
        const baseUrl = `${APP_CONSTANTS.APP_URL}/adminproject/?projectId=${encodeURIComponent(projectId)}&cardId=${itemId}`;
        
        // Añadir el hash según el tipo de elemento
        let finalUrl;
        switch(itemType) {
            case 'task':
                finalUrl = `${baseUrl}#tasks`;
                break;
            case 'bug':
                finalUrl = `${baseUrl}#bugs`;
                break;
            case 'epic':
                finalUrl = `${baseUrl}#epics`;
                break;
            case 'sprint':
                finalUrl = `${baseUrl}#sprints`;
                break;
            default:
                finalUrl = baseUrl;
        }
return finalUrl;
    }

    // Métodos para crear notificaciones específicas de eventos
    async notifyUserAssignment(assignedUserEmail, assignerEmail, itemType, itemTitle, itemId, projectId) {
        const itemUrl = this.generateItemUrl(itemType, itemId, projectId);
        const notification = {
            title: `Nuevo ${itemType} asignado`,
            message: `${assignerEmail} te ha asignado: "${itemTitle}"`,
            type: 'assignment',
            projectId: projectId,
            url: itemUrl, // Añadir URL para enlace directo
            data: {
                itemType,
                itemId,
                assignerEmail,
                action: 'assigned',
                url: itemUrl
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
        const itemUrl = this.generateItemUrl(itemType, itemId, projectId);
        const notification = {
            title: `${itemType} desasignado`,
            message: `${unassignerEmail} te ha desasignado de: "${itemTitle}"`,
            type: 'unassignment',
            projectId: projectId,
            url: itemUrl, // Añadir URL para enlace directo
            data: {
                itemType,
                itemId,
                unassignerEmail,
                action: 'unassigned',
                url: itemUrl
            }
        };

        if (itemType === 'task') {
            notification.taskId = itemId;
        } else if (itemType === 'bug') {
            notification.bugId = itemId;
        }

        return await this.createNotification(unassignedUserEmail, notification);
    }
}

export { NotificationService };
export const notificationService = new NotificationService();
