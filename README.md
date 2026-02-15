# Planning GameXP

Aplicación web para la gestión ágil de proyectos, siguiendo las prácticas de eXtreme Programming (XP).

## 🚀 Instalación Rápida

```bash
# 1. Clonar
git clone https://github.com/AgilePlanning-io/planning-game-xp.git
cd PlanningGameXP

# 2. Instalar dependencias
npm install && cd functions && npm install && cd ..

# 3. Ejecutar asistente de configuración (guía interactiva)
npm run setup
```

El asistente te guiará paso a paso. Ver [INSTALL.md](./INSTALL.md) para instrucciones detalladas.

### 🤖 Instalación con IA

¿Prefieres que una IA te guíe? Copia el prompt de [AI_SETUP_PROMPT.md](./AI_SETUP_PROMPT.md) y dáselo a Claude.

---

## 📚 Documentación Principal

| Documento | Descripción |
|-----------|-------------|
| [INSTALL.md](./INSTALL.md) | **Guía completa de instalación** |
| [ENV_VARIABLES.md](./ENV_VARIABLES.md) | Todas las variables de entorno |
| [NEWUSER.md](./NEWUSER.md) | Cómo añadir nuevos usuarios |
| [AI_SETUP_PROMPT.md](./AI_SETUP_PROMPT.md) | Prompt para instalación asistida por IA |
| [CLAUDE.md](./CLAUDE.md) | Instrucciones para desarrollo con IA |

---

## Versión Actual

v1.2.0 - Refactoring arquitectónico con servicios centralizados para mejorar la mantenibilidad y reducir el acoplamiento.

---

## Requisitos Previos

Antes de empezar, asegurate de tener instalado:

| Herramienta | Version minima | Comprobar instalacion |
|-------------|---------------|----------------------|
| Node.js | v18+ | `node --version` |
| npm | v9+ | `npm --version` |
| Git | cualquiera | `git --version` |
| Firebase CLI | ultima | `firebase --version` |
| Java | v11+ | `java --version` (necesario para emuladores) |

Si no tienes Firebase CLI:
```bash
npm install -g firebase-tools
```

---

## Instalacion paso a paso

### 1. Clonar el repositorio

```bash
git clone https://github.com/AgilePlanning-io/planning-game-xp.git
cd PlanningGameXP
```

### 2. Instalar dependencias del proyecto

```bash
npm install
```

### 3. Configurar archivos de entorno

Los archivos de entorno contienen las credenciales de Firebase y NO estan en el repositorio.

**Create them** by running `npm run setup` or manually from the template in [ENV_VARIABLES.md](./ENV_VARIABLES.md)

Copiar estos archivos a la raiz del proyecto:

| Archivo | Uso |
|---------|-----|
| `.env` | Variables base |
| `.env.dev` | Desarrollo local (emuladores) |
| `.env.pre` | Preproduccion |
| `.env.pro` | Produccion |

**Si vas a crear un proyecto Firebase nuevo** (no usar el existente), ver la seccion [Crear un proyecto Firebase nuevo](#crear-un-proyecto-firebase-nuevo).

### 4. Configurar Firebase

```bash
# Iniciar sesion en Firebase
firebase login

# Verificar que tienes acceso al proyecto
firebase projects:list
```

Run `npm run setup` to configure your Firebase project. The `firebase.json` is already configured in the repo.

### 5. Instalar dependencias de Cloud Functions

```bash
cd functions && npm install && cd ..
```

### 6. Iniciar desarrollo local

Necesitas **dos terminales**:

**Terminal 1 — Emuladores Firebase:**
```bash
npm run emulator
```
Esto arranca los emuladores con datos demo precargados. Veras:
- Emulator UI: http://localhost:4000
- Firestore: puerto 8080
- Realtime Database: puerto 9000
- Storage: puerto 9199

**Terminal 2 — Servidor de desarrollo:**
```bash
npm run dev
```
La app estara disponible en http://localhost:4321

> Cuando los emuladores estan activos, la app muestra una barra roja arriba: "USANDO EMULADORES LOCALES"

---

## Crear un proyecto Firebase nuevo

Si quieres replicar el proyecto en tu propio Firebase (no usar `<your-project-id>`):

### 1. Crear el proyecto en Firebase Console

1. Ve a https://console.firebase.google.com/
2. Click "Agregar proyecto"
3. Pon un nombre (ej: `mi-planning-game`)
4. Desactiva Google Analytics (no es necesario) o activalo si quieres

### 2. Activar servicios en Firebase Console

Activa estos servicios desde la consola web:

| Servicio | Donde activarlo | Notas |
|----------|----------------|-------|
| Authentication | Build → Authentication | Habilitar proveedor "Microsoft" con tus credenciales Azure AD |
| Realtime Database | Build → Realtime Database | Crear base de datos en `europe-west1` |
| Firestore | Build → Firestore Database | Crear en modo produccion, region `europe-west1` |
| Storage | Build → Storage | Crear bucket por defecto |
| Hosting | Build → Hosting | Configurar sitio |
| Cloud Functions | Build → Functions | Requiere plan Blaze (pago por uso) |
| Cloud Messaging | Engage → Messaging | Para push notifications |

### 3. Configurar Authentication con Microsoft

1. En Firebase Console → Authentication → Sign-in method
2. Habilitar "Microsoft"
3. Necesitas un App Registration en Azure AD:
   - Ve a https://portal.azure.com/ → Azure Active Directory → App registrations
   - Crear nueva app registration
   - Copiar `Application (client) ID` y crear un `Client secret`
   - En "Redirect URIs" añadir: `https://TU-PROYECTO.firebaseapp.com/__/auth/handler`
4. Pegar el Client ID y Secret en la config de Firebase Authentication

### 4. Generar Service Account Key

1. Firebase Console → Configuracion del proyecto (engranaje) → Cuentas de servicio
2. Click "Generar nueva clave privada"
3. Guardar el archivo como `serviceAccountKey.json` en la raiz del proyecto

> **IMPORTANTE:** Este archivo contiene credenciales sensibles. NUNCA lo subas a git (ya esta en `.gitignore`).

### 5. Crear archivos de entorno

Crea `.env.dev` con esta estructura (reemplaza con tus valores):

```env
# Firebase Config
PUBLIC_FIREBASE_API_KEY=tu-api-key
PUBLIC_FIREBASE_AUTH_DOMAIN=tu-proyecto.firebaseapp.com
PUBLIC_FIREBASE_DATABASE_URL=https://tu-proyecto-default-rtdb.europe-west1.firebasedatabase.app
PUBLIC_FIREBASE_PROJECT_ID=tu-proyecto
PUBLIC_FIREBASE_STORAGE_BUCKET=tu-proyecto.firebasestorage.app
PUBLIC_FIREBASE_MESSAGING_SENDER_ID=tu-sender-id
PUBLIC_FIREBASE_APP_ID=tu-app-id
PUBLIC_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX
PUBLIC_FIREBASE_VAPID_KEY=tu-vapid-key

# Emulator Config (no cambiar estos puertos)
USE_FIREBASE_EMULATOR=true
FIREBASE_EMULATOR_MESSAGING_PORT=5001
FIREBASE_EMULATOR_MESSAGING_HOST=localhost
FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
FIRESTORE_EMULATOR_HOST=localhost:8081
FIREBASE_DATABASE_EMULATOR_HOST=localhost:9000
FIREBASE_STORAGE_EMULATOR_HOST=localhost:9199

# Test user (para E2E tests)
TEST_USER_EMAIL=tu-usuario-test@dominio.com
TEST_USER_PASSWORD=tu-password

# Microsoft OAuth (Azure AD)
MS_CLIENT_ID=tu-client-id
MS_CLIENT_SECRET=tu-client-secret
MS_TENANT_ID=tu-tenant-id
MS_FROM_EMAIL=tu-email@dominio.com

# Super Admin
PUBLIC_SUPER_ADMIN_EMAIL=tu-admin@dominio.com
```

Para `.env.pro`, es lo mismo pero con `USE_FIREBASE_EMULATOR=false` y sin las lineas de emulador.

### 6. Actualizar `.firebaserc`

Reemplaza el contenido con tu proyecto:

```json
{
  "projects": {
    "default": "tu-proyecto"
  },
  "targets": {
    "tu-proyecto": {
      "database": {
        "main": [
          "tu-proyecto-default-rtdb"
        ]
      }
    }
  }
}
```

### 7. Desplegar reglas de seguridad

```bash
firebase deploy --only firestore:rules,database,storage
```

### 8. Inicializar contadores de Firestore

Los contadores de Firestore se crean automaticamente al crear el primer proyecto desde la app. No necesitas hacer nada manual.

### 9. Crear el primer usuario

Sigue las instrucciones en [NEWUSER.md](./NEWUSER.md) para configurar permisos en la Realtime Database.

---

## Servidor MCP — Usa la IA para desarrollar tareas del Planning Game

> **Este proyecto incluye un servidor MCP que conecta Claude Code (o Cursor) con la base de datos de Planning GameXP.** Esto permite que la IA lea tus tareas, bugs y proyectos, y los desarrolle directamente en el repo donde estes trabajando.

### Que es y como funciona

MCP (Model Context Protocol) es un protocolo que da herramientas extra a Claude Code/Cursor. NO es parte de la app web, NO tiene UI, y NO se despliega en ningun servidor. Es un proceso local que corre en tu maquina y conecta la IA con Firebase.

```
┌─────────────────┐  stdin/stdout  ┌─────────────┐  Firebase Admin  ┌──────────┐
│ Claude Code /   │ ◄────────────► │ MCP Server  │ ◄──────────────► │ Firebase │
│ Cursor          │                │ (local)     │                  │  (prod)  │
└─────────────────┘                └─────────────┘                  └──────────┘
```

### Configuracion inicial (una sola vez)

> **Nota:** El servidor MCP se encuentra en una ubicación global: `~/mcp-servers/planning-game/`
> Este servidor es compartido entre todos los proyectos y no forma parte del repositorio.

#### 1. Obtener el Service Account Key

Download the `serviceAccountKey.json` from Firebase Console (Project Settings > Service accounts) and copy it to `~/mcp-servers/planning-game/`.

#### 2. Elegir el modo de uso

Tienes **dos opciones** segun como quieras usarlo:

---

**OPCION A — Solo en este repo (automatico al clonar)**

No necesitas hacer nada mas. El `.mcp.json` ya esta en el repo. Cuando abras Claude Code o Cursor en el directorio PlanningGameXP, detectara el MCP automaticamente.

> Esta opcion solo funciona cuando trabajas DENTRO del directorio PlanningGameXP.

---

**OPCION B — Global, para usar desde CUALQUIER repo (recomendado)**

Ejecuta este comando una sola vez en tu terminal:

```bash
claude mcp add planning-game \
  -s user \
  -e GOOGLE_APPLICATION_CREDENTIALS=$HOME/mcp-servers/planning-game/serviceAccountKey.json \
  -e FIREBASE_DATABASE_URL=https://your-project-default-rtdb.europe-west1.firebasedatabase.app \
  -- node $HOME/mcp-servers/planning-game/index.js
```

Esto guarda la configuracion en tu `~/.claude.json`. A partir de ahora, puedes abrir Claude Code en **cualquier directorio** (cualquier otro proyecto) y tendras acceso a las tareas del Planning Game.

> Para Cursor: configura el MCP server en Settings → MCP Servers con los mismos datos.

---

#### 4. Verificar que funciona

Reinicia Claude Code (Ctrl+C y volver a entrar) y ejecuta:

```bash
claude mcp list
```

Debe mostrar: `planning-game: ... ✓ Connected`

### Que puedes hacer con el MCP

Una vez activo, puedes pedirle a la IA cosas como:

- "Lista los proyectos de Planning Game"
- "Que tareas tiene MyProject en estado To Do?"
- "Muestra el detalle de la card PRJ-TSK-0001"
- "Crea una tarea en MyProject con titulo X"
- "Cambia el status de esta card a Done"
- "Que sprints hay en MyProject para 2026?"
- "Lista los developers"

**Caso de uso principal:** Estas trabajando en el repo de tu proyecto. Le pides a Claude "lee la tarea PRJ-TSK-0001 y desarrollala". La IA lee la descripcion, acceptance criteria, y escribe el codigo directamente en el repo donde estas.

### Tools disponibles

| Tool | Descripcion |
|------|-------------|
| `list_projects` | Lista todos los proyectos |
| `list_cards` | Cards de un proyecto filtradas por tipo/status/sprint/developer/year |
| `get_card` | Detalle completo de una card |
| `create_card` | Crear task/bug/epic/proposal con ID auto-generado |
| `update_card` | Actualizar campos de una card existente |
| `list_sprints` | Sprints de un proyecto |
| `list_developers` | Todos los developers del sistema |

### Seguridad del MCP

- El MCP conecta a **produccion** — las operaciones de escritura son reales
- Las cards creadas via MCP se marcan con `createdBy: "claude-code-mcp"` para trazabilidad
- El `serviceAccountKey.json` esta en `.gitignore` y NUNCA debe subirse al repo
- El `.mcp.json` NO contiene credenciales (solo referencia al archivo de service account)
- La config `--scope user` es local a tu maquina — nadie mas la ve

---

## Scripts Disponibles

### Desarrollo

| Comando | Descripcion |
|---------|-------------|
| `npm run dev` | Servidor de desarrollo (puerto 4321) |
| `npm run emulator` | Emuladores Firebase con datos demo |
| `npm run emulator:check` | Verificar estado de emuladores |
| `npm run emulator:export` | Exportar datos del emulador |
| `npm run preview` | Previsualizar build generada |

### Build

| Comando | Descripcion |
|---------|-------------|
| `npm run build` | Build de produccion (con security check) |
| `npm run build-preview` | Build de preproduccion |
| `npm run build-prod` | Build de produccion explicita |
| `npm run generate-sw` | Regenerar service worker |

### Testing

| Comando | Descripcion |
|---------|-------------|
| `npm run test` | Tests unitarios (Vitest) |
| `npm run test:coverage` | Tests con reporte de cobertura |
| `npm run test:watch` | Tests en modo watch |
| `npm run test:e2e` | Tests E2E (Playwright) |
| `npm run test:e2e:ui` | Tests E2E con interfaz visual |
| `npm run test:e2e:headed` | Tests E2E con navegador visible |

### Despliegue

| Comando | Descripcion |
|---------|-------------|
| `npm run deploy` | Desplegar todo a Firebase |
| `npm run deploy:hosting` | Solo hosting |
| `npm run deploy:functions` | Solo Cloud Functions |
| `npm run deploy:rules` | Solo reglas de seguridad |
| `npm run security-check` | Auditoria de seguridad |

### Seed y Migracion

| Comando | Descripcion |
|---------|-------------|
| `node scripts/seed-global-config.js` | Crear configs globales iniciales (agents, prompts, instructions) |
| `node scripts/seed-adrs.js [projectId]` | Crear ADRs de ejemplo para un proyecto |
| `node scripts/migrate-add-year-field.js <input.json>` | Migrar campo year a todas las cards |

> Ver [GLOBAL_CONFIG.md](./GLOBAL_CONFIG.md) para mas detalles sobre la configuracion global y ADRs.

---

## Estructura del Proyecto

```
PlanningGameXP/
├── public/js/                # Codigo JavaScript del frontend
│   ├── services/             # Servicios centralizados (Firebase, Cards, Permisos...)
│   ├── controllers/          # Controladores de la app
│   ├── events/               # Sistema de delegacion de eventos
│   ├── wc/                   # Web Components (Lit)
│   ├── renderers/            # Renderizadores de vistas
│   ├── factories/            # Patron Factory (cards, vistas)
│   ├── filters/              # Sistema de filtros
│   ├── utils/                # Utilidades
│   └── constants/            # Constantes
├── src/
│   ├── pages/                # Paginas Astro (index, dashboard, sprintview...)
│   ├── layouts/              # Layouts de Astro
│   └── firebase/             # Config de Firebase
├── functions/                # Cloud Functions de Firebase
├── tests/                    # Tests unitarios (Vitest)
├── playwright/               # Tests E2E (Playwright)
├── tests/mcp-server/         # Tests del servidor MCP (ubicado en ~/mcp-servers/planning-game/)
├── scripts/                  # Scripts de mantenimiento y migracion
├── emulator-data/            # Datos demo para emuladores
├── dist/                     # Build generada (se despliega aqui)
├── .env.dev                  # Variables de entorno desarrollo (NO en git)
├── .env.pre                  # Variables de entorno preproduccion (NO en git)
├── .env.pro                  # Variables de entorno produccion (NO en git)
├── .mcp.json                 # Configuracion del MCP server
├── firebase.json             # Configuracion Firebase (emuladores, hosting, reglas)
├── .firebaserc               # Proyecto Firebase asociado
└── serviceAccountKey.json    # Credenciales Firebase Admin (NO en git)
```

---

## Tecnologias

- **Frontend:** Astro v5 + Lit Web Components
- **Backend:** Firebase (Realtime Database, Firestore, Auth, Cloud Functions, Storage, FCM)
- **Testing:** Vitest (unit) + Playwright (E2E)
- **Auth:** Microsoft OAuth via Azure AD
- **MCP:** Model Context Protocol para integracion con Claude Code

---

## Arquitectura

- **Servicios Centralizados**: Gestion unificada de permisos, filtros, modales y eventos
- **Event Delegation**: Un solo listener por tipo de evento, gestion centralizada
- **Web Components**: Lit-based, comunicacion via eventos, estilos separados
- **Factory Pattern**: CardFactory y ViewFactory para diferentes tipos/vistas
- **Service-Oriented Architecture**: Separacion de responsabilidades

Para mas detalles, consulta [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Despliegue a Produccion

```bash
# 1. Build (incluye security check automatico)
npm run build

# 2. Desplegar
npm run deploy
```

> **IMPORTANTE:** El directorio de deploy es `dist`, NUNCA `public`. Astro usa `public/` para archivos estaticos de desarrollo.

---

## Solucion de Problemas

### Emuladores

| Problema | Solucion |
|----------|----------|
| El emulador no arranca | Verificar que los puertos 4000, 8080, 9000, 9199 no estan ocupados |
| No aparece la barra roja | Verificar `.env.dev` tiene `USE_FIREBASE_EMULATOR=true` |
| No carga datos demo | Los datos se importan desde `emulator-data/` automaticamente |
| Error de Java | Instalar Java JDK 11+: `sudo apt install openjdk-11-jdk` |

### Build

| Problema | Solucion |
|----------|----------|
| Security check falla | Ejecutar `npm run security:fix` |
| Falta `.env` | Run `npm run setup` to generate environment files |
| Deploy falla | Verificar `firebase login` y que tienes permisos en el proyecto |

### MCP Server

| Problema | Solucion |
|----------|----------|
| MCP no encontrado | Verificar que `~/mcp-servers/planning-game/` existe con `index.js` y `serviceAccountKey.json` |
| Claude Code no detecta el MCP | Reiniciar Claude Code (Ctrl+C y volver a entrar) |
| Error "Can't determine Firebase Database URL" | Verificar que `serviceAccountKey.json` existe en la raiz |
| Error de autenticacion | El service account key puede estar expirado, regenerar desde Firebase Console |

---

## Documentación Adicional

### Instalación y Configuración

| Documento | Contenido |
|-----------|-----------|
| [INSTALL.md](./INSTALL.md) | Guía completa de instalación paso a paso |
| [ENV_VARIABLES.md](./ENV_VARIABLES.md) | Todas las variables de entorno necesarias |
| [AI_SETUP_PROMPT.md](./AI_SETUP_PROMPT.md) | Prompt para instalación asistida por IA |
| [NEWUSER.md](./NEWUSER.md) | Cómo dar de alta usuarios |

### Desarrollo

| Documento | Contenido |
|-----------|-----------|
| [CLAUDE.md](./CLAUDE.md) | Instrucciones para Claude Code |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Arquitectura detallada |
| [GLOBAL_CONFIG.md](./GLOBAL_CONFIG.md) | Configuración global de IA y ADRs |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Guía para contribuir |

### Testing y Referencia

| Documento | Contenido |
|-----------|-----------|
| [README-PLAYWRIGHT.md](./README-PLAYWRIGHT.md) | Tests E2E con Playwright |
| [FIREBASE_REALTIME_DATABASE_STRUCTURE.md](./FIREBASE_REALTIME_DATABASE_STRUCTURE.md) | Estructura de la base de datos |
| [functions/README.md](./functions/README.md) | Cloud Functions |
| [CHANGELOG.md](./CHANGELOG.md) | Registro de cambios |
| [docs/MCP_INSTALLATION_GUIDE.md](./docs/MCP_INSTALLATION_GUIDE.md) | Instalar MCP Server |
