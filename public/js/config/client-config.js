/**
 * Client Configuration - Personalización por instancia
 * Este archivo será generado automáticamente por el instalador SaaS
 */

export const CLIENT_CONFIG = {
  // Identificación de la instancia
  instanceId: 'default',
  type: 'single-tenant', // 'single-tenant' | 'multi-tenant'
  displayName: 'Planning Game XP',
  
  // Configuración de dominio
  domain: window.location.hostname,
  baseUrl: window.location.origin,
  
  // Branding
  branding: {
    primaryColor: '#4a9eff',
    secondaryColor: '#333333',
    logoPath: '/assets/logo.png',
    faviconPath: '/assets/favicon.ico',
    appTitle: 'Planning Game XP',
    companyName: 'Your Company'
  },
  
  // Configuración de autenticación
  auth: {
    adminEmails: [
      'admin@example.com'
    ],
    allowedDomains: [
      '@example.com'
    ]
  },
  
  // Multi-tenant configuration (solo si type = 'multi-tenant')
  tenant: {
    id: null,
    databasePrefix: '',
    isolationLevel: 'database' // 'database' | 'schema' | 'row'
  },
  
  // Configuración de características
  features: {
    notifications: true,
    fileUpload: true,
    multiProject: true,
    realTimeCollaboration: true,
    exports: ['pdf', 'excel', 'json'],
    integrations: {
      slack: false,
      teams: false,
      jira: false,
      github: false
    }
  },
  
  // Configuración de sistemas de puntuación
  scoringSystems: {
    default: '1-5',
    available: ['1-5', '1-10', 'fibonacci', 't-shirt-sizes'],
    custom: []
  },
  
  // Configuración de actualizaciones (set enabled: false to opt-out)
  updates: {
    enabled: true
  },
  
  // Configuración de límites y quotas
  limits: {
    maxProjects: null, // null = unlimited
    maxUsers: null,
    maxStorageGB: null,
    maxFileSizeMB: 10
  },
  
  // Configuración de soporte
  support: {
    email: 'support@planninggame.com',
    phone: null,
    chatWidget: false,
    documentationUrl: 'https://docs.planninggame.com'
  },
  
  // Configuración de analytics (opcional)
  analytics: {
    enabled: false,
    googleAnalytics: null,
    customEvents: true
  },
  
  // Información de versión y licencia
  version: {
    app: '1.0.0',
    config: '1.0.0',
    compatibility: '1.x'
  },
  
  license: {
    type: 'commercial', // 'commercial' | 'trial' | 'open-source'
    expiresAt: null,
    features: []
  },
  
  development: {
    showVersionInfo: true,
    allowRemoteDebug: false
  }
};

// Función para obtener configuración con fallbacks
export function getConfig(key, defaultValue = null) {
  const keys = key.split('.');
  let value = CLIENT_CONFIG;
  
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      return defaultValue;
    }
  }
  
  return value;
}

// Función para verificar si una característica está habilitada
export function isFeatureEnabled(feature) {
  return getConfig(`features.${feature}`, false);
}

// Función para obtener URLs con el dominio correcto
export function getUrl(path = '') {
  const baseUrl = CLIENT_CONFIG.baseUrl || window.location.origin;
  return `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

// Función para verificar si el usuario es admin
export function isAdmin(email) {
  const adminEmails = getConfig('auth.adminEmails', []);
  return adminEmails.includes(email);
}

// Función para verificar dominio permitido
export function isAllowedDomain(email) {
  const allowedDomains = getConfig('auth.allowedDomains', []);
  return allowedDomains.some(domain => email.endsWith(domain));
}

// Exportar configuración de multi-tenant si aplica
export const TENANT_CONFIG = CLIENT_CONFIG.type === 'multi-tenant' ? {
  tenantId: CLIENT_CONFIG.tenant.id,
  databasePrefix: CLIENT_CONFIG.tenant.databasePrefix,
  isolationLevel: CLIENT_CONFIG.tenant.isolationLevel
} : null;