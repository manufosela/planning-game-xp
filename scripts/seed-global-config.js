#!/usr/bin/env node
/**
 * Seed script for global configurations
 * Creates initial agents, prompts, and instructions
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json node scripts/seed-global-config.js
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

// ============================================================================
// INSTRUCTIONS
// ============================================================================
const instructions = {
  'instr_code_style': {
    name: 'Guías de Estilo de Código',
    description: 'Principios y convenciones de código para todos los proyectos',
    category: 'development',
    content: `# Guías de Estilo de Código

## Principios Generales
- **SOLID**: Single responsibility, Open/closed, Liskov substitution, Interface segregation, Dependency inversion
- **DRY**: Don't Repeat Yourself
- **KISS**: Keep It Simple, Stupid
- **YAGNI**: You Aren't Gonna Need It

## JavaScript/TypeScript
- Usar \`const\` por defecto, \`let\` solo cuando sea necesario
- Preferir arrow functions para callbacks
- Usar template literals para strings con variables
- Evitar \`any\` en TypeScript, definir tipos específicos
- Nombrar funciones y variables en inglés, descriptivamente

## Commits
- Usar Conventional Commits: \`feat:\`, \`fix:\`, \`refactor:\`, \`docs:\`, \`test:\`, \`chore:\`
- Mensaje corto (<70 chars) en primera línea
- Descripción detallada si es necesario en líneas siguientes
- NUNCA incluir referencias a Claude o IA en commits

## Sin Fallbacks
- El sistema funciona o falla, nunca silenciosamente
- Lanzar errores en lugar de usar valores por defecto incorrectos
- Cadenas \`||\` para datos críticos está PROHIBIDO`,
    createdAt: now,
    createdBy,
    updatedAt: now,
    updatedBy: createdBy
  },

  'instr_testing': {
    name: 'Estándares de Testing',
    description: 'Estándares de testing para garantizar calidad del código',
    category: 'qa',
    content: `# Estándares de Testing

## Desarrollo Test-First (Obligatorio)
1. ANTES de cualquier cambio, verificar si existen tests
2. Si NO existen tests: CREAR TESTS PRIMERO
3. Hacer UN cambio pequeño a la vez
4. Ejecutar tests después de CADA cambio

## Tipos de Tests
- **Unit Tests**: Para funciones y clases aisladas (Vitest)
- **Integration Tests**: Para servicios que interactúan
- **E2E Tests**: Para flujos completos de usuario (Playwright)

## Convenciones
\`\`\`javascript
describe('NombreComponente', () => {
  describe('nombreMetodo', () => {
    it('debería [resultado esperado] cuando [condición]', () => {
      // Arrange - Act - Assert
    });
  });
});
\`\`\`

## Coverage Mínimo
- Servicios: 80%
- Utilidades: 90%
- Componentes críticos: 70%

## Nunca Saltar Tests
- Si fallan, ARREGLAR antes de continuar
- Si hay que cambiar comportamiento, actualizar tests PRIMERO`,
    createdAt: now,
    createdBy,
    updatedAt: now,
    updatedBy: createdBy
  },

  'instr_security': {
    name: 'Guías de Seguridad',
    description: 'Guías de seguridad para desarrollo seguro',
    category: 'development',
    content: `# Guías de Seguridad

## Validación de Entrada
- SIEMPRE validar entrada del usuario
- Sanitizar datos antes de mostrar (XSS)
- Usar prepared statements/parameterized queries (SQL injection)

## Datos Sensibles
- NUNCA commitear credenciales, API keys, secrets
- Usar variables de entorno (.env)
- Archivos .env en .gitignore
- serviceAccountKey.json NUNCA en git

## Dependencias
- Ejecutar \`npm audit\` regularmente
- Actualizar dependencias con vulnerabilidades conocidas
- Usar overrides en package.json si es necesario

## Firebase Específico
- Reglas de seguridad en Firestore/RTDB
- Validar permisos en Cloud Functions
- No exponer Admin SDK en cliente`,
    createdAt: now,
    createdBy,
    updatedAt: now,
    updatedBy: createdBy
  },

  'instr_ui_ux': {
    name: 'Guías de UI/UX',
    description: 'Guías de interfaz de usuario y experiencia',
    category: 'development',
    content: `# Guías de UI/UX

## Diálogos y Modales
- NUNCA usar alert(), confirm(), prompt() nativos del navegador
- Usar siempre el sistema de modales de la aplicación (ModalService, AppModal)
- Los modales deben seguir el patrón existente en el codebase

## Feedback al Usuario
- Mostrar loading/spinner durante operaciones asíncronas
- Notificaciones toast para éxito/error (SlideNotification)
- Mensajes de error claros y accionables

## Accesibilidad
- Labels en todos los inputs
- Contraste suficiente en colores
- Navegación por teclado

## Responsive
- Mobile-first cuando sea posible
- Breakpoints consistentes
- Touch-friendly en móviles`,
    createdAt: now,
    createdBy,
    updatedAt: now,
    updatedBy: createdBy
  }
};

// ============================================================================
// AGENTS
// ============================================================================
const agents = {
  'agent_developer': {
    name: 'BecarIA Developer',
    description: 'Agente para desarrollo de código con buenas prácticas',
    category: 'development',
    content: `# BecarIA Developer Agent

## Rol
Desarrollador de software que sigue las mejores prácticas del equipo.

## Comportamiento
1. Lee y entiende el código existente ANTES de modificar
2. Sigue TDD: escribe tests primero
3. Hace commits pequeños y atómicos
4. Documenta decisiones importantes

## Al recibir una tarea:
1. Leer los criterios de aceptación
2. Verificar que tiene devPoints y businessPoints
3. Actualizar status a "In Progress"
4. Implementar siguiendo las guías de estilo
5. Ejecutar tests
6. Actualizar status a "To Validate"

## Restricciones
- NO usar fallbacks silenciosos
- NO commitear sin tests
- NO modificar código que no has leído
- NO usar emojis en código/commits`,
    createdAt: now,
    createdBy,
    updatedAt: now,
    updatedBy: createdBy
  },

  'agent_reviewer': {
    name: 'BecarIA Code Reviewer',
    description: 'Agente para revisión de código',
    category: 'qa',
    content: `# BecarIA Code Reviewer Agent

## Rol
Revisor de código que garantiza calidad y consistencia.

## Checklist de Review
- [ ] Tests: ¿Hay tests? ¿Cubren casos edge?
- [ ] Estilo: ¿Sigue las guías de estilo?
- [ ] Seguridad: ¿Hay vulnerabilidades?
- [ ] Rendimiento: ¿Hay problemas de rendimiento obvios?
- [ ] Naming: ¿Los nombres son claros y descriptivos?
- [ ] SOLID/DRY/KISS: ¿Se siguen los principios?

## Feedback
- Ser específico y constructivo
- Explicar el "por qué", no solo el "qué"
- Sugerir alternativas cuando se rechaza algo
- Priorizar: crítico > importante > sugerencia`,
    createdAt: now,
    createdBy,
    updatedAt: now,
    updatedBy: createdBy
  }
};

// ============================================================================
// PROMPTS
// ============================================================================
const prompts = {
  'prompt_estimation': {
    name: 'Estimación de Tareas',
    description: 'Prompt para estimar devPoints y businessPoints de tareas',
    category: 'planning',
    content: `# Prompt de Estimación de Tareas

Analiza la tarea y proporciona estimación de puntos.

## Escala devPoints (1-5)
- **1**: Trivial, < 1 hora, cambio de una línea
- **2**: Simple, 1-4 horas, cambios localizados
- **3**: Medio, 1 día, múltiples archivos
- **4**: Complejo, 2-3 días, múltiples sistemas
- **5**: Muy complejo, > 3 días, arquitectura

## Escala businessPoints (1-5)
- **1**: Nice to have, sin impacto en negocio
- **2**: Mejora menor, UX mejorada
- **3**: Importante, afecta productividad
- **4**: Crítico, bloquea flujos de trabajo
- **5**: Urgente, pérdida de dinero/clientes

## Fórmula de prioridad
Priority = (businessPoints * 100) / devPoints

## Output esperado
- devPoints: X
- businessPoints: X
- Justificación: [breve explicación]`,
    createdAt: now,
    createdBy,
    updatedAt: now,
    updatedBy: createdBy
  },

  'prompt_acceptance_criteria': {
    name: 'Generador de Criterios de Aceptación',
    description: 'Genera criterios de aceptación en formato Given-When-Then',
    category: 'planning',
    content: `# Generador de Criterios de Aceptación

Genera criterios de aceptación para la tarea en formato Given-When-Then.

## Formato
\`\`\`json
{
  "acceptanceCriteriaStructured": [
    {
      "given": "contexto inicial",
      "when": "acción del usuario",
      "then": "resultado esperado",
      "raw": "texto libre opcional"
    }
  ]
}
\`\`\`

## Guías
- Mínimo 2 criterios por tarea
- Incluir caso happy path
- Incluir al menos un caso edge/error
- Ser específico y verificable
- Evitar ambigüedades

## Ejemplo
- Given: El usuario está autenticado
- When: Hace click en "Guardar"
- Then: Se muestra notificación de éxito y los datos persisten`,
    createdAt: now,
    createdBy,
    updatedAt: now,
    updatedBy: createdBy
  },

  'prompt_bug_analysis': {
    name: 'Análisis de Bugs',
    description: 'Analiza bugs para determinar causa raíz',
    category: 'qa',
    content: `# Prompt de Análisis de Bugs

Analiza el bug reportado siguiendo esta estructura:

## 1. Verificación
- ¿El bug es reproducible?
- ¿Podría ser un problema de caché?
- ¿Se reproduce en múltiples navegadores/dispositivos?

## 2. Localización
- ¿En qué archivo/función ocurre?
- ¿Es frontend, backend, o ambos?
- ¿Hay logs de error relevantes?

## 3. Causa Raíz
- ¿Qué condición causa el bug?
- ¿Cuándo se introdujo? (git bisect si es necesario)
- ¿Hay otros lugares con el mismo patrón?

## 4. Solución
- ¿Cuál es el fix más simple?
- ¿Hay riesgo de regresión?
- ¿Necesita tests adicionales?

## Prioridades de Bug
- APPLICATION BLOCKER: App no funciona
- DEPARTMENT BLOCKER: Un departamento no puede trabajar
- INDIVIDUAL BLOCKER: Un usuario no puede trabajar
- USER EXPERIENCE ISSUE: Funciona pero mal UX
- WORKAROUND AVAILABLE: Hay alternativa temporal`,
    createdAt: now,
    createdBy,
    updatedAt: now,
    updatedBy: createdBy
  }
};

// ============================================================================
// MAIN
// ============================================================================
async function seed() {
  console.log('Seeding global configurations...\n');

  // Seed Instructions
  console.log('Creando Instructions...');
  for (const [id, data] of Object.entries(instructions)) {
    await db.ref(`global/instructions/${id}`).set(data);
    console.log(`  ✓ ${data.name}`);
  }

  // Seed Agents
  console.log('\nCreando Agents...');
  for (const [id, data] of Object.entries(agents)) {
    await db.ref(`global/agents/${id}`).set(data);
    console.log(`  ✓ ${data.name}`);
  }

  // Seed Prompts
  console.log('\nCreando Prompts...');
  for (const [id, data] of Object.entries(prompts)) {
    await db.ref(`global/prompts/${id}`).set(data);
    console.log(`  ✓ ${data.name}`);
  }

  console.log('\n✅ Seeding completado!');
  console.log('\nCreados:');
  console.log(`  - ${Object.keys(instructions).length} Instructions`);
  console.log(`  - ${Object.keys(agents).length} Agents`);
  console.log(`  - ${Object.keys(prompts).length} Prompts`);

  process.exit(0);
}

seed().catch(err => {
  console.error('Seeding failed:', err);
  process.exit(1);
});
