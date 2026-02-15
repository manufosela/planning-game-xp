#!/usr/bin/env node
/**
 * Seed script for ADRs (Architecture Decision Records)
 * Creates example ADRs for PlanningGame project
 *
 * Usage:
 *   node scripts/seed-adrs.js [projectId]
 */

import admin from 'firebase-admin';
import { readFileSync } from 'fs';

// Initialize Firebase Admin
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const databaseURL =
  process.env.PUBLIC_FIREBASE_DATABASE_URL ||
  process.env.FIREBASE_DATABASE_URL ||
  process.env.DATABASE_URL;

if (!serviceAccountPath) {
  console.error('Missing GOOGLE_APPLICATION_CREDENTIALS environment variable');
  process.exit(1);
}

if (!databaseURL) {
  console.error('Missing PUBLIC_FIREBASE_DATABASE_URL/FIREBASE_DATABASE_URL environment variable');
  process.exit(1);
}

try {
  const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL
  });
} catch (e) {
  console.error('Failed to initialize Firebase:', e.message);
  process.exit(1);
}

const db = admin.database();
const now = new Date().toISOString();
const createdBy = 'seed-script';

const projectId = process.argv[2] || 'PlanningGame';

// ============================================================================
// ADRs for PlanningGame
// ============================================================================
const adrs = {
  'adr_001': {
    id: 'adr_001',
    title: 'Estrategia de Base de Datos Firebase: RTDB vs Firestore',
    status: 'accepted',
    context: `La aplicación necesita una base de datos en tiempo real que pueda:
- Sincronizar datos instantáneamente entre múltiples clientes
- Funcionar offline y sincronizar al reconectar
- Escalar con mínima configuración
- Integrarse bien con Firebase Auth

Opciones consideradas:
1. Firebase Realtime Database (RTDB)
2. Firebase Firestore
3. PostgreSQL con suscripciones en tiempo real
4. MongoDB con Change Streams

Tanto RTDB como Firestore soportan sincronización en tiempo real, pero tienen diferentes fortalezas:
- RTDB: Árbol JSON simple, menor latencia, pricing más simple
- Firestore: Queries más ricos, mejor escalado, colecciones estructuradas`,
    decision: `Usamos AMBAS bases de datos de Firebase, eligiendo según el tipo de dato y necesidades del proyecto:

**Usar Realtime Database (RTDB) cuando:**
- Los datos tienen estructura de árbol JSON simple
- Se necesita muy baja latencia (chat, presencia, estado WIP)
- Los patrones de acceso son simples (leer/escribir por clave)
- Se necesita minimizar costes para actualizaciones pequeñas frecuentes

**Usar Firestore cuando:**
- Se necesitan queries complejos (filtros, ordenación, paginación)
- Los datos tienen estructura relacional (colecciones/documentos)
- Se necesita escalado automático para datasets grandes
- Se necesitan índices compuestos para queries avanzados

**Por defecto para nuevos proyectos:**
- Cards, notificaciones, WIP: RTDB (simple, tiempo real crítico)
- Analytics, logs, reportes: Firestore (queries complejos)
- Datos de usuario, permisos: Evaluar caso por caso`,
    consequences: `Positivo:
- Mejor herramienta para cada trabajo
- Costes optimizados por caso de uso
- Ambas soportan sync en tiempo real
- Flexibilidad para necesidades futuras

Negativo:
- Dos sistemas a mantener
- Los desarrolladores necesitan conocer ambos
- Sincronización entre sistemas si es necesario
- Sintaxis diferente de reglas de seguridad`,
    supersededBy: null,
    createdAt: '2024-01-15T10:00:00.000Z',
    createdBy: process.env.PUBLIC_SUPER_ADMIN_EMAIL || 'admin@example.com',
    updatedAt: now,
    updatedBy: createdBy
  },

  'adr_002': {
    id: 'adr_002',
    title: 'Usar Lit Web Components para la UI',
    status: 'accepted',
    context: `Se necesita un framework de componentes que:
- Soporte data binding reactivo
- Funcione con web components estándar
- Tenga bundle size pequeño
- No requiera setup de build complejo

Opciones consideradas:
1. React
2. Vue
3. Svelte
4. Lit
5. Web Components vanilla`,
    decision: `Usaremos Lit porque:
- Web components nativos (sin lock-in de framework)
- Runtime muy pequeño (~5KB)
- Propiedades reactivas simples
- Funciona con cualquier framework o ninguno
- Soporte TypeScript
- Fácil integración con Astro`,
    consequences: `Positivo:
- Bundle size pequeño
- Web components estándar
- Fácil de aprender
- Buen soporte TypeScript

Negativo:
- Comunidad más pequeña que React/Vue
- Menos librerías de componentes UI
- Algunos desarrolladores menos familiarizados`,
    supersededBy: null,
    createdAt: '2024-01-20T10:00:00.000Z',
    createdBy: process.env.PUBLIC_SUPER_ADMIN_EMAIL || 'admin@example.com',
    updatedAt: now,
    updatedBy: createdBy
  },

  'adr_003': {
    id: 'adr_003',
    title: 'Usar Astro para Generación de Sitio Estático',
    status: 'accepted',
    context: `Se necesita un framework para:
- Server-side rendering de páginas
- Integración con componentes Lit
- Cargas de página rápidas
- Markup SEO-friendly

Opciones consideradas:
1. Next.js
2. Nuxt.js
3. Astro
4. SvelteKit
5. Vite plano`,
    decision: `Usaremos Astro porque:
- Arquitectura de islas (hidratación parcial)
- Soporte nativo para componentes Lit
- Cero JS por defecto
- Routing basado en archivos simple
- Excelente rendimiento de build`,
    consequences: `Positivo:
- Cargas de página rápidas (JS mínimo)
- Fácil integración con Lit
- Buena experiencia de desarrollo
- Opciones de rendering flexibles

Negativo:
- Framework más nuevo, menos maduro
- Algunas features aún evolucionando
- El equipo necesita aprender patrones de Astro`,
    supersededBy: null,
    createdAt: '2024-02-01T10:00:00.000Z',
    createdBy: process.env.PUBLIC_SUPER_ADMIN_EMAIL || 'admin@example.com',
    updatedAt: now,
    updatedBy: createdBy
  },

  'adr_004': {
    id: 'adr_004',
    title: 'Arquitectura Orientada a Servicios para Frontend',
    status: 'accepted',
    context: `El código del frontend se estaba volviendo difícil de mantener:
- Acoplamiento fuerte entre componentes
- Lógica duplicada entre componentes
- Difícil testear lógica de negocio
- Sin separación clara de responsabilidades

Se necesita refactorizar para mejorar:
- Testeabilidad
- Reusabilidad
- Mantenibilidad`,
    decision: `Adoptaremos una Arquitectura Orientada a Servicios:
- Servicios centralizados en /public/js/services/
- Los servicios son singletons con responsabilidades claras
- Los componentes se comunican via eventos
- Patrón Factory para crear componentes/vistas

Servicios clave:
- FirebaseService: Todas las operaciones de Firebase
- CardService: CRUD para cards
- PermissionService: Control de acceso basado en roles
- ModalService: Gestión de modales
- FilterService: Lógica de filtrado`,
    consequences: `Positivo:
- Clara separación de responsabilidades
- Testing más fácil de lógica de negocio
- Reducción de código duplicado
- Mejor mantenibilidad

Negativo:
- Más archivos que navegar
- Necesidad de entender interacciones entre servicios
- Esfuerzo inicial de refactoring`,
    supersededBy: null,
    createdAt: '2024-06-15T10:00:00.000Z',
    createdBy: process.env.PUBLIC_SUPER_ADMIN_EMAIL || 'admin@example.com',
    updatedAt: now,
    updatedBy: createdBy
  },

  'adr_005': {
    id: 'adr_005',
    title: 'Política de No Fallbacks',
    status: 'accepted',
    context: `Observamos bugs causados por fallos silenciosos:
- Componentes mostrando datos incorrectos por valores fallback
- Campos requeridos faltantes pasando desapercibidos
- Debugging difícil cuando los errores están ocultos

Ejemplo de patrón problemático:
\`\`\`javascript
// MAL: Hace fallback a valor incorrecto silenciosamente
const id = this.firebaseId || this.id || this.cardId;
\`\`\``,
    decision: `Adoptamos una política de "No Fallbacks":
- El sistema funciona o falla, nunca silenciosamente
- Lanzar errores para datos requeridos faltantes
- Nunca usar cadenas || para datos críticos
- Si los datos necesitan arreglarse, usar scripts de migración

Patrón correcto:
\`\`\`javascript
// BIEN: Falla explícitamente
if (!this.firebaseId) {
  throw new Error('firebaseId is required');
}
\`\`\``,
    consequences: `Positivo:
- Los bugs aparecen inmediatamente
- Debugging más fácil
- Integridad de datos mantenida
- Mensajes de error claros

Negativo:
- Más código de manejo de errores
- La app puede crashear con datos malos
- Necesidad de scripts de migración para arreglar datos`,
    supersededBy: null,
    createdAt: '2024-09-01T10:00:00.000Z',
    createdBy: process.env.PUBLIC_SUPER_ADMIN_EMAIL || 'admin@example.com',
    updatedAt: now,
    updatedBy: createdBy
  },

  'adr_006': {
    id: 'adr_006',
    title: 'Usar Vistas de Base de Datos para Optimizar Tráfico y Costes',
    status: 'accepted',
    context: `Firebase cobra por datos descargados, no solo por lecturas:
- Descargar colecciones completas es caro
- Los clientes a menudo solo necesitan un subconjunto de campos
- Queries repetidos descargan los mismos datos múltiples veces
- Estructuras anidadas profundas multiplican el tamaño de descarga

Problemas observados:
- Cargar todas las cards descarga campos innecesarios (notas, historial, etc.)
- Queries del dashboard descargan datos completos de cards para simples conteos
- Vistas de lista descargan descripción/criterios de aceptación que no se muestran
- Clientes móviles descargan los mismos datos que desktop`,
    decision: `Todo proyecto DEBE crear vistas de base de datos (datos denormalizados) para queries comunes:

**Vistas Requeridas:**
1. \`/views/{projectId}/cardsSummary/\` - Lista ligera de cards
   - Solo: cardId, title, status, developer, priority, sprint, year
   - Excluye: description, notes, acceptanceCriteria, history

2. \`/views/{projectId}/sprintBoard/\` - Vista Kanban/Sprint
   - Agrupado por status
   - Solo campos necesarios para mostrar el tablero

3. \`/views/{projectId}/stats/\` - Estadísticas agregadas
   - Conteos por status, developer, sprint
   - Actualizado via Cloud Functions en cambios de cards

**Reglas de Implementación:**
- Las vistas las actualizan Cloud Functions (no el cliente)
- Las vistas son solo lectura para clientes
- La fuente de verdad permanece en /cards/
- Las vistas son eventualmente consistentes (retraso aceptable)

**Convención de Nombres:**
\`/views/{projectId}/{viewName}/\``,
    consequences: `Positivo:
- 60-80% reducción en transferencia de datos
- Cargas de página iniciales más rápidas
- Menores costes de Firebase
- Mejor rendimiento móvil
- Código del lado cliente más simple

Negativo:
- Duplicación de datos (coste de almacenamiento, mínimo)
- Complejidad de Cloud Functions
- Consistencia eventual (no instantánea)
- Necesidad de mantener lógica de sincronización
- Más invocaciones de Cloud Functions`,
    supersededBy: null,
    createdAt: '2024-10-15T10:00:00.000Z',
    createdBy: process.env.PUBLIC_SUPER_ADMIN_EMAIL || 'admin@example.com',
    updatedAt: now,
    updatedBy: createdBy
  }
};

// ============================================================================
// MAIN
// ============================================================================
async function seed() {
  console.log(`Seeding ADRs for project: ${projectId}\n`);

  for (const [id, data] of Object.entries(adrs)) {
    await db.ref(`adrs/${projectId}/${id}`).set(data);
    console.log(`  ✓ ${data.id}: ${data.title}`);
  }

  console.log(`\n✅ Created ${Object.keys(adrs).length} ADRs for ${projectId}`);
  process.exit(0);
}

seed().catch(err => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
