# Guía de Instalación de MCPs en Claude Code

Esta guía explica paso a paso cómo instalar y configurar MCPs (Model Context Protocol) en Claude Code, tanto para este proyecto como de forma global.

## ¿Qué es un MCP?

Un **MCP (Model Context Protocol)** es un servidor que extiende las capacidades de Claude Code, permitiéndole interactuar con servicios externos como:
- **GitHub** - Crear PRs, gestionar issues, buscar código
- **Chrome DevTools** - Inspeccionar páginas web, ver consola, network
- **Playwright** - Automatizar navegadores para testing
- **Planning Game** - Gestionar tarjetas del proyecto (específico de este repo)

Los MCPs funcionan como "plugins" que Claude puede usar durante la conversación.

## Requisitos Previos

```bash
# 1. Node.js 18+ instalado
node -v  # Debe mostrar v18.x.x o superior

# 2. Claude Code CLI instalado
claude --version

# Si no está instalado:
npm install -g @anthropic-ai/claude-code
```

## Tipos de Scope: User vs Project

| Scope | Ubicación Config | Disponibilidad | Uso típico |
|-------|------------------|----------------|------------|
| `--scope user` | `~/.claude.json` | En TODOS los proyectos | GitHub, Chrome DevTools, Playwright |
| `--scope project` | `.mcp.json` en el proyecto | Solo en ESTE proyecto | Planning Game, MCPs específicos |

## Instalación Automática (Recomendado)

Para este proyecto, ejecuta el script de setup:

```bash
./scripts/setup-dev-environment.sh
```

Este script instala y configura todos los MCPs necesarios automáticamente.

## Instalación Manual de MCPs

### Ver MCPs instalados

```bash
claude mcp list
```

### Añadir un MCP

Sintaxis general:
```bash
claude mcp add <nombre> --scope <user|project> [opciones] -- <comando>
```

### Eliminar un MCP

```bash
claude mcp remove <nombre>
```

---

## MCPs Globales (scope user)

Estos MCPs se instalan una vez y están disponibles en todos los proyectos.

### 1. Chrome DevTools MCP

Permite inspeccionar páginas web, ver consola, network, DOM.

```bash
claude mcp add chrome-devtools --scope user -- npx chrome-devtools-mcp@latest
```

**Requisito**: Google Chrome instalado.

**Uso**: Claude puede tomar snapshots de páginas, ver errores de consola, inspeccionar elementos.

### 2. Playwright MCP

Permite automatizar navegadores para testing E2E.

```bash
claude mcp add playwright --scope user -- npx -y @playwright/mcp@latest
```

**Post-instalación**: Instalar navegadores de Playwright:
```bash
npx playwright install chrome
npx playwright install chromium
```

**Uso**: Claude puede navegar páginas, hacer click en elementos, rellenar formularios.

### 3. GitHub MCP

Permite gestionar PRs, issues, branches, buscar código.

#### Paso 1: Crear un Personal Access Token

Ir a [GitHub Settings > Developer settings > Personal access tokens](https://github.com/settings/tokens).

**Opción A: Fine-grained token (recomendado)**

Más seguro — permite limitar a repos específicos.

| Permiso | Acceso | Para qué |
|---------|--------|----------|
| **Metadata** | Read-only | Info básica del repo (obligatorio) |
| **Contents** | Read & Write | Leer/escribir código, branches |
| **Pull requests** | Read & Write | Crear/gestionar PRs |
| **Issues** | Read & Write | Crear/gestionar issues |
| **Actions** | Read-only | Ver estado de CI/CD workflows (opcional) |
| **Commit statuses** | Read-only | Ver checks de commits (opcional) |

**Opción B: Classic token**

Más simple pero con acceso más amplio.

| Scope | Para qué |
|-------|----------|
| **repo** (completo) | Acceso a repos privados, PRs, issues, código |
| **read:org** | Leer info de la organización |
| **read:user** | Leer perfil del usuario |

#### Paso 2: Configurar y registrar

```bash
# 1. Guardar el token en tu shell config (~/.bashrc o ~/.zshrc):
export GITHUB_PERSONAL_ACCESS_TOKEN="ghp_xxxxxxxxxxxx"

# 2. Recargar shell
source ~/.bashrc  # o ~/.zshrc

# 3. Instalar el MCP (requiere Docker)
docker pull ghcr.io/github/github-mcp-server

claude mcp add github --scope user \
    -e GITHUB_PERSONAL_ACCESS_TOKEN="$GITHUB_PERSONAL_ACCESS_TOKEN" \
    -- docker run -i --rm -e GITHUB_PERSONAL_ACCESS_TOKEN ghcr.io/github/github-mcp-server
```

**Requisitos**: Docker corriendo, GitHub Personal Access Token.

**Uso**: Claude puede crear PRs, ver issues, buscar código en repos.

---

## MCPs de Proyecto (scope project)

Estos MCPs solo funcionan en el proyecto donde se configuran.

### Planning Game MCP

Permite gestionar tarjetas (tareas, bugs, epics, proposals), sprints, ADRs, planes de desarrollo y configuración global del Planning Game.

#### Paso 1: Instalar el servidor MCP

```bash
npm install -g planning-game-mcp
```

#### Paso 2: Obtener credenciales de Firebase

Necesitas un `serviceAccountKey.json` de tu proyecto Firebase:

1. Ir a [Firebase Console](https://console.firebase.google.com) > Project Settings > Service Accounts
2. Click "Generate new private key"
3. Guardar el archivo en un lugar seguro (nunca commitear a git)

```bash
# Ejemplo: guardar en ~/.config/planning-game/
mkdir -p ~/.config/planning-game
mv ~/Downloads/serviceAccountKey.json ~/.config/planning-game/
```

#### Paso 3: Registrar en Claude Code

**Opción A: Con npm install global (recomendado)**

```bash
claude mcp add planning-game --scope user \
  -e GOOGLE_APPLICATION_CREDENTIALS=$HOME/.config/planning-game/serviceAccountKey.json \
  -e FIREBASE_DATABASE_URL=https://tu-proyecto-default-rtdb.europe-west1.firebasedatabase.app \
  -- planning-game-mcp
```

**Opción B: Con npx (sin instalar)**

```bash
claude mcp add planning-game --scope user \
  -e GOOGLE_APPLICATION_CREDENTIALS=$HOME/.config/planning-game/serviceAccountKey.json \
  -e FIREBASE_DATABASE_URL=https://tu-proyecto-default-rtdb.europe-west1.firebasedatabase.app \
  -- npx planning-game-mcp
```

**Opción C: Desde el código fuente**

```bash
git clone https://github.com/manufosela/planning-game-xp.git
cd planning-game-xp/mcp && npm install

claude mcp add planning-game --scope user \
  -e GOOGLE_APPLICATION_CREDENTIALS=$HOME/.config/planning-game/serviceAccountKey.json \
  -e FIREBASE_DATABASE_URL=https://tu-proyecto-default-rtdb.europe-west1.firebasedatabase.app \
  -- node /ruta/absoluta/planning-game-xp/mcp/index.js
```

> **Nota:** El MCP server está integrado como subdirectorio `mcp/` de este repositorio. También se publica como paquete npm independiente (`planning-game-mcp`) para las opciones A y B.

#### Paso 4: Configurar identidad (primera vez)

Al arrancar Claude Code con el MCP conectado:

```
> Use setup_mcp_user to configure my identity
```

Esto crea un `mcp.user.json` con tu ID de developer, usado para tracking de quién crea/actualiza cards.

#### Multi-instancia

Para conectar a múltiples proyectos Firebase simultáneamente:

```bash
# Instancia 1
claude mcp add planning-game-teamA --scope user \
  -e GOOGLE_APPLICATION_CREDENTIALS=/ruta/teamA/serviceAccountKey.json \
  -e FIREBASE_DATABASE_URL=https://team-a-default-rtdb.firebasedatabase.app \
  -e MCP_INSTANCE_DIR=/ruta/teamA/config \
  -- planning-game-mcp

# Instancia 2
claude mcp add planning-game-teamB --scope user \
  -e GOOGLE_APPLICATION_CREDENTIALS=/ruta/teamB/serviceAccountKey.json \
  -e FIREBASE_DATABASE_URL=https://team-b-default-rtdb.firebasedatabase.app \
  -e MCP_INSTANCE_DIR=/ruta/teamB/config \
  -- planning-game-mcp
```

Cada instancia mantiene su propio `mcp.user.json` en su `MCP_INSTANCE_DIR`.

#### Receta completa para añadir una instancia nueva

Procedimiento verificado de principio a fin, útil cuando se añade un segundo (o tercer)
Planning Game sobre un proyecto Firebase distinto.

**1. Guardar la clave fuera del repo, en un directorio de secretos**

Convención recomendada: un único directorio con permisos restrictivos para todas las claves,
y un *symlink* desde cada instancia. Así la clave existe una sola vez en disco y nunca puede
colarse en un commit.

```bash
mkdir -p ~/.secrets/firebase && chmod 700 ~/.secrets/firebase
mv ~/Downloads/<proyecto>-firebase-adminsdk-*.json ~/.secrets/firebase/<proyecto>-sa.json
chmod 600 ~/.secrets/firebase/<proyecto>-sa.json

# Symlink desde el directorio de instancia
ln -sf ~/.secrets/firebase/<proyecto>-sa.json <INSTANCE_DIR>/serviceAccountKey.json
```

**2. Averiguar la URL de la RTDB sin entrar en la consola**

La región no se puede adivinar. Se puede consultar con la propia clave, usando la API de
gestión de Realtime Database:

```bash
python3 - <<'EOF'
import json, urllib.request
from google.oauth2 import service_account
import google.auth.transport.requests as gt

KEY = '/ruta/a/serviceAccountKey.json'
c = service_account.Credentials.from_service_account_file(
        KEY, scopes=['https://www.googleapis.com/auth/firebase'])
c.refresh(gt.Request())

pid = json.load(open(KEY))['project_id']
url = f'https://firebasedatabase.googleapis.com/v1beta/projects/{pid}/locations/-/instances'
req = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + c.token})
for i in json.load(urllib.request.urlopen(req)).get('instances', []):
    print(i['type'], i['state'], '->', i['databaseUrl'])
EOF
```

Salida esperada: `DEFAULT_DATABASE ACTIVE -> https://<proyecto>-default-rtdb.<región>.firebasedatabase.app`

> Si la instancia ya tiene un `.env.prod`, la URL suele estar en `PUBLIC_FIREBASE_DATABASE_URL`.

**3. Comprobar el acceso antes de registrar nada**

Merece la pena validar que la clave llega a la base de datos, para no depurar a ciegas después.
Con el Admin SDK las reglas de seguridad no se aplican, así que una lectura correcta confirma
credencial y URL a la vez:

```bash
python3 - <<'EOF'
import json, urllib.request
from google.oauth2 import service_account
import google.auth.transport.requests as gt

KEY = '/ruta/a/serviceAccountKey.json'
DB  = 'https://<proyecto>-default-rtdb.<región>.firebasedatabase.app'
c = service_account.Credentials.from_service_account_file(KEY, scopes=[
        'https://www.googleapis.com/auth/firebase.database',
        'https://www.googleapis.com/auth/userinfo.email'])
c.refresh(gt.Request())
req = urllib.request.Request(DB + '/.json?shallow=true',
                             headers={'Authorization': 'Bearer ' + c.token})
print(json.load(urllib.request.urlopen(req)))
EOF
```

**4. Crear el `mcp.user.json` de la instancia**

Los IDs deben existir ya en esa base de datos (`data/developers`, `data/stakeholders`):

```jsonc
{
  "developerId": "dev_001",
  "stakeholderId": "stk_001",
  "name": "<Nombre Apellido>",
  "email": "<usuario@dominio>"
}
```

**5. Registrar el MCP con un nombre distinto**

El nombre debe ser único: es el prefijo de las herramientas (`mcp__<nombre>__list_projects`).

```bash
INST=/ruta/a/planning-game-instances/<nombre-instancia>

claude mcp add planning-game-<nombre> --scope user \
  -e MCP_INSTANCE_DIR="$INST" \
  -e GOOGLE_APPLICATION_CREDENTIALS="$INST/serviceAccountKey.json" \
  -e FIREBASE_DATABASE_URL="https://<proyecto>-default-rtdb.<región>.firebasedatabase.app" \
  -- planning-game-mcp

claude mcp list | grep planning     # debe mostrar "✔ Connected"
```

> Conviene hacer copia de `~/.claude.json` antes (`cp ~/.claude.json ~/.claude.json.bak`).

**6. ⚠️ Reiniciar Claude Code**

`claude mcp list` puede decir **✔ Connected** y aun así las herramientas
`mcp__planning-game-<nombre>__*` **no estarán disponibles en la sesión que ya está abierta**.
El registro se lee al arrancar: hay que **cerrar y volver a abrir Claude Code** para poder usarlas.

#### Variables de entorno

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `GOOGLE_APPLICATION_CREDENTIALS` | Sí* | Ruta absoluta al `serviceAccountKey.json` |
| `FIREBASE_DATABASE_URL` | No | URL de RTDB (se auto-deriva del service account si no se indica) |
| `MCP_INSTANCE_DIR` | No | Directorio para config por instancia (multi-instancia) |

\* O bien esta variable, o un `serviceAccountKey.json` en el directorio del MCP.

#### Herramientas disponibles (48)

| Categoría | Herramientas |
|-----------|-------------|
| Proyectos | `list_projects`, `get_project`, `update_project`, `create_project`, `discover_project` |
| Cards | `list_cards`, `get_card`, `create_card`, `update_card`, `relate_cards`, `get_transition_rules` |
| Sprints | `list_sprints`, `get_sprint`, `create_sprint`, `update_sprint` |
| Equipo | `list_developers`, `list_stakeholders` |
| ADRs | `list_adrs`, `get_adr`, `create_adr`, `update_adr`, `delete_adr` |
| Planes | `list_plans`, `get_plan`, `create_plan`, `update_plan`, `delete_plan` |
| Proposals | `list_plan_proposals`, `get_plan_proposal`, `create_plan_proposal`, `update_plan_proposal`, `delete_plan_proposal` |
| Config Global | `list_global_config`, `get_global_config`, `create_global_config`, `update_global_config`, `delete_global_config` |
| Versionado Guidelines | `get_guideline_history`, `restore_guideline_version` |
| Diagnóstico | `pg_doctor`, `pg_config` |
| Sistema | `setup_mcp_user`, `get_mcp_status`, `update_mcp`, `publish_mcp_version` |
| Gestión Usuarios | `provision_user`, `delete_user` |
| Sync | `sync_guidelines` |

**Uso**: Claude puede leer/crear/actualizar tarjetas del proyecto desde cualquier directorio.

---

## Configuración Manual (Avanzado)

Los MCPs se configuran en archivos JSON:

### Configuración Global (~/.claude.json)

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "type": "stdio",
      "command": "npx",
      "args": ["chrome-devtools-mcp@latest"]
    },
    "playwright": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    },
    "github": {
      "type": "stdio",
      "command": "docker",
      "args": [
        "run", "-i", "--rm",
        "-e", "GITHUB_PERSONAL_ACCESS_TOKEN",
        "ghcr.io/github/github-mcp-server"
      ],
      "env": {
        "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_xxxxxxxxxxxx"
      }
    }
  }
}
```

### Configuración de Proyecto (.mcp.json)

```json
{
  "mcpServers": {
    "planning-game": {
      "command": "planning-game-mcp",
      "env": {
        "GOOGLE_APPLICATION_CREDENTIALS": "/home/usuario/.config/planning-game/serviceAccountKey.json",
        "FIREBASE_DATABASE_URL": "https://tu-proyecto-default-rtdb.europe-west1.firebasedatabase.app"
      }
    }
  }
}
```

---

## Troubleshooting

### El MCP no aparece en la lista

```bash
# Verificar que está configurado
claude mcp list

# Si usaste --scope project, asegúrate de estar en el directorio del proyecto
cd /path/to/project
claude mcp list
```

### Error "command not found"

El comando del MCP no está disponible. Verifica:
```bash
# Para MCPs basados en npx
npx <paquete>@latest --version

# Para MCPs basados en Docker
docker run --rm <imagen> --help
```

### Error de conexión/timeout

El MCP no puede conectar con el servicio externo:
```bash
# Verificar que Docker está corriendo (para GitHub MCP)
docker ps

# Verificar que Chrome está instalado (para Chrome DevTools)
google-chrome --version
```

### Error de permisos/autenticación

```bash
# Para GitHub MCP: verificar que el token está configurado
echo $GITHUB_PERSONAL_ACCESS_TOKEN

# Para Planning Game MCP: verificar que serviceAccountKey.json existe
ls -la serviceAccountKey.json
```

### Ver logs del MCP

Los MCPs escriben logs en stderr. Para ver errores:
```bash
# Ejecutar el comando del MCP directamente
GOOGLE_APPLICATION_CREDENTIALS=/ruta/serviceAccountKey.json planning-game-mcp 2>&1

# O para Docker-based
docker run -i --rm ghcr.io/github/github-mcp-server 2>&1
```

### Reiniciar MCPs

Si un MCP deja de funcionar:
```bash
# Eliminar y volver a añadir
claude mcp remove <nombre>
claude mcp add <nombre> --scope <user|project> -- <comando>
```

---

## Verificación de Instalación

Después de instalar, verifica que todo funciona:

```bash
# 1. Listar MCPs instalados
claude mcp list

# 2. Iniciar Claude Code
claude

# 3. Preguntar qué herramientas tiene disponibles
# Claude debería listar las herramientas de cada MCP instalado
```

---

## Resumen de Comandos

| Acción | Comando |
|--------|---------|
| Listar MCPs | `claude mcp list` |
| Añadir MCP global | `claude mcp add <nombre> --scope user -- <comando>` |
| Añadir MCP proyecto | `claude mcp add <nombre> --scope project -- <comando>` |
| Eliminar MCP | `claude mcp remove <nombre>` |
| Ver config global | `cat ~/.claude.json` |
| Ver config proyecto | `cat .mcp.json` |

---

## Referencias

- [Documentación oficial de Claude Code](https://docs.anthropic.com/en/docs/claude-code)
- [MCP Workflow para Planning Game](../MCP_WORKFLOW.md)
