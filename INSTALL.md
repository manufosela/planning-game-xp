# Guía de Instalación - Planning Game XP

Esta guía te llevará paso a paso a través de la instalación completa de Planning Game XP.

## Índice

1. [Requisitos Previos](#requisitos-previos)
2. [Tiers de Instalación](#tiers-de-instalación)
3. [Instalación Rápida (Recomendada)](#instalación-rápida)
4. [Instalación Manual](#instalación-manual)
5. [Configuración de Firebase](#configuración-de-firebase)
6. [Configuración de Email](#configuración-de-email)
7. [Primer Despliegue](#primer-despliegue)
8. [MCP Server (Claude Code)](#mcp-server)
9. [Karajan-Code + Bridge Server (IA)](#karajan-code--bridge-server)
10. [Verificación](#verificación)
11. [Solución de Problemas](#solución-de-problemas)

---

## Requisitos Previos

### Software Requerido

| Software | Versión Mínima | Verificar con |
|----------|----------------|---------------|
| Node.js | 18.x | `node --version` |
| npm | 9.x | `npm --version` |
| Firebase CLI | 13.x | `firebase --version` |
| Git | 2.x | `git --version` |

### Software Opcional

| Software | Propósito | Verificar con |
|----------|-----------|---------------|
| gcloud CLI | Setup de App Admin | `gcloud --version` |
| Docker | Bridge Server (Tier 3) | `docker --version` |
| Docker Compose | Bridge Server (Tier 3) | `docker compose version` |

### Instalación de Requisitos

```bash
# Node.js (usando nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
nvm use 20

# Firebase CLI
npm install -g firebase-tools

# gcloud CLI (opcional, para setup de admin)
# Ver: https://cloud.google.com/sdk/docs/install
```

---

## Tiers de Instalación

Planning Game XP soporta 3 niveles de instalación:

| Tier | Componentes | Funcionalidad IA | Requisitos Extra |
|------|------------|-------------------|------------------|
| **1** | Solo Planning Game | Ninguna | Ninguno |
| **2** | PG + MCP Server | MCP via Claude Code CLI | Claude Code |
| **3** | PG + MCP + Karajan-Code + Bridge | Ejecución IA desde la UI web | Docker, Claude Code |

### Tier 1: Solo Planning Game
La instalación básica. Gestión de proyectos ágiles completa sin integración IA.

### Tier 2: Planning Game + MCP
Añade el MCP Server que permite gestionar Planning Game desde Claude Code (crear tareas, bugs, sprints, etc. via CLI).

### Tier 3: Planning Game + MCP + Karajan-Code + Bridge (IA completa)
Instalación completa con ejecución de tareas por IA directamente desde la interfaz web:
- **Karajan-Code**: Orquestador de IA que ejecuta tareas automáticamente
- **Bridge Server** (Docker): Conecta la UI web con Karajan-Code via REST + WebSocket
- **Dashboard IA**: Visualización en tiempo real de ejecuciones activas
- **Botón ⚡**: En cada tarjeta/bug para lanzar ejecución IA

El asistente `npm run setup` te permite elegir el tier durante la instalación.

### Instalación Resumible
Si la instalación se interrumpe (especialmente en Tier 3), el wizard la detecta al re-ejecutar `npm run setup` y ofrece continuar desde el punto de interrupción.

---

## Instalación Rápida

La forma más fácil de instalar es usando el asistente interactivo:

```bash
# 1. Clonar el repositorio

Por https:
git clone https://github.com/AgilePlanning-io/planning-game-xp.git
O por ssh:
git clone git@github.com:AgilePlanning-io/planning-game-xp.git

cd planning-game-xp

# 2. Instalar dependencias
npm install
cd functions && npm install && cd ..

# 3. Ejecutar el asistente de configuración
npm run setup
```

El asistente te guiará a través de toda la configuración.

---

## Instalación Manual

Si prefieres configurar manualmente:

### 1. Clonar y preparar

```bash
git clone https://github.com/AgilePlanning-io/planning-game-xp.git
cd planning-game-xp
npm install
cd functions && npm install && cd ..
```

### 2. Crear archivos de entorno

Copia las plantillas de entorno:

```bash
# Crear desde ejemplo (si existe) o crear vacío
touch .env.dev .env.pre .env.prod
touch functions/.env
```

Usa como referencia canónica los ejemplos en `config-examples/`.
Consulta también [ENV_VARIABLES.md](./ENV_VARIABLES.md) para la lista completa de variables.

### 3. Configurar Firebase

```bash
# Autenticarse
firebase login

# Seleccionar proyecto
firebase use tu-proyecto-id
```

---

## Configuración de Firebase

### Crear Proyecto en Firebase

1. Ir a [Firebase Console](https://console.firebase.google.com/)
2. Click en **Add project**
3. Nombre del proyecto: `planning-gamexp` (o el que prefieras)
4. Habilitar Google Analytics (recomendado)
5. Esperar a que se cree el proyecto

### Habilitar Servicios

En la consola de Firebase, habilitar:

1. **Authentication**
   - Ir a Authentication → Sign-in method
   - Habilitar el proveedor elegido durante `npm run setup`:
     - **Google**: Habilitar "Google" (la opción más sencilla)
     - **Microsoft**: Requiere Azure AD App Registration
     - **GitHub**: Requiere OAuth App en GitHub Developer Settings
     - **GitLab**: Configurar OIDC con tu instancia GitLab

2. **Realtime Database**
   - Ir a Realtime Database → Create Database
   - Seleccionar región: `europe-west1` (recomendado para EU)
   - Empezar en modo bloqueado (las reglas se desplegarán después)

3. **Storage**
   - Ir a Storage → Get started
   - Seleccionar región: `europe-west1`

4. **Cloud Functions**
   - Requiere plan Blaze (pay-as-you-go)
   - Ir a Functions → Get started

### Obtener Configuración

1. Ir a Project Settings (engranaje) → General
2. Scroll down a "Your apps"
3. Click en el icono de Web (`</>`)
4. Registrar la app con nickname
5. Copiar los valores de `firebaseConfig`

### Configurar Archivo .env

```bash
PUBLIC_FIREBASE_API_KEY=tu-api-key
PUBLIC_FIREBASE_AUTH_DOMAIN=tu-proyecto.firebaseapp.com
PUBLIC_FIREBASE_DATABASE_URL=https://tu-proyecto-default-rtdb.europe-west1.firebasedatabase.app
PUBLIC_FIREBASE_PROJECT_ID=tu-proyecto
PUBLIC_FIREBASE_STORAGE_BUCKET=tu-proyecto.firebasestorage.app
PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789
PUBLIC_FIREBASE_APP_ID=1:123456789:web:abc123
PUBLIC_FIREBASE_MEASUREMENT_ID=G-XXXXXXX
PUBLIC_SUPER_ADMIN_EMAIL=tu-email@dominio.com
```

---

## Configurar Proveedor de Autenticación

El asistente `npm run setup` te preguntará qué proveedor OAuth usar. Los proveedores soportados son:

| Proveedor | Variable `PUBLIC_AUTH_PROVIDER` | Notas |
|-----------|-------------------------------|-------|
| Google | `google` | Recomendado. Solo necesitas habilitarlo en Firebase Console. |
| Microsoft | `microsoft` | Requiere App Registration en Azure AD. |
| GitHub | `github` | Requiere OAuth App en GitHub Settings → Developer Settings. |
| GitLab | `gitlab` | Requiere `PUBLIC_GITLAB_ISSUER_URL` adicional. |

### Configuración por proveedor

**Google:**
1. Firebase Console → Authentication → Sign-in method → Google → Enable

**Microsoft:**
1. Crear App Registration en [Azure Portal](https://portal.azure.com/)
2. Redirect URI: `https://tu-proyecto.firebaseapp.com/__/auth/handler`
3. Firebase Console → Authentication → Sign-in method → Microsoft → Enable (con Client ID y Secret)

**GitHub:**
1. GitHub → Settings → Developer settings → OAuth Apps → New OAuth App
2. Authorization callback URL: `https://tu-proyecto.firebaseapp.com/__/auth/handler`
3. Firebase Console → Authentication → Sign-in method → GitHub → Enable (con Client ID y Secret)

**GitLab (OIDC):**
1. Configurar OIDC en tu instancia de GitLab
2. Firebase Console → Authentication → Sign-in method → OpenID Connect → Enable
3. Definir `PUBLIC_GITLAB_ISSUER_URL` en tus archivos `.env.*`

### Cambiar de proveedor después de la instalación

1. Editar `PUBLIC_AUTH_PROVIDER` en `.env.dev`, `.env.pre` y `.env.prod`
2. Si cambias a GitLab, añadir también `PUBLIC_GITLAB_ISSUER_URL`
3. Habilitar el nuevo proveedor en Firebase Console → Authentication
4. Reconstruir y desplegar: `npm run build && npm run deploy`

---

## Configuración de Email

Planning Game XP soporta:

- Microsoft Graph (`msgraph`)
- SMTP genérico (`smtp`)
- SendGrid (`sendgrid`)
- Sin email (`none`, solo push)

La plantilla canónica está en `config-examples/functions/.env.example`.

Documentación detallada: `docs/EMAIL_PROVIDERS.md`.

### Microsoft Graph

Para usar Microsoft Graph, necesitas configurar Azure AD App Registration.

---

## Entornos Recomendados (dev / pre / prod)

Recomendación práctica para evitar tocar datos reales:

- `npm run dev`: usa emuladores + seed mínimo automático.
- `npm run pre`: usa cloud (sin emuladores) para validar con datos reales.
- `npm run build` / deploy: producción.

Para `pre`, usa un proyecto clonado/snapshot (no el de producción) siempre que sea posible.

`npm run pre` ahora ejecuta un guard obligatorio (`pre:guard`) que bloquea la ejecución si `.env.pre` coincide con `.env.prod` en `projectId`, `databaseURL` o `authDomain`.
Si necesitas forzar temporalmente el uso de prod, puedes usar:

```bash
ALLOW_PRE_USING_PROD=true npm run pre
```

Plantillas rápidas en raíz:

- `.env.dev.example`
- `.env.pre.example`
- `.env.prod.example`

### Crear App Registration en Azure

1. Ir a [Azure Portal](https://portal.azure.com/)
2. **Azure Active Directory** → **App registrations** → **New registration**
3. Configurar:
   - Name: `PlanningGameXP-Notifications`
   - Supported account types: Single tenant (o Multi-tenant si necesario)
   - Redirect URI: (dejar vacío por ahora)

### Configurar Permisos

1. En la App Registration → **API permissions**
2. **Add a permission** → **Microsoft Graph** → **Application permissions**
3. Añadir: `Mail.Send`
4. **Grant admin consent** (requiere ser admin del tenant)

### Crear Secret

1. En la App Registration → **Certificates & secrets**
2. **New client secret**
3. Copiar el valor inmediatamente (no se puede ver después)

### Configurar en functions/.env

```bash
MS_CLIENT_ID=application-client-id
MS_CLIENT_SECRET=secret-value
MS_TENANT_ID=directory-tenant-id
MS_FROM_EMAIL=noreply@tudominio.com
```

---

## Primer Despliegue

### Desplegar Reglas

```bash
npm run deploy:rules
```

### Desplegar Cloud Functions

```bash
npm run deploy:functions
```

### Configurar Primer App Admin

```bash
# Autenticarse con gcloud
gcloud auth application-default login

# Ejecutar setup de admin
npm run setup:app-admin -- tu-email@dominio.com
```

### Construir y Desplegar Aplicación

```bash
npm run build
npm run deploy
```

---

## MCP Server

El MCP Server permite gestionar Planning Game desde Claude Code (tareas, bugs, sprints, etc.). El paso 8 del setup wizard lo instala automáticamente con soporte multi-instancia.

### Instalación durante el setup

El asistente `npm run setup` incluye la instalación del MCP como paso 8. Si lo omites, puedes instalarlo después re-ejecutando `npm run setup` y seleccionando la opción 3 ("Añadir un nuevo MCP").

### Arquitectura multi-instancia

El MCP usa un engine compartido y múltiples instancias independientes:

```
~/mcp-servers/
├── planning-game/                          # Engine compartido (git clone)
│   ├── index.js
│   └── package.json
└── planning-game-instances/                # Instancias
    ├── instances.json                      # Manifest de instancias
    ├── pro/                                # Instancia "pro"
    │   ├── .env
    │   ├── serviceAccountKey.json
    │   └── mcp.user.json
    └── dev/                                # Instancia "dev" (opcional)
        ├── .env
        ├── serviceAccountKey.json
        └── mcp.user.json
```

Cada instancia se registra en Claude como `planning-game-{nombre}` (ej: `planning-game-pro`).

### Re-ejecutar setup para gestionar MCP

Al re-ejecutar `npm run setup`, el wizard detecta instalaciones existentes y ofrece:

1. **Actualizar MCP existente** - Cambiar serviceAccountKey, identidad, re-registrar
2. **Reinstalar MCP** - Borrar instancia actual y crear nueva
3. **Añadir nuevo MCP** - Crear instancia adicional conectada a otro Planning Game
4. **Verificar instalación** - Ejecutar verificación completa
5. **Setup completo** - Re-ejecutar todo el wizard desde cero

### Instalación manual del MCP

Si prefieres instalar manualmente:

```bash
# 1. Clonar el engine
git clone https://github.com/AgilePlanning-io/planning-game-mcp.git ~/mcp-servers/planning-game
cd ~/mcp-servers/planning-game && npm install

# 2. Crear directorio de instancia
mkdir -p ~/mcp-servers/planning-game-instances/pro

# 3. Copiar serviceAccountKey.json
cp /path/to/serviceAccountKey.json ~/mcp-servers/planning-game-instances/pro/

# 4. Crear mcp.user.json
echo '{"developerId":"dev_XXX","developerName":"Tu Nombre","developerEmail":"tu@email.com"}' \
  > ~/mcp-servers/planning-game-instances/pro/mcp.user.json

# 5. Registrar en Claude
claude mcp add planning-game-pro -s user \
  -e DATABASE_URL=https://tu-proyecto.firebaseio.com \
  -e GOOGLE_APPLICATION_CREDENTIALS=~/mcp-servers/planning-game-instances/pro/serviceAccountKey.json \
  -e MCP_USER_CONFIG=~/mcp-servers/planning-game-instances/pro/mcp.user.json \
  -- node ~/mcp-servers/planning-game/index.js
```

### Migración desde instalación legacy

Si tienes una instalación MCP anterior (sin multi-instancia), el setup wizard la migra automáticamente a una instancia llamada "pro" y re-registra en Claude como `planning-game-pro`.

---

## Karajan-Code + Bridge Server

> **Solo Tier 3** - Esta sección solo aplica si seleccionas Tier 3 durante `npm run setup`.

### Arquitectura

```
┌─────────────────┐      ┌─────────────────┐      ┌──────────────────┐
│  PG Web UI      │      │ Bridge Server   │      │ Karajan-Code     │
│  (Navegador)    │◄────►│ (Docker)        │◄────►│ (CLI)            │
│                 │ WS+  │  Express + ws   │ CLI  │                  │
│  Botón ⚡       │ REST │  localhost:3100  │spawn │  kj run          │
│  Dashboard IA   │      │                 │      │                  │
└────────┬────────┘      └────────┬────────┘      └──────────────────┘
         │                        │
         │  Firebase RTDB         │  Firebase RTDB
         ▼                        ▼
   ┌──────────────────────────────────────┐
   │     Firebase Realtime Database       │
   │  /aiExecutions/{executionId}         │
   │  /aiExecutionsByCard/{proj}/{card}   │
   └──────────────────────────────────────┘
```

### Instalación automática (recomendada)

El asistente `npm run setup` (Tier 3) gestiona todo:

1. Clona el repositorio de Karajan-Code
2. Ejecuta el instalador de KJ (wizard interactivo propio)
3. Construye la imagen Docker del Bridge Server
4. Inicia el Bridge Server
5. Registra el MCP de Karajan-Code en Claude

### Instalación manual del Bridge

```bash
# 1. Construir la imagen Docker
docker compose build bridge

# 2. Configurar variables de entorno
export DATABASE_URL=https://tu-proyecto.firebaseio.com
export BRIDGE_API_KEY=$(openssl rand -hex 32)
export KJ_HOME=~/.karajan
export SERVICE_ACCOUNT_KEY_PATH=/path/to/serviceAccountKey.json

# 3. Iniciar el Bridge
docker compose up -d bridge

# 4. Verificar
curl http://localhost:3100/health
# Respuesta esperada: {"status":"ok","uptime":...}
```

### Gestión del Bridge Server

```bash
# Ver estado
docker ps | grep planninggame-bridge

# Ver logs
docker compose logs -f bridge

# Reiniciar
docker compose restart bridge

# Parar
docker compose stop bridge
```

### Funcionalidades IA en la UI

Cuando el Bridge está activo y configurado:

- **Botón ⚡** aparece en cada TaskCard y BugCard (si no está completada)
- **AiExecutionPanel**: Modal con progreso en tiempo real (WebSocket + RTDB)
- **Dashboard IA**: Tab "AI Executions" en el dashboard del proyecto
- **Cancelación**: Posibilidad de cancelar ejecuciones en curso

### Firebase RTDB para ejecuciones IA

La configuración del Bridge se almacena en RTDB `/config/bridge`:
```json
{
  "url": "http://localhost:3100",
  "apiKey": "hex-random-32-bytes"
}
```

Las ejecuciones se registran en `/aiExecutions/{executionId}` con estado, checkpoints y resultados en tiempo real.

---

## Verificación

### Verificar Configuración

```bash
npm run verify-setup
```

### Verificar Manualmente

1. **Acceder a la aplicación**
   - Abrir `https://tu-proyecto.web.app`
   - Debe mostrar la pantalla de login

2. **Iniciar sesión**
   - Click en "Sign in with ..." (el botón muestra el proveedor configurado)
   - Autenticarse con el email del Super Admin

3. **Verificar permisos**
   - Abrir consola del navegador (F12)
   - Ejecutar: `console.log(window.isAppAdmin)`
   - Debe mostrar `true`

4. **Probar funcionalidad de Apps**
   - Ir a un proyecto → Sección Apps
   - Debe poder subir y gestionar aplicaciones

---

## Solución de Problemas

### Error: "Firebase CLI not found"

```bash
npm install -g firebase-tools
firebase login
```

### Error: "Permission denied" al desplegar

```bash
# Verificar autenticación
firebase login --reauth

# Verificar proyecto seleccionado
firebase use
```

### Error: "User does not have permission" en Storage

El usuario necesita estar en `/data/appUploaders/{projectId}` o `/data/appAdmins`.

```bash
# Añadir como App Admin
npm run setup:app-admin -- email@dominio.com
```

### Error: "isAppAdmin is undefined"

El claim no se ha sincronizado. Soluciones:
1. Cerrar sesión y volver a entrar
2. Ejecutar la función de sincronización manualmente

### Los emails no se envían

Verificar configuración de Microsoft Graph:
1. ¿El secret ha expirado?
2. ¿Se ha dado "Admin consent" a los permisos?
3. ¿El email FROM existe en el tenant?

---

## Documentación Adicional

| Archivo | Descripción |
|---------|-------------|
| [README.md](./README.md) | Visión general del proyecto |
| [ENV_VARIABLES.md](./ENV_VARIABLES.md) | Todas las variables de entorno |
| [CLAUDE.md](./CLAUDE.md) | Guía para desarrollo con IA |
| [NEWUSER.md](./NEWUSER.md) | Cómo añadir nuevos usuarios |
| [docs/MCP_INSTALLATION_GUIDE.md](./docs/MCP_INSTALLATION_GUIDE.md) | Instalar MCP Server |

---

## Soporte

Si encuentras problemas:

1. Revisa la sección de [Solución de Problemas](#solución-de-problemas)
2. Consulta la documentación en `/docs`
3. Abre un issue en GitHub
