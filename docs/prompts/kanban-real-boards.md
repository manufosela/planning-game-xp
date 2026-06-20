# Prompt para Claude Code — Tableros Kanban reales en el Planning Game

> Pégale esto a Claude Code **dentro del repo del Planning Game (PG)**.
> Stack del PG: **Astro (output estático) + Firebase (Auth + RTDB) + Lit (light DOM) + vanilla JS ES2025**.

---

## Objetivo

Añadir al Planning Game **tableros Kanban reales para gestión de trabajo** (no un juego). Ya existe un tablero básico con pocas columnas fijas y sin WIP. Hay que convertirlo en un tablero profesional:

1. **Columnas configurables por proyecto** (añadir, renombrar, reordenar, borrar).
2. **Límites WIP por columna** (opcionales) con aviso visual al superarlos.
3. **Detalle de historia** al abrir una card (título, descripción, criterios de aceptación, puntos de valor/esfuerzo, prioridad, responsable, epic, sprint, enlaces, comentarios…).
4. **Mover cards con drag & drop** entre columnas, en **tiempo real multiusuario** (varias personas moviendo a la vez).
5. **Métricas de flujo sobre datos reales**: tiempo de ciclo (Ley de Little), WIP medio/pico, CFD (diagrama de flujo acumulado), throughput y cuello de botella.

**Principio rector — una única fuente de verdad:** las historias, sprints, devs y validadores **ya viven en el PG**. NO dupliques datos en otra base ni en otra app. El tablero es una **vista + estado de columna por card + configuración de columnas por proyecto** sobre los datos que ya existen.

---

## Estado actual (a confirmar leyendo el código del PG)

- Las historias/cards reales ya existen en el modelo del PG (tareas/bugs con estado, puntos, epic, sprint, etc.).
- Ya hay un componente de tablero, pero: columnas fijas, no configurables, sin WIP, sin detalle de card, sin drag & drop, sin métricas de flujo.
- El PG ya tiene un **workflow de estados** y **reglas de transición** (p. ej. To Do → In Progress → To Validate…). **Respétalas**: las columnas del tablero deben **mapearse a esos estados** y mover una card de columna debe cambiar su estado **solo si la transición es válida** (si no, revertir y avisar con un toast/modal del PG).

> Antes de codificar: localiza el modelo de cards, el de estados/transiciones y el componente de tablero actual. Reutiliza lo que haya; no reinventes el modelo de datos.

---

## Requisitos detallados

### 1. Columnas configurables (por proyecto)
- Guardar la config de columnas a nivel de **proyecto** (no global): `projects/{projectId}/board/columns` (o donde encaje en el esquema actual).
- Cada columna: `{ id, name, order, wipLimit (null = sin límite), statusKey }`.
- `statusKey` mapea la columna a un **estado real** del card del PG. Dos columnas no deberían mapear al mismo estado salvo que se decida explícitamente.
- UI de configuración: añadir/renombrar/reordenar (drag de columnas)/borrar. Borrar una columna con cards debe pedir a dónde mover esas cards (no perderlas).
- Por defecto, generar columnas a partir de los estados existentes del PG para que funcione desde el minuto cero.

### 2. Límites WIP
- `wipLimit` por columna. Render: contador `n / límite`; **amarillo** al llegar al límite, **rojo** al superarlo.
- El WIP **no bloquea** por defecto (en trabajo real conviene avisar, no impedir), pero deja un flag de proyecto `enforceWip` que, si está activo, **impida** soltar una card en una columna llena (excepto items marcados como urgentes/expedite).

### 3. Detalle de historia
- Al hacer click en una card: panel/modal con todos los campos reales del card del PG (título, descripción estructurada Como/Quiero/Para, criterios de aceptación Given/When/Then, valor/esfuerzo, prioridad calculada = **Valor/Esfuerzo**, responsable, epic, sprint, commits/PR si los hay, comentarios).
- Editable en línea lo razonable (responsable, puntos, descripción) respetando permisos.
- Usa el **sistema de modales propio del PG** (nada de `alert/confirm/prompt` nativos).

### 4. Drag & drop + tiempo real
- Mover cards entre columnas con drag & drop (puntero + teclado accesible).
- Al soltar: validar la transición de estado; si es válida, persistir el nuevo estado/columna; si no, **revertir visualmente** y avisar.
- **Tiempo real con RTDB**: `onValue` sobre el proyecto; aplicar cambios entrantes sin pisar el arrastre en curso. Escrituras con `runTransaction`/`update` atómicas. Optimista en local, reconciliando con el snapshot remoto.
- Orden dentro de la columna: persistir un `rank`/`order` por card (p. ej. fractional indexing o un entero con re-spreads) para que el orden sea estable entre usuarios.

### 5. Métricas de flujo (lo más valioso — PORTAR desde el Kanban Game)
Hay un **motor de métricas puro** (JS, sin Firebase ni framework) ya probado en el Kanban Game. Pórtalo tal cual a un módulo del PG (`src/lib/flow-metrics.js`) y aliméntalo con **snapshots** del tablero.

- **Snapshot**: cada vez que cambia el tablero (o en un tick periódico), guarda el conteo de cards por columna + timestamp en `projects/{projectId}/board/snapshots/{ts}`. Estructura: `{ at, perColumn: { [colId]: n }, done }`.
- Con esos snapshots, calcula:
  - **CFD** (área apilada por columna a lo largo del tiempo).
  - **Throughput** (entregas por unidad de tiempo).
  - **WIP medio y pico** (excluyendo backlog y done).
  - **Tiempo de ciclo** por Ley de Little: `WIP_medio / throughput`.
  - **Cuello de botella** (columna con mayor acumulación media, excluyendo backlog/buffers/done).
- Además, **tiempo de ciclo real por card** (mejor que la aproximación de Little): registra `enteredInProgressAt` y `doneAt` por card y promedia. Muestra ambas si quieres (real y Little).

#### Código a portar (adáptalo a tus ids de columnas reales)
```js
// flow-metrics.js — puro, sin dependencias. anchors/exclusiones según tu config.
function arr(snapshots) { return Array.isArray(snapshots) ? snapshots.filter(Boolean) : Object.values(snapshots || {}); }

// columnas a excluir del WIP/cuello: backlog (entrada), buffers tipo "Ready", y done (salida)
export function avgActiveWip(snapshots, excludeColIds = new Set()) {
  const a = arr(snapshots); if (!a.length) return null;
  let total = 0;
  for (const s of a) for (const [c, n] of Object.entries(s.perColumn || {})) if (!excludeColIds.has(c)) total += n;
  return total / a.length;
}
export function peakActiveWip(snapshots, excludeColIds = new Set()) {
  const a = arr(snapshots); if (!a.length) return null;
  let peak = 0;
  for (const s of a) { let sum = 0; for (const [c, n] of Object.entries(s.perColumn || {})) if (!excludeColIds.has(c)) sum += n; if (sum > peak) peak = sum; }
  return peak;
}
export function throughputPerPeriod(snapshots) {
  const a = arr(snapshots); if (!a.length) return null;
  const done = Math.max(0, ...a.map((s) => s.done || 0));
  return done / a.length; // si los snapshots son equiespaciados; si no, normaliza por tiempo real
}
export function avgCycleTimeLittle(snapshots, excludeColIds = new Set()) {
  const L = avgActiveWip(snapshots, excludeColIds);
  const lambda = throughputPerPeriod(snapshots);
  if (L == null || !lambda) return null;
  return L / lambda;
}
export function bottleneck(snapshots, excludeColIds = new Set()) {
  const a = arr(snapshots); if (!a.length) return null;
  const totals = {};
  for (const s of a) for (const [c, n] of Object.entries(s.perColumn || {})) { if (excludeColIds.has(c)) continue; totals[c] = (totals[c] || 0) + n; }
  let best = null;
  for (const [c, t] of Object.entries(totals)) { const avg = t / a.length; if (!best || avg > best.avg) best = { colId: c, avg }; }
  return best;
}
// prioridad = Valor / Esfuerzo * 100 (mayor = antes). Igual que en el PG/TRIBBU.
export function priorityOf(card) {
  if (!card || !card.business || !card.dev) return 0;
  return Math.round((card.business / card.dev) * 100);
}
// tiempo de ciclo REAL por card (en ms o en la unidad que guardes)
export function avgRealCycleTime(cards) {
  const done = (cards || []).filter((c) => c.enteredInProgressAt && c.doneAt);
  if (!done.length) return null;
  return done.reduce((s, c) => s + (c.doneAt - c.enteredInProgressAt), 0) / done.length;
}
```
Para las gráficas (CFD/throughput) usa **SVG con la etiqueta `svg\`\`` de Lit** (no `html\`\``, o no pinta por el namespace) y `display:block` en los custom elements.

### 6. Filtros y vista
- Filtrar por **sprint**, **responsable**, **tipo** (task/bug/epic), **epic**.
- Opcional: swimlanes por epic o por responsable.
- Buscador por texto.

---

## Arquitectura propuesta

- **Datos (RTDB)**:
  - `projects/{projectId}/board/columns/{colId}` → `{ name, order, wipLimit, statusKey }`
  - Las cards reales mantienen su estado del PG; añade por card `boardColId` (o deriva la columna del estado vía `statusKey`) y `rank` para el orden, más `enteredInProgressAt`/`doneAt` para el tiempo de ciclo real.
  - `projects/{projectId}/board/snapshots/{ts}` → `{ at, perColumn, done }`
- **Componentes Lit (light DOM, `createRenderRoot(){return this;}`)**:
  - `<pg-board>`: orquesta columnas + suscripción RTDB + drag & drop.
  - `<pg-column>`: cabecera con WIP, lista de cards, dropzone.
  - `<pg-card>`: tarjeta compacta (título, prioridad, responsable, puntos) + click → detalle.
  - `<pg-card-detail>`: panel/modal de detalle editable.
  - `<pg-board-config>`: gestión de columnas/WIP/mapeo a estados.
  - `<pg-flow-metrics>`: CFD + throughput + tiempo de ciclo + WIP + cuello (usa `flow-metrics.js`).
- **Snapshots**: hook en cada escritura que cambie conteos por columna; además un snapshot al cargar. (Evita escribir snapshots redundantes: solo si cambió algún conteo.)

---

## Restricciones (estándares del proyecto)

- **ES2025**, sin APIs deprecadas (`structuredClone`, `Array.prototype.at/toSorted`, `??`, `?.`, etc.). Nada de `alert/confirm/prompt` nativos → modales del PG.
- **Lit en light DOM** (coherente con el resto del PG).
- **Sin duplicar datos**: la card vive en el PG; el tablero solo añade config de columnas, `boardColId/rank` y timestamps de flujo.
- **Respetar las reglas de transición de estado** existentes del PG al mover cards.
- **Reglas de seguridad RTDB**: que un usuario solo pueda mover/editar cards de proyectos a los que pertenece; validar en reglas, no solo en cliente.
- **Sin fallbacks silenciosos**: si una transición no es válida, revertir y avisar.
- **Tests** (Vitest) para `flow-metrics.js` (puro, fácil de cubrir) y para la lógica de mapeo columna↔estado y validación de movimientos.
- **Mobile-first / accesible**: drag accesible por teclado, foco visible, contraste.

---

## Plan por fases (PRs atómicas, una por fase)

1. **Columnas configurables + mapeo a estados** (sin WIP aún). El tablero pasa a leer columnas de la config del proyecto, generadas por defecto desde los estados existentes.
2. **WIP por columna** + avisos visuales + flag `enforceWip`.
3. **Drag & drop + tiempo real** (RTDB onValue + escrituras atómicas + `rank` + validación de transición).
4. **Detalle de historia** (modal del PG, edición en línea de campos clave).
5. **Métricas de flujo** (`flow-metrics.js` portado + snapshots + componente CFD/throughput/ciclo/WIP/cuello).
6. **Filtros / swimlanes / buscador**.

Cada fase: compila, pasa tests y se puede mergear sola.

---

## Criterios de aceptación (resumen)

- Puedo configurar columnas y límites WIP por proyecto, y persisten.
- Muevo cards con drag & drop; otra persona ve el cambio en tiempo real; un movimiento inválido se revierte con aviso.
- Al abrir una card veo y edito su detalle real (sin duplicar datos).
- Veo CFD, throughput, tiempo de ciclo (Little y real), WIP medio/pico y cuello de botella sobre datos reales.
- Todo respeta las reglas de transición y de seguridad del PG.
