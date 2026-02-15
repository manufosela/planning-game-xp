# TODO

## Completados

### 1. ~~Quiero poder migrar las propuestas de una año ACTUAL - 1 al ACTUAL (solo este caso)~~
- Implementado en `table-view-manager.js` con botón "Importar de {año anterior}"
- Solo aparece al ver propuestas del año actual o anterior
- Confirma antes de mover las propuestas

### 2. ~~Seccion Proposals que funcione~~
- ✅ Poder ver las propuestas por proyecto de manera agrupada, sin tener que entrar en cada proyecto.
- ✅ Que se vean los proyectos con detail/summary todos colapsados por defecto.
- ✅ Al descolapsar se ve el listado de propuestas del proyecto.
- ✅ La vista de propuestas que sea un tabla
- ✅ Al final de la tabla que se pueda editar (expandir) y convertir en task.
- ✅ Al convertir en task que se genere el acceptance test.

Implementado en:
- `/proposals` - página con GlobalProposalsList
- `GlobalProposalsList.js` - vista general y por proyecto (colapsables)
- `ProposalCard.js` - edición y conversión a tarea con IA

### 3. ~~BugCard IA - Mejoras~~
- ✅ Modal de clarificación - Ancho aumentado de 400px a 600px
- ✅ Comportamiento "Guardar sin IA" - El modal se cierra antes de colapsar la card
- ✅ Separar análisis de descripción de generación de AC
- ✅ Nuevo botón "✨ Mejorar con IA" en tab Description (flujo opcional)
- ✅ Flujo de guardado simplificado (genera AC automáticamente si no existen)

Implementado en:
- `/public/js/wc/BugCard.js` - Nuevos métodos `_loadIaEnabled()`, `_improveDescriptionWithIa()`, `_analyzeDescription()`
- `/public/js/wc/bug-card-styles.js` - Estilos para botón `.improve-ia-button`

### 4. ~~Gestión de usuarios - Sistema de permisos por proyecto~~
- ✅ Registro automático de usuarios al login (crea entrada en `/data/projectsByUser/{email}`)
- ✅ Filtrado de proyectos según asignación del usuario
- ✅ Proyectos por defecto para usuarios nuevos (CINEMA, EXTRANET, INTRANET)
- ✅ UI de gestión existente en `/src/pages/index.astro` (pestaña "Gestión de Usuarios")

Implementado en:
- `/public/js/services/firebase-service.js` - Nuevos métodos `registerUserLogin()`, `getUserProjects()`, `getDefaultProjects()`, `loadProjects()` modificado
- `/public/js/controllers/app-controller.js` - `loadInitialData()` modificado para registrar y filtrar

Estructura de datos:
- `/data/projectsByUser/{emailEncoded}`: "PROJECT1, PROJECT2" o "All"
- `/data/config/defaultProjects`: "CINEMA, EXTRANET, INTRANET" (crear manualmente)

### 5. ~~Cloud Functions - Migración a Europa~~
- ✅ `setEncodedEmailClaim` movida de us-central1 a europe-west1
- ✅ Todas las demás funciones ya estaban en europe-west1

Implementado en:
- `/functions/index.js` - Añadido `region('europe-west1')` al trigger de Auth

### 6. ~~Sistema de Gestión Avanzada de Apps~~
- ✅ Marcar apps como **canary** o **release**
- ✅ Subir changelog/mejoras que se muestran al descargar
- ✅ Developers del proyecto pueden subir apps (quedan **pending** hasta aprobación)
- ✅ Super Admin aprueba apps para hacerlas visibles
- ✅ Sistema de **deprecación** reversible (deprecar/restaurar)
- ✅ **Retrocompatibilidad**: Apps sin metadatos se tratan como release/approved

Implementado en:
- `/public/js/wc/AppManager.js` - Lógica principal, formulario, permisos
- `/public/js/wc/app-manager-styles.js` - Badges, estilos nuevos
- `/src/pages/app-share.astro` - Mostrar changelog, badge, bloquear deprecated

Estructura de datos:
- `/appMetadata/{projectId}/{fileKey}`: `{ fileName, type, status, changelog, uploadedBy, ... }`
- `type`: "canary" | "release"
- `status`: "pending" | "approved" | "deprecated"

### 7. ~~Apps legacy - Permitir modificar apps sin metadatos~~
- ✅ Las apps subidas antes del sistema de metadatos ahora se pueden descatalogar, aprobar y restaurar
- ✅ Nuevo método `_ensureAppMetadata()` crea metadatos por defecto (release/approved) automáticamente
- ✅ Métodos modificados: `_deprecateApp()`, `_approveApp()`, `_restoreApp()`

Implementado en:
- `/public/js/wc/AppManager.js` - Nuevo método `_ensureAppMetadata()` y actualización de métodos de gestión

### 8. ~~Quitar "desired date" de las tareas~~
- ✅ Campo eliminado del formulario de TaskCard
- ✅ Campo eliminado de los datos que se guardan (`_getCardData`)
- ✅ Campo eliminado de la conversión Proposal → Task

Implementado en:
- `/public/js/wc/TaskCard.js` - Eliminado input y campo en `_getCardData()`
- `/public/js/wc/ProposalCard.js` - Eliminado de conversión a Task

Nota: Los datos existentes en BD mantienen el campo, solo se deja de mostrar y guardar.

### 9. ~~Flash al cerrar modal de TaskCard~~
- ✅ El modal ahora se cierra sin mostrar la vista compacta brevemente
- ✅ `expanded = false` se ejecuta ANTES de disparar `modal-close-confirmed`

Implementado en:
- `/public/js/wc/TaskCard.js` - Modificado `_handleModalClosed()` para colapsar antes de cerrar modal

### 10. ~~Sistema de Apps - Acceso para todos los usuarios~~
- ✅ **Vista readonly**: Todos los usuarios autenticados pueden ver y descargar apps aprobadas
- ✅ **Versión recomendada**: La última versión se marca con badge "✨ Recomendada"
- ✅ **Selector de versiones**: Si hay múltiples versiones, se muestra selector para descargar otras
- ✅ **Solo SuperAdmin aprueba**: Apps subidas por AppAdmin quedan pendientes de aprobación
- ✅ **Apps descatalogadas**: Ya bloqueadas en `app-share.astro` (verificado)

Implementado en:
- `/public/js/wc/AppManager.js` - Vista readonly, método `_checkIfSuperAdmin()`, agrupación por versiones
- `/public/js/controllers/app-controller.js` - Tab visible para todos si `allowExecutables`
- `/public/js/wc/app-manager-styles.js` - Estilos para modo readonly y selector de versiones

### 11. ~~Deprecar /data/superAdminEmails - Solo 1 SuperAdmin de .env~~
- ✅ SuperAdmin ahora es SOLO el email definido en `.env` (variable `superAdminEmail`)
- ✅ `/data/superAdminEmails` ya no se consulta (DEPRECADO)
- ✅ AppAdmins se definen en `/data/appAdmins` (pueden compartir y editar, pero NO aprobar/borrar)
- ✅ Solo SuperAdmin puede: aprobar, descatalogar, restaurar, eliminar apps

Implementado en:
- `/public/js/utils/super-admin-check.js` - Simplificado para solo verificar .env
- `/public/js/services/firebase-service.js` - Eliminada consulta a base de datos
- `/public/js/wc/GlobalProposalsList.js` - Eliminada consulta a base de datos
- `/src/layouts/Layout.astro` - Eliminada tercera verificación de superAdminEmails

**NOTA**: La entrada `/data/superAdminEmails` puede eliminarse manualmente de la base de datos.

### 12. ~~Permisos App por proyecto y control de Canary~~
- ✅ AppAdmins ahora tienen MISMOS permisos que SuperAdmin en sección App (aprobar, eliminar, descatalogar, restaurar)
- ✅ Nueva estructura por proyecto para storageAdmins: `/data/storageAdmins/{projectId}/{encodedEmail}`
- ✅ Nueva estructura para canaryUsers: `/data/canaryUsers/{projectId}/{encodedEmail}`
- ✅ Versiones Canary solo visibles para usuarios con acceso (admins o usuarios en canaryUsers)
- ✅ appAdmins es global (todos los proyectos), storageAdmins es por proyecto

Implementado en:
- `/public/js/wc/AppManager.js` - Nueva propiedad `canSeeCanary`, método `_checkCanaryAccess()`
- `/database.rules.json` - Nuevas reglas para canaryUsers y storageAdmins por proyecto
- `/storage.rules` - Nueva función `canManageAppsForProject(projectId)`
- `/storage.emulator.rules` - Mismos cambios que storage.rules

**Estructura de permisos:**
- `/data/appAdmins/{encodedEmail}` → Admin global de Apps (todos los proyectos)
- `/data/storageAdmins/{projectId}/{encodedEmail}` → Admin de Storage para proyecto específico
- `/data/canaryUsers/{projectId}/{encodedEmail}` → Usuario que puede ver versiones Canary del proyecto

### 13. ~~Mover tareas entre proyectos~~
- ✅ Solo admins (isResponsable) pueden mover cards
- ✅ Soporta Tasks, Bugs y Proposals (no Sprints ni Epics)
- ✅ Genera nuevo cardId con prefijo del proyecto destino
- ✅ Mueve card original a `/trash/` con referencia al nuevo destino
- ✅ Limpia sprint asignado al mover (con advertencia previa)
- ✅ Botón 📦 visible solo para admins en vista compacta y expandida

Implementado en:
- `/public/js/wc/base-card.js` - Getter `canMoveToProject`, métodos `_handleMoveToProject()`, `_showMoveToProjectModal()`, `_executeMoveToProject()`, `_handleMoveResult()`
- `/public/js/services/firebase-service.js` - Método `moveCardToProject()`
- `/public/js/controllers/app-controller.js` - Listener y handler `handleMoveCardToProject()`
- `/public/js/wc/TaskCard.js` - Botón 📦 en vistas compacta y expandida
- `/public/js/wc/BugCard.js` - Botón 📦 en vistas compacta y expandida
- `/public/js/wc/ProposalCard.js` - Botón 📦 en vista compacta

Estructura de datos al mover:
- `movedFrom`: { projectId, cardId, movedAt, movedBy } - en la nueva card
- `movedTo`: { projectId, cardId, newFirebaseId } - en la card en trash

### 14. ~~Spike y devPoints~~
- ✅ Select de devPoints se deshabilita cuando Spike está marcado
- ✅ devPoints no es obligatorio en validaciones para tareas Spike
- ✅ Muestra etiqueta "(N/A - Spike)" cuando Spike está activo

Implementado en:
- `/public/js/wc/TaskCard.js` - Modificado select devPoints y funciones `_getRequiredFieldsByStatus()`, `_handleStatusChange()`

### 15. ~~Filtrar sprints por año seleccionado~~
- ✅ Selector de sprint en TaskCard filtra por año seleccionado en YearSelector
- ✅ Filtros de tareas filtran sprints por año (task-filters.js, types/task-filters.js)
- ✅ Compatibilidad: sprints sin campo `year` se muestran siempre (pre-migración)
- ✅ BaseFilters.getSprintOptions() ya tenía filtrado por año

Implementado en:
- `/public/js/wc/TaskCard.js` - Métodos `_filterSprintsByYear()`, `_getSelectedYearFromSelector()`
- `/public/js/filters/task-filters.js` - Método `getSprintOptions()` con filtrado
- `/public/js/filters/types/task-filters.js` - Método `getSprintOptions()` con filtrado

### 16. ~~Endpoint getProjectEpics~~
- ✅ Cloud Function HTTP en `europe-west1`
- ✅ Autenticación con API key (`CREATE_CARD_API_KEY`, header `x-api-key`)
- ✅ GET/POST `getProjectEpics?projectId=Cinema4D`
- ✅ Filtros opcionales: `year`, `includeAll`
- ✅ Devuelve: cardId, title, description, epicType, year, status

Implementado en:
- `/functions/index.js` - Función `exports.getProjectEpics`

Ejemplo de uso:
```bash
curl -H "x-api-key: YOUR_KEY" \
  "https://europe-west1-<your-project-id>.cloudfunctions.net/getProjectEpics?projectId=Cinema4D&year=2025"
```

### 17. ~~Mejoras en validación de formularios~~
**Decisión:** No migrar a la librería externa. El sistema actual tiene validación dinámica por status que requeriría mantener lógica duplicada. En su lugar, se mejoraron las características del sistema actual:

- ✅ **Asteriscos automáticos** en labels de campos requeridos (dinámico según status)
- ✅ **Scroll automático** al primer campo inválido al guardar
- ✅ **Focus automático** en el campo inválido después del scroll
- ✅ **Animación shake** en campos inválidos para mayor visibilidad
- ✅ **Tabs marcados** con asterisco cuando su contenido es requerido

Implementado en:
- `/public/js/wc/TaskCard.js` - Métodos `_isFieldRequired()`, `_getLabelClass()`, `_scrollToFirstInvalidField()`
- `/public/js/ui/styles/themes/task-theme.js` - Estilos `.required::after`, `.invalid-field`, `@keyframes shake`

### 21. ~~SuperAdmin siempre ve todos los proyectos~~
- ✅ `firebase-service.js`: `loadProjects()` bypassa filtro para superAdmin
- ✅ `app-controller.js`: `setUserViewMode()` da management mode a superAdmin
- ✅ `dashboard.astro`, `index.astro`, `development.astro`: checks de superAdmin en loadProjects locales
- ✅ Unit tests para loadProjects con superAdmin

### 22. ~~Tests E2E - Corregidos y funcionando (18/18)~~
- ✅ Infraestructura: fixtures con sesión compartida, helpers, reporter personalizado
- ✅ Page objects: fillCardFields evita trigger IA, saveCard maneja "Cambios sin guardar"
- ✅ 01-auth (4 tests), 02-projects (3 tests), 03-full-workflow (4 tests), 04-card-interactions (7 tests)

## Pendientes

### Tests E2E pendientes de crear

- [ ] Comprobar histórico de tasks (history tab)
- [ ] Enlazar tasks entre sí
- [ ] Abrir tasks desde enlace directo (URL)
- [ ] Convertir propuesta en task
- [ ] Ordenar con drag&drop proyectos
- [ ] Testear vistas: table, card, kanban, sprint
- [ ] Cambiar de sprint en tasks
- [ ] Cambiar de estado en tasks y bugs
- [ ] Test E2E de cada tipo de login/usuario y sus permisos
- [ ] Tests E2E para verificar filtros en producción

---

- [ ] **Navegación coherente tipo SPA** - Sistema de URLs con estado

  **Problema**: Al cambiar de vistas (ej: WIP → Backlog) o seleccionar filtros (ej: developer), si recargas la página pierdes esa vista y selección. Ocurre en múltiples páginas y secciones.

  **Solución propuesta**: Diseñar sistema de navegación SPA con parámetros en URL:
  - Guardar estado de vista actual en URL (ej: `?view=backlog&developer=dev_001`)
  - Al recargar, restaurar vista y filtros desde parámetros URL
  - Usar `history.pushState()` / `history.replaceState()` para cambios sin recarga
  - Permitir compartir URLs con estado específico

  **Páginas afectadas**:
  - `/wip` - Tabs WIP/Backlog, selección de developer
  - `/` (index) - Vista lista/kanban, filtros activos
  - `/sprintview` - Sprint seleccionado, vista
  - `/proposals` - Proyecto expandido, filtros

  **Implementación**:
  - [ ] Crear `NavigationStateService` para gestionar estado URL
  - [ ] Integrar en cada página afectada
  - [ ] Escuchar evento `popstate` para navegación con botones atrás/adelante

- [ ] En las cards que tienen los acceptance criteria, cuando se le da al boton de "regenerar con IA", en caso de no tener ningun criterio en la lista, no debe preguntar si quiero seguir porque se van a borrar, ya que no hay.
- [ ] Los Bugs asignados en proceso (no finalizados) tambien deben aparecer en el backlog de cada developer.
- [ ] **Verificar que el historial WIP se guarda en /wipHistory** - Comprobar que al cambiar una tarea de "In Progress" a otro estado, los datos de WIP se guardan correctamente en `/wipHistory/{devKey}/{timestamp}` y NO en el campo `wipHistory` de la tarea.
- [ ] **Solventar vista de la fila de tareas especiales** - Revisar y corregir la visualización de las filas de tareas con flags Spike, Expedited, Business Blocked y Dev Blocked.
- [ ] **Actualizar fechas automáticamente en Bugs** - Cuando se asigne un bug a un developer, actualizar la fecha de inicio automáticamente. Cuando el estado cambie a Fixed, Closed, Rejected o Verified, actualizar la fecha de fin automáticamente.

- [ ] **Propuesta @manufosela/app-modal: modo fullHeight** - El componente necesita una propiedad `fullHeight` para que el contenido se expanda al tamaño del modal. Actualmente se está forzando desde fuera manipulando el shadowRoot. Ver propuesta detallada en `/docs/design-system/UPDATE-APP-MODAL-FULLHEIGHT.md`.


- [ ] **Sistema de métricas y estadísticas de trabajo (Work Analytics)** - Nueva sección en `/wip` además de "WIP actual" y "Backlog por developer":

  **Funcionalidad principal:**
  - Nueva pestaña "Resumen de trabajo" con estadísticas por semanas, meses y año completo
  - Vista por developer: tiempo total trabajado, tareas completadas, promedio por tarea
  - Vista por tarea: ciclo de vida completo desde creación hasta cierre

  **Datos a trackear por cada sesión de trabajo:**
  - `developerId`: quién tiene la tarea
  - `taskId`, `projectId`, `cardType`
  - `startedAt`: cuando pasó a "In Progress"
  - `endedAt`: cuando salió de "In Progress" (a To Do, Done, To Validate, etc.)
  - `endReason`: motivo de fin (done, returned, validated, reassigned)
  - `duration`: tiempo en minutos/horas

  **Datos a trackear por tarea (ciclo completo):**
  - `createdAt`: fecha de creación
  - `createdBy`: quién la creó
  - `statusHistory`: array de cambios de estado con timestamps
  - `developerHistory`: array de asignaciones con timestamps
  - `coDevelopers`: developers que han trabajado en la tarea
  - `totalWorkTime`: suma de todas las sesiones de trabajo
  - `leadTime`: tiempo desde creación hasta Done
  - `cycleTime`: tiempo desde primera asignación hasta Done

  **Estructura de datos propuesta en Firebase:**
  ```
  /workSessions/{year}/{devId}/{sessionId}: {
    taskId, projectId, startedAt, endedAt, endReason, duration
  }
  /taskLifecycle/{projectId}/{taskId}: {
    createdAt, createdBy, statusHistory[], developerHistory[],
    coDevelopers[], totalWorkTime, leadTime, cycleTime
  }
  ```

  **Visualización:**
  - Gráfico de barras: horas trabajadas por semana/mes
  - Tabla resumen: tareas completadas, tiempo promedio, puntos entregados
  - Drill-down por developer o por tarea para ver detalle

- [ ] **Validación obligatoria de campos al bloquear tarea** - Cuando se marca una tarea como bloqueada (Business Blocked o Dev Blocked):
  - Obligatorio rellenar el campo "Quién bloquea" (bbbWho/bbdWho)
  - Obligatorio rellenar el campo "Razón del bloqueo" (bbbWhy/bbdWhy)
  - No permitir guardar si los campos no están completos
  - Enviar notificación al usuario/stakeholder indicado de que tiene una tarea bloqueada esperándole

- [ ] **Notificación al stakeholder cuando tarea pasa a "To Validate"** - Al guardar una tarea con estado "To Validate", enviar notificación automática al stakeholder asignado para que valide la tarea.

- [ ] **Iconos de acceso rápido junto a campanita de notificaciones** - Añadir iconos al lado de la campanita:
  - Si eres **developer**: icono con contador de tareas en tu backlog
  - Si eres **stakeholder**: icono con contador de tareas asignadas + tareas "To Validate" pendientes
  - Click en el icono lleva a la vista correspondiente (WIP/backlog o lista filtrada)

- [ ] **Revisar y mejorar envío mensual de emails** - El sistema debe enviar 1 solo email mensual por usuario (NO 1 por proyecto) que incluya:
  - Resumen aglutinado de TODOS los proyectos del usuario
  - Número de tareas asignadas (como developer)
  - Número de tareas asignadas (como stakeholder)
  - Resumen de lo realizado en el mes
  - Resumen de lo pendiente
  - Tareas bloqueadas esperando al usuario


### 18. ~~Mejoras en Sprints - Registros de la Demo~~
- ✅ Cambiar la pestaña de "Video Demo" por "Registros de la Demo"
- ✅ Poner enlaces de video de SharePoint en lugar de subir archivo de video directamente
- ✅ Añadir campo para resumen de la demo (2 partes: enlace de video arriba, resumen abajo)
- ✅ Botón 📹 en vista compacta abre URL si existe, o muestra video legacy si no
- ✅ Videos subidos anteriormente se mantienen accesibles en sección "legacy" colapsable

Implementado en:
- `/public/js/wc/SprintCard.js` - Nuevas propiedades `demoVideoUrl` y `demoSummary`, nuevo handler `_handleOpenDemoRecords()`

Campos nuevos en Firebase:
- `demoVideoUrl`: URL del video en SharePoint
- `demoSummary`: Resumen/notas de la sesión de demo

### 19. Propuestas por Departamento (Stakeholder Team)

**Objetivo:** Organizar las propuestas por departamento/equipo basándose en el stakeholder que las crea.

**Estructura de datos en Firebase:**
- `/data/teams/{teamId}` = `{ name: "Nombre del equipo" }` - IDs manuales
- `/data/stakeholders/{stkId}` = `{ email, name, active, teamId }` - Referencia al team

**Tareas pendientes:**
- [ ] **Añadir campo "Stakeholder" a ProposalCard** - Selector para asociar la propuesta a un stakeholder específico (no solo el creador)
- [ ] **Añadir columna "Stakeholder" en vista tabla de propuestas** - Mostrar el stakeholder asociado en la tabla
- [ ] **Crear vista "Department View" en propuestas** - Nueva vista tipo kanban:
  - Columnas = departamentos/teams
  - Cards ultra-compactas (solo título, ID, creador)
  - Drag & drop entre departamentos (opcional)

**Ya implementado (infraestructura):**
- ✅ `entity-directory-service.js` - Soporte para teams y método `getStakeholderTeamName()`
- ✅ `GlobalProposalsList.js` - Tab "Por Departamento" con agrupación por team del creador

### 20. ~~Sistema Unificado de Filtros~~
- ✅ Nuevo sistema de filtros que opera sobre DATOS (no DOM) - elimina el problema del FLASH
- ✅ Single Source of Truth para filtrado
- ✅ Persistencia de filtros en localStorage
- ✅ Soporte para year-dependent filters (sprint se limpia al cambiar año)
- ✅ Matchers especializados para cada tipo de filtro
- ✅ Integración con TableViewManager y KanbanViewManager

**Arquitectura implementada:**
```
/public/js/filters/
├── core/
│   ├── filter-engine.js         # Motor de filtrado puro (97 tests)
│   └── filter-state.js          # Estado y persistencia
├── matchers/
│   ├── status-matcher.js        # Filtro por estado
│   ├── developer-matcher.js     # Filtro por developer/validator
│   ├── sprint-matcher.js        # Filtro por sprint (soporta "no-sprint")
│   ├── epic-matcher.js          # Filtro por épica (soporta "no-epic")
│   ├── priority-matcher.js      # Filtro por prioridad calculada
│   ├── created-by-matcher.js    # Filtro por creador
│   └── repository-matcher.js    # Filtro por repositorio
├── configs/
│   ├── task-filter-config.js    # Configuración declarativa para tasks
│   └── bug-filter-config.js     # Configuración declarativa para bugs
└── index.js                     # Exportaciones

/public/js/services/
└── unified-filter-service.js    # Fachada principal del servicio

/public/js/wc/
├── UnifiedFilters.js            # Componente UI (opcional)
└── unified-filters-styles.js    # Estilos del componente
```

**Cambios en managers:**
- `table-view-manager.js`:
  - Eliminado `_reapplyFilterComponentFilters()` y su `setTimeout(50ms)` (causa del FLASH)
  - `renderCurrentView()` ahora usa `unifiedFilterService.applyFilters()`
  - Escucha evento `unified-filters-changed` para re-renderizar
- `kanban-view-manager.js`:
  - Integrado `unifiedFilterService` para filtrar cards en kanban
  - Cache de cards para re-renderizar en cambios de filtro

**Uso del nuevo servicio:**
```javascript
import { getUnifiedFilterService } from './services/unified-filter-service.js';

const service = getUnifiedFilterService();

// Aplicar filtros a datos
const filteredCards = service.applyFilters(cards, projectId, cardType);

// Establecer filtros
service.setFilter(projectId, cardType, 'status', ['To Do', 'In Progress']);

// Limpiar filtros
service.clearAllFilters(projectId, cardType);

// Suscribirse a cambios
service.subscribe(projectId, cardType, (filters) => { ... });
```

**Compatibilidad hacia atrás:**
- Los componentes `task-filters` y `bug-filters` siguen funcionando
- El nuevo sistema NO rompe funcionalidad existente
- Migración gradual: nuevas funcionalidades usan el servicio unificado

**Pendiente (migración completa):**
- [ ] Migrar `view-factory.js` para usar `unified-filters` en lugar de `task-filters`/`bug-filters`
- [ ] Integrar en Card View (actualmente solo Table y Kanban)
- [ ] Eliminar código legacy en `/public/js/filters/types/` (no usado)
