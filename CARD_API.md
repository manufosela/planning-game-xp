# Card API - Creación programática de Tasks y Bugs

Este documento describe cómo crear tasks y bugs programáticamente en Planning GameXP.

## Para Developers: Cómo pedir a la IA que cree cards

### Formato recomendado

Cuando pidas a la IA implementar una feature o reportar un bug, incluye:

```
[Proyecto]: NombreDelProyecto
[Tipo]: task | bug
[Descripción]: Lo que necesitas
```

### Ejemplos de peticiones

**Feature nueva:**
```
En Cinema4D, quiero añadir un botón para exportar bugs a CSV.
Crea la task y luego impleméntala.
```

**Bug:**
```
En Intranet hay un bug: el filtro de fechas no funciona cuando seleccionas "este mes".
Créalo en el sistema y luego corrígelo.
```

**Múltiples tasks:**
```
Para el proyecto Extranet necesito:
1. Añadir paginación a la tabla de usuarios
2. Implementar búsqueda por email
3. Añadir exportación a Excel

Crea las tasks y ve implementándolas una a una.
```

### Proyectos disponibles

| Project ID | Descripción |
|------------|-------------|
| `Cinema4D` | Plugin de Cinema 4D |
| `Intranet` | Aplicación intranet |
| `Extranet` | Portal extranet |
| `PlanningGame` | Esta aplicación |

> **Nota**: Consulta la base de datos para ver la lista completa de proyectos activos.

### Qué hace la IA

1. **Crea la card** en Planning GameXP con título y descripción generados
2. **Implementa** el código solicitado
3. **Informa** el `cardId` generado (ej: `C4D-TSK-0126`)
4. El developer puede luego **asignar sprint, cerrar, etc.** desde la app

---

## Para IAs: Instrucciones técnicas

### Cuándo crear cards

- **SIEMPRE** crea una card antes de implementar una feature o fix si el usuario lo solicita
- Usa `task` para features nuevas, mejoras, refactorizaciones
- Usa `bug` para correcciones de errores

### Endpoint

```
POST https://europe-west1-<your-project-id>.cloudfunctions.net/createCard
```

### Autenticación

Header `x-api-key` con el valor del secret `CREATE_CARD_API_KEY`.

```bash
-H "x-api-key: ${CREATE_CARD_API_KEY}"
```

> **Importante**: La API Key está configurada como secret en Firebase. Pregunta al usuario si no la tienes disponible.

### Campos del request

#### Campos comunes (tasks y bugs)

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `type` | string | ✅ | `"task"` o `"bug"` |
| `projectId` | string | ✅ | ID del proyecto (ej: `"Cinema4D"`, `"Extranet V2"`) |
| `title` | string | ✅ | Título descriptivo de la card |
| `year` | number | ✅ | Año actual (ej: `2026`) |
| `createdBy` | string | ❌ | Email del creador (default: `"api@planning-game.local"`) |

#### Campos para TASKS (formato User Story)

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `role` | string | ✅* | "Como [rol]..." - Quién necesita la funcionalidad |
| `goal` | string | ✅* | "Quiero [objetivo]..." - Qué se necesita |
| `benefit` | string | ✅* | "Para [beneficio]..." - Por qué se necesita |

> *Los campos `role`, `goal`, `benefit` son el formato preferido para tasks. Se convierten automáticamente a `descriptionStructured`.

#### Campos para BUGS (formato User Story)

| Campo | Tipo | Obligatorio | Descripción |
|-------|------|-------------|-------------|
| `role` | string | ✅* | "Como [rol]..." - Quién experimenta el bug |
| `goal` | string | ✅* | "Quiero [comportamiento esperado]..." - Qué debería pasar |
| `benefit` | string | ✅* | "Para [impacto]..." - Por qué es importante |
| `priority` | string | ❌ | `"low"`, `"medium"`, `"high"` (default: `"Not Evaluated"`) |

> *Los campos `role`, `goal`, `benefit` son el formato preferido también para bugs.

> **Nota técnica**: La función añade automáticamente campos internos necesarios (`section`, `group`, `cardType`, `createdAt`, etc.).

### Respuesta exitosa

```json
{
  "success": true,
  "cardId": "C4D-TSK-0125",
  "firebaseId": "-OixUUlpeXVv7AHDdRNG",
  "path": "/cards/Cinema4D/TASKS_Cinema4D/-OixUUlpeXVv7AHDdRNG",
  "type": "task",
  "title": "Título de la tarea"
}
```

### Ejemplos de uso con curl

**Crear una task (formato User Story):**
```bash
curl -X POST https://europe-west1-<your-project-id>.cloudfunctions.net/createCard \
  -H "x-api-key: ${CREATE_CARD_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "task",
    "projectId": "Intranet",
    "title": "Mostrar ortodoncista asignado en ficha paciente",
    "year": 2026,
    "role": "usuario de Intranet",
    "goal": "ver el ortodoncista y agente ATC asignados dentro de la ficha del paciente",
    "benefit": "tener visibilidad completa del caso sin consultar otros sistemas",
    "createdBy": "admin@example.com"
  }'
```

**Crear un bug (formato User Story):**
```bash
curl -X POST https://europe-west1-<your-project-id>.cloudfunctions.net/createCard \
  -H "x-api-key: ${CREATE_CARD_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "bug",
    "projectId": "Extranet V2",
    "title": "Fechas de envíos mal y sin actualizar en casos anteriores",
    "year": 2026,
    "role": "usuario de ATC/comercial",
    "goal": "que las fechas de envío se muestren correctamente actualizadas en casos anteriores a 29/09/2025",
    "benefit": "reducir el alto volumen de llamadas a ATC y comercial por información incorrecta",
    "priority": "high",
    "createdBy": "admin@example.com"
  }'
```

### Flujo de trabajo para IAs

```
1. Usuario pide feature/fix
         ↓
2. Crear card con curl (type: task|bug)
         ↓
3. Informar cardId al usuario
         ↓
4. Implementar el código
         ↓
5. Al terminar, recordar cardId para que el usuario pueda gestionarlo
```

### Generación de títulos y descripciones

- **Título**: Conciso, acción + objeto (ej: "Añadir exportación CSV de bugs")
- **Descripción**: Contexto, comportamiento esperado, detalles técnicos si aplica

### Manejo de errores

| Error | Causa | Solución |
|-------|-------|----------|
| `403 Forbidden` | API Key inválida | Verificar header `x-api-key` |
| `400 Bad Request` | Campos faltantes | Verificar `type`, `projectId`, `title`, `year` |
| `404 Not Found` | Proyecto no existe | Verificar `projectId` en la base de datos |

### Notas importantes

- El `cardId` se genera automáticamente con formato `{ABBR}-{TYPE}-{NUMBER}`
- El campo `createdBy` se establece automáticamente como `"API"`
- El `status` inicial es `"Backlog"` para tasks y `"Open"` para bugs
- Las cards creadas aparecen inmediatamente en Planning GameXP
