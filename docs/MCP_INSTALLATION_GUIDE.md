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

```bash
# 1. Primero, crear un Personal Access Token en:
#    https://github.com/settings/tokens
#    Scopes necesarios: repo, read:org, read:user

# 2. Guardar el token en tu shell config (~/.bashrc o ~/.zshrc):
export GITHUB_PERSONAL_ACCESS_TOKEN="ghp_xxxxxxxxxxxx"

# 3. Recargar shell
source ~/.bashrc  # o ~/.zshrc

# 4. Instalar el MCP (requiere Docker)
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

Permite gestionar tarjetas (tareas, bugs, epics) del Planning Game.

> **Nota:** El servidor MCP está ubicado globalmente en `~/mcp-servers/planning-game/` y es compartido entre todos los proyectos.

```bash
# 1. Obtener credenciales de Firebase
#    Archivo: serviceAccountKey.json
#    Ubicación: Ask your admin for the serviceAccountKey.json location

# 2. Extraer el archivo en ~/mcp-servers/planning-game/
unzip -P <password> serviceAccountKey.zip -d ~/mcp-servers/planning-game/

# 3. Instalar el MCP (global, funciona desde cualquier proyecto)
claude mcp add planning-game --scope user \
  -e GOOGLE_APPLICATION_CREDENTIALS=$HOME/mcp-servers/planning-game/serviceAccountKey.json \
  -e FIREBASE_DATABASE_URL=https://<your-project-id>-default-rtdb.europe-west1.firebasedatabase.app \
  -- node $HOME/mcp-servers/planning-game/index.js
```

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

> **Nota:** El Planning Game MCP ahora usa rutas absolutas ya que está en una ubicación global.

```json
{
  "mcpServers": {
    "planning-game": {
      "command": "node",
      "args": ["/home/usuario/mcp-servers/planning-game/index.js"],
      "env": {
        "GOOGLE_APPLICATION_CREDENTIALS": "/home/usuario/mcp-servers/planning-game/serviceAccountKey.json",
        "FIREBASE_DATABASE_URL": "https://<your-project-id>-default-rtdb.europe-west1.firebasedatabase.app"
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
node ~/mcp-servers/planning-game/index.js 2>&1

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
- [MCP Workflow para Planning Game](./MCP_WORKFLOW.md)
