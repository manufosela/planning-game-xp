# Firebase Cloud Functions

Cloud Functions de PlanningGameXP. Todas desplegadas en la region `europe-west1`.

## Configuracion Requerida

### Firebase Secrets

```bash
firebase functions:secrets:set MS_CLIENT_ID
firebase functions:secrets:set MS_CLIENT_SECRET
firebase functions:secrets:set MS_TENANT_ID
firebase functions:secrets:set MS_FROM_EMAIL
firebase functions:secrets:set MS_ALERT_EMAIL
firebase functions:secrets:set IA_GLOBAL_ENABLE
firebase functions:secrets:set IA_API_KEY
firebase functions:secrets:set CREATE_CARD_API_KEY
```

### Azure AD App Registration

Necesario para el envio de emails via Microsoft Graph:

1. Crear App Registration en Azure AD
2. Permisos API: Microsoft Graph > Application permissions > `Mail.Send`
3. Generar Client Secret
4. Configurar los secrets `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, `MS_TENANT_ID`

### Variables de entorno (functions/.env)

Variables locales no-secret: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `SHAREPOINT_*`, `DEMO_MODE`, `MS_EMAIL_ENABLED`, etc. Ver `ENV_VARIABLES.md` para la lista completa.

| Variable | Default | Descripcion |
|----------|---------|-------------|
| `DEMO_MODE` | `false` | Activa modo demo (auto-allow users, disable emails/IA) |
| `MS_EMAIL_ENABLED` | `true` | Set to `false` for instances without Microsoft Auth. Skips MS secrets and email functions. |

## Funciones Disponibles

### Emails Programados (requieren MS Graph, desactivadas en DEMO_MODE o MS_EMAIL_ENABLED=false)

| Funcion | Tipo | Schedule | Descripcion |
|---------|------|----------|-------------|
| `weeklyTaskSummary` | Scheduled | Lunes 9:00 | Resumen semanal de tareas pendientes por proyecto |
| `testWeeklyTaskSummary` | HTTP GET | Manual | Test del resumen semanal. Soporta `?email=` para filtrar |
| `hourlyValidationDigest` | Scheduled | Cada hora | Digest consolidado de tareas movidas a "To Validate" |
| `testHourlyDigest` | HTTP GET | Manual | Test del digest horario. Soporta `?email=` para filtrar |

### Limpieza

| Funcion | Tipo | Schedule | Descripcion |
|---------|------|----------|-------------|
| `cleanupDemoUsers` | Scheduled | 3:00 AM diario | Elimina usuarios demo inactivos y sus datos |
| `testCleanupDemoUsers` | HTTP GET | Manual | Test manual de la limpieza de demos |

### Notificaciones Push

| Funcion | Tipo | Trigger | Descripcion |
|---------|------|---------|-------------|
| `sendPushNotification` | DB Trigger | `/notifications/{userId}/{notificationId}` created | Envia push notification via FCM al crear una notificacion |

### Autenticacion y Provisioning

| Funcion | Tipo | Descripcion |
|---------|------|-------------|
| `requestEmailAccess` | Callable | Solicitud de acceso por email (valida dominio permitido) |
| `setEncodedEmailClaim` | Auth Trigger (onCreate) | Asigna custom claim `encodedEmail` al crear usuario. En DEMO_MODE provisiona datos demo |

### IA (requieren IA_API_KEY, desactivadas en DEMO_MODE)

| Funcion | Tipo | Descripcion |
|---------|------|-------------|
| `generateAcceptanceCriteria` | Callable | Genera criterios de aceptacion (Given/When/Then) para una tarea |
| `analyzeBugDescription` | Callable | Analiza descripcion de bug: reproducibilidad, causa raiz, severidad |
| `getIaContext` | HTTP | Obtiene contexto del proyecto para prompts de IA |
| `createCard` | HTTP | API para crear cards externamente (requiere `CREATE_CARD_API_KEY`) |
| `createTasksFromPlan` | Callable | Crea tareas a partir de un plan de desarrollo |
| `regenerateTasksFromPlan` | Callable | Regenera tareas de un plan existente |
| `parseDocumentForCards` | Callable | Parsea un documento y genera cards automaticamente |
| `generateDevPlan` | Callable | Genera un plan de desarrollo a partir de una descripcion |
| `convertDescriptionToUserStory` | Callable | Convierte descripcion libre a formato user story (Como/Quiero/Para) |
| `getProjectEpics` | HTTP | API que devuelve las epicas de un proyecto (requiere `CREATE_CARD_API_KEY`) |

### Database Triggers (cards)

| Funcion | Trigger | Descripcion |
|---------|---------|-------------|
| `onCardToValidate` | `/cards/{projectId}/{section}/{cardId}` updated | Crea notificacion push y encola email cuando tarea pasa a "To Validate" |
| `onBugFixed` | `/cards/{projectId}/{section}/{cardId}` updated | Crea notificacion push y encola email cuando bug pasa a "Fixed" |
| `onPortalBugResolved` | `/cards/{projectId}/{section}/{cardId}` updated | Notifica al Portal de Incidencias cuando bug pasa a "Fixed"/"Verified" (no DEMO_MODE) |
| `onTaskStatusValidation` | `/cards/{projectId}/{section}/{cardId}` updated | Valida transiciones de estado y revierte cambios invalidos |
| `syncCardViews` | `/cards/{projectId}/{section}/{cardId}` written | Sincroniza datos a `/views` optimizadas (reduce transferencia ~70-80%) |

### Admin: Vistas

| Funcion | Tipo | Descripcion |
|---------|------|-------------|
| `resyncAllViews` | Callable | Regenera todas las entradas de `/views` desde `/cards` |

### Admin: Permisos de Apps

| Funcion | Tipo | Descripcion |
|---------|------|-------------|
| `syncAllAppAdminClaims` | Callable | Sincroniza custom claim `isAppAdmin` para todos los appAdmins |
| `addAppAdmin` | Callable | Anade un appAdmin a `/data/appAdmins` |
| `removeAppAdmin` | Callable | Elimina un appAdmin de `/data/appAdmins` |
| `addAppUploader` | Callable | Anade un app uploader a un proyecto |
| `removeAppUploader` | Callable | Elimina un app uploader de un proyecto |
| `updateAppPermissions` | Callable | Actualiza permisos de apps de un usuario en un proyecto |
| `syncAppAdminClaim` | DB Trigger | Sincroniza claim `isAppAdmin` al cambiar `/data/appAdmins/{email}` |
| `syncUserAllowedClaim` | DB Trigger | Sincroniza claim `allowed` al cambiar `/users/{email}/projects/{projectId}` |
| `syncAppPermissionsClaim` | DB Trigger | Reconstruye claim `appPerms` al cambiar `/users/{email}/projects` |

### Admin: Usuarios

| Funcion | Tipo | Descripcion |
|---------|------|-------------|
| `listUsers` | Callable | Lista usuarios de `/users/` enriquecidos con estado de Auth |
| `createOrUpdateUser` | Callable | Crea o actualiza usuario en `/users/{encodedEmail}` |
| `removeUserFromProject` | Callable | Desasigna un usuario de un proyecto |
| `deleteUser` | Callable | Elimina usuario de `/users/` y limpia rutas legacy |

## Estructura de Handlers

```
functions/
├── index.js                          # Entry point, exports todas las funciones
├── handlers/
│   ├── weekly-email.js               # Resumen semanal
│   ├── hourly-validation-digest.js   # Digest horario
│   ├── push-notification.js          # Push notifications
│   ├── demo-cleanup.js               # Limpieza de demos
│   ├── auth-provisioning.js          # Auth + provisioning
│   ├── on-card-to-validate.js        # Trigger: card → To Validate
│   ├── on-bug-fixed.js               # Trigger: bug → Fixed
│   ├── on-portal-bug-resolved.js     # Trigger: notificar Portal
│   ├── on-task-status-validation.js  # Trigger: validar transiciones
│   ├── sync-card-views.js            # Trigger: sync views
│   ├── admin-views.js                # Admin: resync views
│   ├── admin-permissions.js          # Admin: permisos de apps
│   ├── admin-users.js                # Admin: gestion de usuarios
│   ├── ia-acceptance-criteria.js     # IA: criterios de aceptacion
│   ├── ia-bug-analysis.js            # IA: analisis de bugs
│   ├── ia-context.js                 # IA: contexto del proyecto
│   ├── ia-create-card.js             # IA: crear card via API
│   ├── ia-plan-tasks.js              # IA: tareas desde plan
│   ├── ia-document-parser.js         # IA: parseo de documentos
│   ├── ia-dev-plan.js                # IA: generar plan
│   ├── ia-user-story.js              # IA: convertir a user story
│   └── ia-epics-api.js               # IA: API de epicas
├── shared/
│   ├── ms-graph.cjs                  # Microsoft Graph (auth + send email)
│   └── email-utils.cjs               # Utilidades de email
└── package.json
```

## DEMO_MODE

Cuando `DEMO_MODE=true` en `functions/.env`:

- Se desactivan funciones que requieren MS Graph (emails)
- Se desactivan funciones de IA (requieren API keys)
- `setEncodedEmailClaim` provisiona datos demo automaticamente
- `cleanupDemoUsers` limpia usuarios demo inactivos

## Despliegue

```bash
cd functions && npm install
firebase deploy --only functions
```

## Logs

```bash
firebase functions:log                              # Todos los logs
firebase functions:log --only weeklyTaskSummary     # Funcion especifica
```

## Testing Manual

```bash
# Resumen semanal (filtrado por email)
curl https://europe-west1-tu-proyecto.cloudfunctions.net/testWeeklyTaskSummary?email=dev@example.com

# Digest horario
curl https://europe-west1-tu-proyecto.cloudfunctions.net/testHourlyDigest

# Limpieza de demos
curl https://europe-west1-tu-proyecto.cloudfunctions.net/testCleanupDemoUsers
```
