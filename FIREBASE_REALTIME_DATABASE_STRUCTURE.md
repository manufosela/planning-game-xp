# Esquema de Base de Datos Firebase Realtime Database - PlanningGameXP

## Estructura General

La base de datos Firebase Realtime Database está organizada en las siguientes colecciones principales:

```
/
├── cards/           # Tarjetas de trabajo (tasks, bugs, epics, etc.)
├── data/            # Datos de configuración y metadatos
├── notifications/   # Notificaciones del sistema
├── projects/        # Proyectos
├── trash/           # Elementos eliminados (papelera)
├── userTokens/      # Tokens de usuarios para notificaciones push
├── wip/             # Work In Progress actual por developer
├── wipHistory/      # Historial de tareas WIP por developer
├── global/          # Configuración global de IA (agents, prompts, instructions)
├── global-history/  # Historial de cambios en configuración global
├── adrs/            # Architecture Decision Records por proyecto
├── adr-history/     # Historial de cambios en ADRs
├── aiExecutions/    # Ejecuciones de IA (Bridge → Karajan-Code)
└── aiExecutionsByCard/ # Índice de ejecuciones por tarjeta
```

## 1. Colección: `cards`

Contiene todas las tarjetas de trabajo organizadas por proyecto y tipo.

### Estructura:

```
cards/
├── {projectName}/
│   ├── {cardType}_{projectName}/
│   │   ├── {cardId}/
│   │   │   ├── acceptanceCriteria: string
│   │   │   ├── acceptanceCriteriaColor: string
│   │   │   ├── activeTab: string
│   │   │   ├── bugType: string (solo para bugs)
│   │   │   ├── bugTypeList: string[] (solo para bugs)
│   │   │   ├── canEditPermission: boolean
│   │   │   ├── cardId: string
│   │   │   ├── cardType: string
│   │   │   ├── cinemaFile: string (solo para bugs de Cinema4D)
│   │   │   ├── createdBy: string
│   │   │   ├── description: string
│   │   │   ├── descriptionColor: string
│   │   │   ├── developer: string
│   │   │   ├── developerList: object
│   │   │   ├── endDate: string
│   │   │   ├── expanded: boolean
│   │   │   ├── exportedFile: string
│   │   │   ├── group: string
│   │   │   ├── hasUnsavedChanges: boolean
│   │   │   ├── id: string
│   │   │   ├── importedFile: string
│   │   │   ├── isEditable: boolean
│   │   │   ├── isSaving: boolean
│   │   │   ├── notes: string
│   │   │   ├── notesColor: string
│   │   │   ├── originalFiles: object
│   │   │   ├── priority: string
│   │   │   ├── priorityColor: string
│   │   │   ├── projectId: string
│   │   │   ├── sprint: string
│   │   │   ├── sprintColor: string
│   │   │   ├── status: string
│   │   │   ├── statusColor: string
│   │   │   ├── title: string
│   │   │   ├── titleColor: string
│   │   │   └── ... (otros campos específicos por tipo)
```

### Tipos de Tarjetas:

- **Tasks**: `TASKS_{projectName}`
- **Bugs**: `BUGS_{projectName}`
- **Epics**: `EPICS_{projectName}`
- **Proposals**: `PROPOSALS_{projectName}`
- **QA**: `QA_{projectName}`
- **Sprints**: `SPRINTS_{projectName}`

### Campos Específicos por Tipo:

#### Tasks:

- `devPoints`: number
- `businessPoints`: number
- `assignee`: string
- `assigneeEmail`: string

#### Bugs:

- `bugType`: string
- `bugTypeList`: string[]
- `cinemaFile`: string
- `exportedFile`: string
- `importedFile`: string

#### Epics:

- `epicType`: string
- `epicTypeList`: string[]

### Convenciones de Nomenclatura para IDs:

- **Tasks**: `{PROJECT_PREFIX}-TSK-{NUMBER}`
- **Bugs**: `{PROJECT_PREFIX}-BUG-{NUMBER}`
- **Epics**: `{PROJECT_PREFIX}-EPIC-{NUMBER}`
- **Proposals**: `{PROJECT_PREFIX}-PROP-{NUMBER}`
- **QA**: `{PROJECT_PREFIX}-QA-{NUMBER}`
- **Sprints**: `{PROJECT_PREFIX}-SPR-{NUMBER}`

### Ejemplos:

- `C4D-BUG-0001`: Bug #1 del proyecto Cinema4D
- `NTR-TSK-0088`: Task #88 del proyecto Intranet
- `MRK-EPIC-0001`: Epic #1 del proyecto Marketing

### Estados de Tarjetas:

#### Estados Comunes:
- `To Do`: Pendiente de hacer
- `In Progress`: En progreso
- `Done`: Completado
- `To Validate`: Pendiente de validación

#### Estados Específicos:
- `Blocked`: Bloqueado
- `Cancelled`: Cancelado
- `On Hold`: En espera

### Sistema de Puntuación:

#### Tasks:
- `devPoints`: Puntos de desarrollo (0-13)
- `businessPoints`: Puntos de negocio (0-13)

#### Sistema de Scoring:
- `1-5`: Escala de 1 a 5 puntos
- `1-8`: Escala de 1 a 8 puntos
- `1-13`: Escala de 1 a 13 puntos (Fibonacci)

## 2. Colección: `projects`

Contiene la información de los proyectos.

### Estructura:

```
projects/
├── {projectName}/
│   ├── createdAt: string
│   ├── createdBy: string
│   ├── description: string
│   ├── name: string
│   ├── scoringSystem: string
│   └── stakeholders: object
```

## 3. Colección: `notifications`

Contiene las notificaciones del sistema organizadas por usuario.

### Estructura:

```
notifications/
├── {userEmail}/
│   ├── {notificationId}/
│   │   ├── data: object
│   │   │   ├── action: string
│   │   │   ├── assignerEmail: string
│   │   │   ├── itemId: string
│   │   │   ├── itemType: string
│   │   │   ├── fieldName: string (para updates)
│   │   │   ├── newValue: any
│   │   │   ├── oldValue: any
│   │   │   ├── updaterEmail: string
│   │   │   └── url: string
│   │   ├── id: string
│   │   ├── message: string
│   │   ├── projectId: string
│   │   ├── read: boolean
│   │   ├── timestamp: number
│   │   ├── title: string
│   │   ├── type: string
│   │   └── url: string
```

### Ejemplo de estructura de notificaciones:

```json
{
  "notifications": {
    "user_email_com": {
      "notificationId1": {
        "id": "notificationId1",
        "title": "Nuevo task asignado",
        "message": "usuario@ejemplo.com te ha asignado: \"Implementar login\"",
        "type": "assignment",
        "read": false,
        "timestamp": 1704067200000,
        "projectId": "planning-game",
        "taskId": "task123",
        "bugId": null,
        "data": {
          "itemType": "task",
          "itemId": "task123",
          "assignerEmail": "usuario@ejemplo.com",
          "action": "assigned"
        }
      },
      "notificationId2": {
        "id": "notificationId2",
        "title": "Bug desasignado",
        "message": "admin@proyecto.com te ha desasignado de: \"Error en validación\"",
        "type": "unassignment",
        "read": true,
        "timestamp": 1704063600000,
        "projectId": "planning-game",
        "taskId": null,
        "bugId": "bug456",
        "data": {
          "itemType": "bug",
          "itemId": "bug456",
          "unassignerEmail": "admin@proyecto.com",
          "action": "unassigned"
        }
      }
    }
  }
}
```

### Campos de notificación:

#### Campos principales:
- **id**: ID único de la notificación
- **title**: Título de la notificación
- **message**: Mensaje descriptivo
- **type**: Tipo de notificación (`assignment`, `unassignment`, `info`, etc.)
- **read**: Boolean que indica si fue leída
- **timestamp**: Timestamp de creación

#### Campos de contexto:
- **projectId**: ID del proyecto relacionado
- **taskId**: ID de la task (si aplica)
- **bugId**: ID del bug (si aplica)

#### Campo data:
Objeto con información adicional:
- **itemType**: `task`, `bug`, `revisión de task`
- **itemId**: ID del elemento
- **assignerEmail**: Email del usuario que asigna
- **unassignerEmail**: Email del usuario que desasigna
- **action**: `assigned`, `unassigned`

### Tipos de Notificaciones:

- `assignment`: Asignación de tareas/bugs
- `update`: Actualización de campos

#### Ejemplo tipo `assignment`:
```javascript
{
  title: "Nuevo task asignado",
  message: "usuario@ejemplo.com te ha asignado: \"Título del task\"",
  type: "assignment"
}
```

#### Ejemplo tipo `unassignment`:
```javascript
{
  title: "Task desasignado", 
  message: "usuario@ejemplo.com te ha desasignado de: \"Título del task\"",
  type: "unassignment"
}
```

### Eventos que generan notificaciones:

#### 1. Asignación de Developer
- **Task**: Cuando se asigna un developer a una task
- **Bug**: Cuando se asigna un developer a un bug

#### 2. Asignación de Validator (solo Tasks)
- **Task**: Cuando se asigna un stakeholder como validator

#### 3. Desasignación
- **Task/Bug**: Cuando se remueve un developer o validator

## 4. Colección: `userTokens`

Contiene los tokens de Firebase Cloud Messaging para notificaciones push.

### Estructura:

```
userTokens/
├── {userId}/
│   ├── email: string
│   ├── timestamp: number
│   ├── lastUpdated: number (opcional)
│   └── token: string
```

### Ejemplo:

```json
{
  "userTokens": {
    "user_email_com": {
      "token": "fcm_token_here",
      "timestamp": 1704067200000,
      "email": "user@email.com"
    }
  }
}
```

## 5. Colección: `data`

Contiene datos de configuración y metadatos del sistema.

### Estructura:

```
data/
├── {dataType}/
│   └── ... (estructura específica por tipo de dato)
```

## 6. Colección: `trash`

Contiene elementos eliminados (papelera).

### Estructura:

```
trash/
├── cards/
│   ├── {projectName}/
│   │   ├── {cardType}_{projectName}/
│   │   │   ├── {cardId}/
│   │   │   │   ├── ... (mismos campos que cards)
│   │   │   │   ├── deletedAt: string
│   │   │   │   └── deletedBy: string
```

## Reglas de Validación

### Campos Obligatorios:

- `cardId`: Identificador único de la tarjeta
- `cardType`: Tipo de tarjeta (task-card, bug-card, epic-card, etc.)
- `createdBy`: Email del creador
- `projectId`: ID del proyecto
- `title`: Título de la tarjeta

### Campos Opcionales:

- `description`: Descripción detallada
- `status`: Estado actual (To Do, In Progress, Done, To Validate)
- `priority`: Prioridad (Low, Medium, High, Critical)
- `developer`: Desarrollador asignado
- `endDate`: Fecha de finalización
- `sprint`: Sprint asignado

## Permisos y Seguridad

### Campos de Permisos:

- `canEditPermission`: boolean
- `isEditable`: boolean
- `hasUnsavedChanges`: boolean
- `isSaving`: boolean

### Control de Acceso:

- Basado en email del usuario
- Stakeholders definidos por proyecto
- Permisos de edición por tarjeta

### Reglas de Firebase Realtime Database:

```json
{
  "rules": {
    "notifications": {
      "$userEmail": {
        ".read": "$userEmail === auth.token.email.replace('.', '_').replace('#', '_').replace('$', '_').replace('[', '_').replace(']', '_')",
        ".write": "auth != null",
        "$notificationId": {
          ".validate": "newData.hasChildren(['id', 'title', 'message', 'type', 'read', 'timestamp'])"
        }
      }
    },
    "userTokens": {
      "$userEmail": {
        ".read": "$userEmail === auth.token.email.replace('.', '_').replace('#', '_').replace('$', '_').replace('[', '_').replace(']', '_')",
        ".write": "$userEmail === auth.token.email.replace('.', '_').replace('#', '_').replace('$', '_').replace('[', '_').replace(']', '_')"
      }
    }
  }
}
```

## Configuración necesaria

### 1. En Firebase Console:
1. Ir a **Realtime Database**
2. Configurar las reglas de seguridad mostradas arriba
3. Verificar que la URL de la database coincida con la del proyecto

### 2. VAPID Key:
Ya configurada en los archivos `.env.*` como `PUBLIC_FIREBASE_VAPID_KEY`

### 3. Service Worker:
Ya existe en `/public/firebase-messaging-sw.js`

## Funcionalidades implementadas

### Campanita de notificaciones:
- ✅ Componente `NotificationBell` creado
- ✅ Integrado en `ProjectSelector`
- ✅ Modal con tabs (no leídas / leídas)
- ✅ Contador de notificaciones no leídas
- ✅ Acciones: marcar como leída, marcar todas, limpiar leídas

### Servicio de notificaciones:
- ✅ `PushNotificationService` implementado
- ✅ Suscripción a cambios en tiempo real
- ✅ Gestión de tokens FCM
- ✅ Métodos para crear notificaciones

### Integración con eventos:
- ✅ Detecta cambios de asignación en `unified-event-system.js`
- ✅ Compara datos anteriores vs actuales
- ✅ Envía notificaciones automáticamente
- ✅ Soporta tanto developers como validators

## Uso

El sistema funcionará automáticamente una vez desplegado:

1. **Usuario asigna un task/bug**: Se envía notificación push al asignado
2. **Usuario abre la app**: Ve la campanita con contador de no leídas
3. **Usuario hace clic**: Ve modal con notificaciones organizadas por tabs
4. **Usuario lee notificación**: Se marca automáticamente como leída

## Testing

Para probar el sistema:

1. Asignar/desasignar usuarios en tasks/bugs
2. Verificar que aparecen las notificaciones en tiempo real
3. Probar el modal de notificaciones
4. Verificar los logs en consola (`sinsole.log`)

## 7. Colección: `wip`

Contiene el estado actual de Work In Progress por developer. Un developer solo puede tener una tarea "In Progress" a la vez.

### Estructura:

```
wip/
├── {developerKey}/
│   ├── taskId: string           # ID de la tarea actual
│   ├── taskTitle: string        # Título de la tarea
│   ├── projectId: string        # ID del proyecto
│   ├── startedAt: string        # ISO timestamp de inicio
│   ├── developer: string        # Email del developer
│   └── developerName: string    # Nombre del developer
```

### Ejemplo:

```json
{
  "wip": {
    "admin|example!com": {
      "taskId": "PLN-TSK-0042",
      "taskTitle": "Implementar filtros avanzados",
      "projectId": "planning-game",
      "startedAt": "2025-12-03T10:30:00.000Z",
      "developer": "admin@example.com",
      "developerName": "Mánu Fosela"
    }
  }
}
```

### Notas:
- La clave `developerKey` es el email codificado con `encodeEmailForFirebase()`
- Cuando un developer no tiene tarea activa, su entrada se elimina de `/wip`
- La entrada se actualiza automáticamente cuando cambia el estado de una tarea a/desde "In Progress"

## 8. Colección: `wipHistory`

Contiene el historial de todas las tareas que cada developer ha tenido en "In Progress".

### Estructura:

```
wipHistory/
├── {developerKey}/
│   ├── {entryId}/              # Timestamp como ID único
│   │   ├── taskId: string
│   │   ├── taskTitle: string
│   │   ├── projectId: string
│   │   ├── developer: string
│   │   ├── developerName: string
│   │   ├── startedAt: string    # ISO timestamp de inicio
│   │   ├── endedAt: string      # ISO timestamp de fin
│   │   ├── durationMs: number   # Duración en milisegundos
│   │   ├── endReason: string    # 'completed' | 'switched' | 'unassigned'
│   │   └── finalStatus: string  # Estado final de la tarea ('Done', 'To Do', etc.)
```

### Valores de `endReason`:

- **completed**: La tarea se marcó como "Done"
- **switched**: El developer cambió a otra tarea (la anterior pasó a "To Do")
- **unassigned**: El developer fue desasignado de la tarea

### Ejemplo:

```json
{
  "wipHistory": {
    "admin|example!com": {
      "1701600000000": {
        "taskId": "PLN-TSK-0041",
        "taskTitle": "Diseñar componente de login",
        "projectId": "planning-game",
        "developer": "admin@example.com",
        "developerName": "Mánu Fosela",
        "startedAt": "2025-12-02T09:00:00.000Z",
        "endedAt": "2025-12-03T10:30:00.000Z",
        "durationMs": 91800000,
        "endReason": "completed",
        "finalStatus": "Done"
      },
      "1701500000000": {
        "taskId": "PLN-TSK-0040",
        "taskTitle": "Revisar estilos",
        "projectId": "planning-game",
        "developer": "admin@example.com",
        "developerName": "Mánu Fosela",
        "startedAt": "2025-12-01T14:00:00.000Z",
        "endedAt": "2025-12-02T09:00:00.000Z",
        "durationMs": 68400000,
        "endReason": "switched",
        "finalStatus": "To Do"
      }
    }
  }
}
```

### Uso:
- La página `/wip` muestra el estado actual de todos los developers
- La página `/developers` (solo superadmin) mostrará el historial completo con estadísticas

## 9. Colección: `global`

Contiene configuraciones globales de IA que pueden ser asignadas a múltiples proyectos.

### Estructura:

```
global/
├── agents/
│   ├── {agentId}/
│   │   ├── name: string
│   │   ├── description: string
│   │   ├── content: string (markdown)
│   │   ├── category: string
│   │   ├── createdAt: string
│   │   ├── createdBy: string
│   │   ├── updatedAt: string
│   │   └── updatedBy: string
├── prompts/
│   ├── {promptId}/
│   │   └── ... (misma estructura que agents)
└── instructions/
    ├── {instructionId}/
        └── ... (misma estructura que agents)
```

### Categorías disponibles:

- `development`: Desarrollo de código
- `planning`: Planificación y estimación
- `qa`: Testing y calidad
- `documentation`: Documentación
- `architecture`: Decisiones técnicas

### Ejemplo:

```json
{
  "global": {
    "agents": {
      "agent_developer": {
        "name": "BecarIA Developer",
        "description": "Agente para desarrollo de código con buenas prácticas",
        "category": "development",
        "content": "# BecarIA Developer Agent\n\n## Comportamiento\n...",
        "createdAt": "2026-01-31T10:00:00.000Z",
        "createdBy": "admin@example.com",
        "updatedAt": "2026-01-31T10:00:00.000Z",
        "updatedBy": "admin@example.com"
      }
    },
    "prompts": {
      "prompt_estimation": {
        "name": "Task Estimation",
        "description": "Prompt para estimar devPoints y businessPoints",
        "category": "planning",
        "content": "## Escala devPoints (1-5)\n...",
        "createdAt": "2026-01-31T10:00:00.000Z",
        "createdBy": "admin@example.com"
      }
    },
    "instructions": {
      "instr_code_style": {
        "name": "Code Style Guidelines",
        "description": "Guías de estilo de código",
        "category": "development",
        "content": "# Code Style Guidelines\n\n## Principios\n..."
      }
    }
  }
}
```

### Relación con proyectos:

Los proyectos referencian configuraciones globales mediante arrays de IDs:

```json
{
  "projects": {
    "Cinema4D": {
      "name": "Cinema4D",
      "selectedAgents": ["agent_developer", "agent_reviewer"],
      "selectedPrompts": ["prompt_estimation"],
      "selectedInstructions": ["instr_code_style", "instr_testing"]
    }
  }
}
```

## 10. Colección: `global-history`

Contiene el historial de cambios de las configuraciones globales.

### Estructura:

```
global-history/
├── agents/
│   ├── {agentId}/
│   │   ├── {historyId}/
│   │   │   ├── timestamp: string
│   │   │   ├── updatedBy: string
│   │   │   ├── changes: object
│   │   │   └── previousValues: object
├── prompts/
│   └── {promptId}/...
└── instructions/
    └── {instructionId}/...
```

## 11. Colección: `adrs`

Contiene los Architecture Decision Records (ADRs) organizados por proyecto.

### Estructura:

```
adrs/
├── {projectId}/
│   ├── {adrId}/
│   │   ├── id: string
│   │   ├── title: string
│   │   ├── status: string ("proposed" | "accepted" | "deprecated" | "superseded")
│   │   ├── context: string (markdown)
│   │   ├── decision: string (markdown)
│   │   ├── consequences: string (markdown)
│   │   ├── supersededBy: string | null
│   │   ├── createdAt: string
│   │   ├── createdBy: string
│   │   ├── updatedAt: string
│   │   └── updatedBy: string
```

### Estados de ADR:

| Estado | Significado |
|--------|-------------|
| `proposed` | En discusión, pendiente de aprobación |
| `accepted` | Aprobado y vigente |
| `deprecated` | Ya no se recomienda, pero existe código que lo usa |
| `superseded` | Reemplazado por otro ADR (ver `supersededBy`) |

### Ejemplo:

```json
{
  "adrs": {
    "PlanningGame": {
      "adr_001": {
        "id": "adr_001",
        "title": "Use Firebase Realtime Database as Primary Data Store",
        "status": "accepted",
        "context": "La aplicación necesita una base de datos que:\n- Sincronice datos en tiempo real\n- Funcione offline\n...",
        "decision": "Usaremos Firebase Realtime Database porque:\n- Sync nativo en tiempo real\n- Estructura JSON simple\n...",
        "consequences": "Positivas:\n- Updates en tiempo real\n- Modelo simple\n\nNegativas:\n- Queries limitados\n- Vendor lock-in",
        "supersededBy": null,
        "createdAt": "2024-01-15T10:00:00.000Z",
        "createdBy": "admin@example.com",
        "updatedAt": "2026-01-31T10:00:00.000Z",
        "updatedBy": "admin@example.com"
      }
    }
  }
}
```

## 12. Colección: `adr-history`

Contiene el historial de cambios de los ADRs.

### Estructura:

```
adr-history/
├── {projectId}/
│   ├── {adrId}/
│   │   ├── {historyId}/
│   │   │   ├── timestamp: string
│   │   │   ├── updatedBy: string
│   │   │   ├── changes: object
│   │   │   └── previousValues: object
```

## 13. Colección: `aiExecutions`

Contiene los registros de ejecuciones de IA lanzadas desde la UI de Planning Game a través del Bridge Server hacia Karajan-Code.

### Estructura:

```
aiExecutions/
├── {executionId}/
│   ├── executionId: string           # ID único (exec_xxxxxxxxxxxx)
│   ├── cardId: string                # Card ID (PLN-TSK-0042)
│   ├── cardType: string              # "task" | "bug"
│   ├── projectId: string             # ID del proyecto
│   ├── firebaseCardId: string        # Firebase push key de la card
│   ├── status: string                # "queued" | "running" | "completed" | "failed" | "cancelled"
│   ├── phase: string                 # "coder" | "sonar" | "reviewer" | null
│   ├── iteration: number             # Iteración actual (1-based)
│   ├── maxIterations: number         # Máximo de iteraciones configuradas
│   ├── requestedBy: string           # Developer ID que solicitó la ejecución
│   ├── requestedAt: string           # ISO timestamp de la solicitud
│   ├── startedAt: string | null      # ISO timestamp de inicio real
│   ├── completedAt: string | null    # ISO timestamp de finalización
│   ├── bridgeInstanceId: string      # ID de la instancia Bridge
│   ├── kjSessionId: string | null    # ID de sesión de Karajan-Code
│   ├── checkpoints/
│   │   ├── {index}/
│   │   │   ├── stage: string         # "coder" | "sonar" | "reviewer"
│   │   │   ├── iteration: number
│   │   │   ├── status: string        # "running" | "completed" | "failed"
│   │   │   ├── timestamp: string
│   │   │   └── summary: string | null
│   ├── result: object | null         # Resultado final (commits, archivos, etc.)
│   └── error: string | null          # Mensaje de error si falló
```

### Estados de ejecución:

| Estado | Significado |
|--------|-------------|
| `queued` | Solicitud recibida, pendiente de iniciar |
| `running` | KJ está ejecutando la tarea |
| `completed` | Ejecución finalizada con éxito |
| `failed` | Ejecución falló |
| `cancelled` | Cancelada por el usuario |

### Ejemplo:

```json
{
  "aiExecutions": {
    "exec_a1b2c3d4e5f6": {
      "executionId": "exec_a1b2c3d4e5f6",
      "cardId": "PLN-TSK-0042",
      "cardType": "task",
      "projectId": "PlanningGame",
      "firebaseCardId": "-NxyzAbcDef",
      "status": "running",
      "phase": "coder",
      "iteration": 1,
      "maxIterations": 3,
      "requestedBy": "dev_010",
      "requestedAt": "2026-02-14T10:30:00Z",
      "startedAt": "2026-02-14T10:30:05Z",
      "completedAt": null,
      "bridgeInstanceId": "bridge-pro",
      "kjSessionId": "s_2026-02-14T10-30-05-123Z",
      "checkpoints": {
        "0": { "stage": "coder", "iteration": 1, "status": "completed", "timestamp": "2026-02-14T10:31:00Z", "summary": "Generated implementation" },
        "1": { "stage": "sonar", "iteration": 1, "status": "running", "timestamp": "2026-02-14T10:32:00Z" }
      },
      "result": null,
      "error": null
    }
  }
}
```

## 14. Colección: `aiExecutionsByCard`

Índice secundario que permite buscar ejecuciones por tarjeta de forma eficiente.

### Estructura:

```
aiExecutionsByCard/
├── {projectId}/
│   ├── {firebaseCardId}/
│   │   ├── latestExecutionId: string    # ID de la última ejecución
│   │   └── history/
│   │       ├── {executionId}/
│   │       │   ├── status: string
│   │       │   ├── requestedAt: string
│   │       │   └── requestedBy: string
```

### Ejemplo:

```json
{
  "aiExecutionsByCard": {
    "PlanningGame": {
      "-NxyzAbcDef": {
        "latestExecutionId": "exec_a1b2c3d4e5f6",
        "history": {
          "exec_a1b2c3d4e5f6": {
            "status": "running",
            "requestedAt": "2026-02-14T10:30:00Z",
            "requestedBy": "dev_010"
          }
        }
      }
    }
  }
}
```

> Para más información sobre el sistema de configuración global y ADRs, ver [GLOBAL_CONFIG.md](./GLOBAL_CONFIG.md)