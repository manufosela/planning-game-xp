---
layout: ../../../components/doc/DocLayout.astro
---
# Modos de automatización BecarIA

BecarIA es el agente de IA integrado en el flujo de desarrollo. Su nivel de autonomía se configura **por tarea** en Planning Game, asignando los roles **developer** y **co-developer**.

## Resumen de modos

| developer | co-developer | Modo | Autonomía |
|-----------|-------------|------|-----------|
| Humano | BecarIA | **Asistido** | BecarIA solo revisa PRs |
| BecarIA | Humano o vacío | **Supervisado** | BecarIA implementa, humano aprueba merge |
| BecarIA | BecarIA | **Autónomo** | Implementación y merge automático |

---

## Modo Asistido

**Configuración:** developer = humano, co-developer = BecarIA

```
Humano crea rama y PR
  → BecarIA revisa la PR (AI PR Review)
  → BecarIA publica comentarios con issues detectados
  → Humano (o BecarIA) resuelve los comentarios
  → Se mergea la PR
```

El humano lidera el desarrollo. BecarIA actúa como **reviewer automático**, detectando problemas y sugiriendo mejoras. El developer mantiene el control total sobre el merge.

---

## Modo Supervisado

**Configuración:** developer = BecarIA, co-developer = humano (o sin co-developer)

```
BecarIA recibe tarea asignada en Planning Game
  → Crea rama y PR con la implementación
  → Espera review/comentarios del co-developer humano
  → Resuelve comentarios recibidos
  → Pide confirmación para merge
  → Merge tras aprobación
  → Actualiza tarea en Planning Game → "To Validate"
```

BecarIA lidera el desarrollo pero **requiere supervisión humana** antes del merge. El co-developer revisa y aprueba los cambios.

---

## Modo Autónomo

**Configuración:** developer = BecarIA, co-developer = BecarIA

```
BecarIA recibe tarea asignada en Planning Game
  → Crea rama y PR con la implementación
  → Auto-revisa la PR
  → Resuelve issues detectados
  → Mergea automáticamente
  → Despliega si procede
  → Actualiza tarea en Planning Game → "To Validate"
```

Autonomía total. BecarIA implementa, revisa, mergea y despliega **sin intervención humana**. Solo requiere validación posterior por el validator asignado en Planning Game.

> **Importante:** Incluso en modo autónomo, BecarIA nunca marca tareas como "Done" o "Done&Validated". Siempre las deja en "To Validate" para que un humano valide el resultado.

---

## Configuración en Planning Game

### Activar BecarIA en un proyecto

1. Ve a **Admin > Proyecto**
2. Marca el checkbox **"Permitir que BecarIA tome tareas en este proyecto"** (`useIa`)
3. Configura el campo **Repositorio** (`repoUrl`) con la URL SSH o HTTPS del repo

Al activarlo, BecarIA se añade como developer disponible en el proyecto.

### Asignar modo por tarea

El modo se determina automáticamente por los campos **developer** y **co-developer** de cada tarea:

- Asigna un **humano** como developer y **BecarIA** como co-developer → Modo Asistido
- Asigna **BecarIA** como developer → Modo Supervisado
- Asigna **BecarIA** como developer **y** co-developer → Modo Autónomo

---

## Añadir AI PR Review a un proyecto

Para que BecarIA pueda revisar PRs, el repositorio del proyecto necesita un workflow caller.

### 1. Crear el caller

Crea `.github/workflows/ai-pr-review.yml` en el repo:

```yaml
name: AI Code Review

on:
  pull_request:
    types: [opened, synchronize, labeled]

jobs:
  review:
    if: contains(github.event.pull_request.labels.*.name, 'ai-review')
    uses: your-org/.github/.github/workflows/ai-pr-review.yml@main
    secrets:
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

### 2. Configurar secrets

En el repo de GitHub, ve a **Settings > Secrets and variables > Actions** y añade:

| Secret | Descripción |
|--------|-------------|
| `OPENAI_API_KEY` | API key de OpenAI |

> `GITHUB_TOKEN` se proporciona automáticamente por GitHub Actions.

### 3. Uso

1. Crea una PR normalmente
2. Añade el label **`ai-review`**
3. El workflow publica un comentario con la revisión

> PRs con diffs mayores a 1500 líneas se saltan automáticamente.

---

## Global Configs

Desde Planning Game (**Global Configs**) se gestionan configuraciones que afectan al comportamiento de BecarIA:

- **Agents**: Configuración de agentes IA disponibles
- **Prompts**: Prompts personalizados para revisiones y generación de código
- **Instructions**: Instrucciones adicionales de contexto

El workflow soporta un **prompt personalizado** almacenado en Firebase. Para usarlo, añade el input `prompt_url` en el caller:

```yaml
jobs:
  review:
    uses: your-org/.github/.github/workflows/ai-pr-review.yml@main
    with:
      prompt_url: "https://<your-project-id>-default-rtdb.europe-west1.firebasedatabase.app/globalConfigs/prompts/<ID>.json"
    secrets:
      OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

> **Nota:** El soporte de `prompt_url` como input del workflow reutilizable está pendiente de implementar. Actualmente el prompt está hardcodeado en el workflow.
