# Guía de Creación de Tasks

Esta guía explica cómo crear y gestionar tasks de forma efectiva, incluyendo el uso de criterios de aceptación en formato Gherkin y la integración con IA para desarrollo.

---

## 1. Crear una Task

### Campos básicos

| Campo | Descripción |
|-------|-------------|
| **Title** | Título descriptivo y conciso de la tarea |
| **Description** | Descripción detallada del trabajo a realizar |
| **Epic** | Épica a la que pertenece (agrupa funcionalidades relacionadas) |
| **Sprint** | Sprint en el que se planifica |
| **Developer** | Desarrollador asignado |
| **Validator** | Persona que validará la tarea completada |
| **Status** | Estado actual (To Do, In Progress, Done, etc.) |
| **Priority** | Prioridad de la tarea |
| **Business Points** | Puntos de valor de negocio |
| **Dev Points** | Puntos de esfuerzo de desarrollo |

### Buenas prácticas para el título

- Usar formato: **[Verbo] + [Qué] + [Dónde/Contexto]**
- Ejemplos:
  - "Añadir validación de email en formulario de registro"
  - "Corregir cálculo de totales en carrito de compra"
  - "Implementar filtro por fecha en listado de pedidos"

---

## 2. Criterios de Aceptación (Gherkin)

Los criterios de aceptación definen **cuándo la tarea está completa**. Usamos el formato **Gherkin** que es estructurado y verificable.

### Formato Gherkin

```gherkin
Feature: [Nombre de la funcionalidad]

Scenario: [Nombre del escenario]
  Given [contexto inicial / precondiciones]
  When [acción del usuario]
  Then [resultado esperado]
  And [resultado adicional]
```

### Ejemplo completo

```gherkin
Feature: Validación de formulario de registro

Scenario: Email válido permite continuar
  Given el usuario está en el formulario de registro
  When introduce un email con formato válido (ejemplo@dominio.com)
  Then el campo email muestra indicador verde
  And el botón "Siguiente" se habilita

Scenario: Email inválido muestra error
  Given el usuario está en el formulario de registro
  When introduce un email sin @ (ejemplodominio.com)
  Then el campo email muestra indicador rojo
  And aparece mensaje "Formato de email inválido"
  And el botón "Siguiente" permanece deshabilitado

Scenario: Email duplicado muestra advertencia
  Given el usuario está en el formulario de registro
  And existe un usuario con email "usado@dominio.com"
  When introduce "usado@dominio.com"
  Then aparece mensaje "Este email ya está registrado"
```

### Consejos para escribir buenos criterios

1. **Específicos**: Evitar ambigüedades ("funciona correctamente" ❌)
2. **Verificables**: Debe poder probarse con un test
3. **Independientes**: Cada escenario debe poder probarse por separado
4. **Completos**: Cubrir casos positivos, negativos y límite

---

## 3. Generar Criterios de Aceptación con IA

La aplicación incluye un botón para **generar automáticamente** criterios de aceptación usando IA.

### Cómo usar

1. Rellena el **título** y la **descripción** de la task
2. Haz clic en el botón **"Regenerar con IA"** en la sección de Acceptance Criteria
3. La IA analizará el título y descripción para generar escenarios Gherkin
4. **Revisa y ajusta** los criterios generados según sea necesario

### Importante

- La IA genera una **primera versión** que debes revisar
- Añade escenarios adicionales si faltan casos importantes
- Modifica el lenguaje para que sea específico a tu contexto
- Los criterios generados son un punto de partida, no el resultado final

---

## 4. Usar el Botón de IA para Desarrollo

El botón **🤖** en las tasks genera un enlace especial para que una IA externa desarrolle la tarea.

### Cómo funciona

1. **Haz clic en 🤖** en la cabecera de la task
2. Se genera un **enlace único** que se copia automáticamente
3. El enlace:
   - Expira en **15 minutos**
   - Solo puede usarse **1 vez**
   - Contiene toda la información de la task

### Qué incluye el enlace

El enlace devuelve un JSON con:

```json
{
  "branchName": "feature/TASK-ID-descripcion",
  "repository": "git@github.com:org/repo.git",
  "agents": {
    "global": "[Guidelines globales de desarrollo]",
    "project": "[Guidelines específicas del proyecto]"
  },
  "project": {
    "name": "Nombre del proyecto",
    "description": "Descripción",
    "languages": ["javascript", "typescript"],
    "frameworks": ["astro", "lit"]
  },
  "task": {
    "title": "Título de la tarea",
    "description": "Descripción completa",
    "acceptanceCriteria": "Criterios en formato Gherkin",
    "sprint": "SPR-001",
    "epic": "EPC-001"
  }
}
```

### Cómo usar con una IA de desarrollo

1. **Genera el enlace** con el botón 🤖
2. **Pega el enlace** en tu herramienta de IA (Claude, Cursor, etc.)
3. **Indica a la IA** que obtenga el contexto y desarrolle la tarea:

```
Fetch this URL to get the task context and implement it following the guidelines:
https://europe-west1-<your-project-id>.cloudfunctions.net/getIaContext/{token}
```

4. La IA debería:
   - Clonar el repositorio
   - Crear la rama sugerida (`branchName`)
   - Implementar según la descripción
   - Escribir tests para cada criterio de aceptación
   - Crear un Pull Request

### Requisitos

- El proyecto debe tener **IA habilitada** en su configuración
- El proyecto debe tener configurado el **repositorio** (URL SSH o HTTPS)
- La task no debe estar en estado "Done"

---

## 5. Flujo completo recomendado

```
1. CREAR TASK
   └─ Título claro y descriptivo
   └─ Descripción detallada del requisito

2. GENERAR CRITERIOS DE ACEPTACIÓN
   └─ Usar "Regenerar con IA" como punto de partida
   └─ Revisar y ajustar escenarios
   └─ Añadir casos límite y negativos

3. ASIGNAR Y PLANIFICAR
   └─ Asignar developer y validator
   └─ Asignar a sprint y épica
   └─ Estimar puntos

4. DESARROLLAR (manual o con IA)
   └─ Opción A: Desarrollo manual
   └─ Opción B: Generar enlace IA (🤖) y usar con herramienta de IA

5. VALIDAR
   └─ El validator verifica cada criterio de aceptación
   └─ Los tests deben pasar
```

---

## 6. FAQ

### ¿Puedo editar los criterios generados por IA?
Sí, y **deberías hacerlo**. La IA genera una base, pero tú conoces mejor el contexto.

### ¿Qué pasa si el enlace IA expira?
Genera uno nuevo con el botón 🤖. Cada enlace es válido solo 15 minutos.

### ¿Por qué el botón IA está deshabilitado?
Verifica que:
- El proyecto tiene IA habilitada en su configuración
- La task no está en estado "Done"

### ¿Dónde configuro el repositorio del proyecto?
En la **gestión del proyecto** (icono de engranaje), campo "Repositorio (SSH/HTTPS)".

---

*Esta guía está disponible en: `/docs/task-guide.md`*
