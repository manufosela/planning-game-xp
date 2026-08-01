# Wizard: Crear una nueva instancia del Planning Game

Este documento es **el guion oficial** que debe seguir cualquier IA (o humano) cuando el usuario dice **"crea una nueva instancia del PG"**. Cubre desde cero hasta un PG desplegado, con SuperAdmin operativo y filtro por dominio opcional.

**Duración estimada**: 45-75 min (la mayoría es esperar a Firebase). Pasos manuales del humano: ~15 min repartidos.

**Última revisión**: 2026-07-12 tras crear la instancia `tribbu` (planning-game-hoop). Todos los baches encontrados están documentados aquí.

---

## Convenciones del wizard

Cada paso está marcado con quién lo ejecuta:

- 🧑 **HUMANO**: solo el humano puede hacerlo (OAuth interactivo, click en consolas, alta administrativa). La IA presenta las instrucciones y espera.
- 🤖 **IA**: la IA lo ejecuta directamente. El humano solo observa.
- 🧑🤖 **AMBOS**: se puede hacer de cualquiera de las dos maneras. La IA propone opciones, el humano elige.

Cuando un paso pueda hacerse de dos formas, la IA **debe presentarlo como pregunta**, no elegir por su cuenta.

---

## Entrada — datos que la IA debe recabar antes de arrancar

Antes de tocar nada, la IA pide al humano los 6 datos siguientes. Presenta la lista completa y espera a tenerlo todo antes de la Fase 1.

1. **Nombre de la instancia local** (kebab-case, ej. `tribbu`, `hoop`, `acme`). Es el directorio bajo `planning-game-instances/`.
2. **Firebase Project ID** (ej. `planning-game-hoop`). El humano lo elige al crear el proyecto en la Console.
3. **Cuenta Firebase / Google que administra el proyecto** (ej. `manufosela@tribbuapp.com`). Es la cuenta con la que se hizo el proyecto en la Console. **Debe estar en `firebase login:list`** — si no está, pedirle que ejecute `firebase login:add`.
4. **Email del SuperAdmin de la nueva instancia** (normalmente la misma que la 3).
5. **Dominio(s) permitido(s)** para el filtro `beforeCreate` (ej. `tribbuapp.com`). Solo si se va a aplicar la Fase 4.
6. **Colores de marca**: primary + secondary (ej. `#FAB5ED` / `#F7F7F7`). Si el humano no los tiene claros, la IA propone la paleta neutra por defecto y se pueden ajustar después editando `theme-config.json`.

---

## Fase 0 — Firebase Project setup (🧑 HUMANO)

**Solo el humano puede hacer esto.** Requiere OAuth interactivo en `console.firebase.google.com`. La IA imprime la checklist y espera confirmación paso a paso.

### 0.1 — Crear el proyecto Firebase

1. https://console.firebase.google.com/ → **Add project**.
2. Nombre: el elegido en la entrada (ej. `Planning Game — Tribbu`). Project ID: el del punto 2 de entrada.
3. Google Analytics: **No** (no lo usamos).
4. **Plan: Blaze** (obligatorio para Cloud Functions e Identity Platform). Vincular billing account.

### 0.2 — Servicios que hay que activar dentro del proyecto

**Todos son gratis dentro del free tier de Blaze en uso normal (< 10 usuarios activos).**

| Servicio | Ruta en Console | Notas |
|---|---|---|
| **Authentication** | Auth → Get started | Sign-in methods: **Google** ON. Añadir `tribbuapp.com` (o el dominio de la instancia) a Authorized domains. |
| **Realtime Database** | Build → Realtime Database → Create | **Región: `europe-west1`** (misma que las otras instancias del PG). Modo: Locked (las reglas las despliega la IA). |
| **Firestore Database** | Build → Firestore Database → Create | Región `eur3 (europe-west)`. Modo Production. |
| **Storage** | Build → Storage → Get started | Modo Production. Región `europe-west1`. ⚠️ **Este paso no se puede saltar — el deploy de storage falla si Storage no está inicializado en la Console.** |
| **Cloud Messaging (FCM)** | No requiere setup, ya está activo. |  |
| **Identity Platform** | https://console.cloud.google.com/customer-identity → Enable | Necesario para blocking functions del filtro por dominio (Fase 4). Migra el Firebase Auth existente sin pérdida. |
| **Secret Manager API** | https://console.developers.google.com/apis/library/secretmanager.googleapis.com → Enable | Necesario para los secrets IA (Fase 2). Sin esto, el deploy de Cloud Functions falla. |
| **Cloud Build API** | https://console.developers.google.com/apis/library/cloudbuild.googleapis.com → Enable | Necesario para desplegar Cloud Functions. Normalmente ya viene enabled al crear el proyecto Blaze, pero verificar. |

### 0.3 — Descargar credenciales

1. ⚙️ **Project settings** → **Service accounts** → **Generate new private key**.
2. Se descarga un JSON (nombre tipo `planning-game-hoop-firebase-adminsdk-fbsvc-xxxxxxxxxx.json`).
3. El humano indica la ruta donde lo dejó (típicamente `~/Descargas/`). La IA lo copiará a `planning-game-instances/<name>/serviceAccountKey.json`.

### 0.4 — Crear Web App y obtener config

1. ⚙️ **Project settings** → **Your apps** → **Add app** → **Web (`</>`)**.
2. Nickname: `<name>-web` (ej. `tribbu-web`).
3. **NO** activar Firebase Hosting aquí (lo configura el `firebase deploy` de la IA).
4. Copiar el bloque `firebaseConfig` completo (`apiKey`, `authDomain`, `databaseURL`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`).

### 0.5 — VAPID key (push notifications web)

1. ⚙️ **Project settings** → pestaña **Cloud Messaging**.
2. Sección **Web Push certificates** → **Generate key pair**.
3. Copiar la clave pública larga (empieza por `B`, ~87 chars).

### 0.6 — Checkpoint

La IA verifica antes de arrancar Fase 1:

```bash
firebase login:list                    # → la cuenta 3 aparece
ls ~/Descargas/*firebase-adminsdk*.json  # → serviceAccountKey descargado
```

Si `firebase login:list` no incluye la cuenta corporativa, la IA pide: `firebase login:add <email>`.

---

## Fase 1 — Scaffolding local (🤖 IA)

**No toca Firebase.** Reversible con `rm -rf planning-game-instances/<name>`. El humano solo observa.

### 1.1 — Crear estructura base

```bash
node scripts/instance-manager.cjs create <name>
```

Genera `planning-game-instances/<name>/` con templates de: `.env.dev`, `.env.pre`, `.env.prod`, `.firebaserc`, `.firebase-account`, `functions/.env`, `database.rules.json`, `storage.rules`.

### 1.2 — Sobreescribir con datos reales

La IA edita los templates con los datos de la entrada:

- **`.firebaserc`** → `projects.default = <projectId>` + target `main = <projectId>-default-rtdb`.
- **`.firebase-account`** → email cuenta corporativa (paso 3 entrada).
- **`.env.prod` y `.env.dev`** → todo el `firebaseConfig` + `PUBLIC_FIREBASE_VAPID_KEY=<vapid>` + `PUBLIC_SUPER_ADMIN_EMAIL=<superadmin>` + `PUBLIC_ORG_NAME=<name>` + `PUBLIC_AUTH_PROVIDER=google`.
- **`mcp.user.json`** (crear nuevo, no existe en el template) → `{ developerId: "dev_001", stakeholderId: "stk_001", name: "...", email: "<superadmin>" }`.
- **`theme-config.json`** (crear nuevo) → primary/secondary + `appName: "Planning Game — <Name>"`.
- **`functions/.env`** → `PUBLIC_SUPER_ADMIN_EMAIL=<superadmin>`, `MS_EMAIL_ENABLED=false`, `DEMO_MODE=false`. ⚠️ **`MS_EMAIL_ENABLED=false` es obligatorio salvo que la instancia use Microsoft Graph** — si falta, el deploy de functions intenta cargar secrets `MS_CLIENT_ID` etc. que no existen y falla.

### 1.3 — Copiar credenciales y reglas

```bash
cp ~/Descargas/<projectId>-firebase-adminsdk-*.json planning-game-instances/<name>/serviceAccountKey.json
chmod 600 planning-game-instances/<name>/serviceAccountKey.json
cp planning-game-instances/manufosela/database.rules.json planning-game-instances/<name>/database.rules.json
cp planning-game-instances/manufosela/storage.rules planning-game-instances/<name>/storage.rules
```

Las reglas de `manufosela` son la referencia canónica (incluyen validación `taskCategory` de PLN-TSK-0354, etc.). NO usar `database.rules.example.json` — está desactualizado.

### 1.4 — Verificar

```bash
node scripts/instance-manager.cjs list      # aparece la instancia nueva
node scripts/instance-manager.cjs verify    # OK sin errores
```

---

## Fase 2 — Deploy real a Firebase (🧑🤖 AMBOS con pasos 🧑 intercalados)

**Aquí toca infra real.** La IA hace el grueso, pero hay 2-4 pausas donde el humano tiene que dar clicks en consolas (dependiendo de qué APIs pre-habilitó en Fase 0).

### 2.1 — Cambiar contexto local (🤖)

```bash
firebase login:use <cuenta-corporativa>
node scripts/instance-manager.cjs use <name>
firebase target:apply database main <projectId>-default-rtdb --project <projectId>
```

### 2.2 — Build production (🤖)

```bash
FORCE_BUILD=1 npm run build:core
```

⚠️ **Puede fallar por `security-check`.** Si aparece "Build bloqueada: CRITICAL/HIGH vulnerabilidades", ejecutar `npm audit --json | jq -r '.vulnerabilities | to_entries[] | select(.value.severity == "critical" or .value.severity == "high") | "\(.value.severity)\t\(.key)"'` para identificar las nuevas.

Si son transitivas ya conocidas: añadirlas a `.audit-allowlist.json` (junto a las existentes) con nota de la fecha y contexto. **NO commitear la allowlist en este PR** — se hace por separado con card de mantenimiento después.

### 2.3 — Crear secrets Cloud Functions (🤖 tras 🧑 activar Secret Manager)

**Prerequisito 🧑:** el humano ya activó Secret Manager API en Fase 0.2. Si no, ahora es el momento.

Los 3 secrets IA son requeridos siempre (el código los define incondicionalmente). La IA crea versiones dummy para desactivar IA en la nueva instancia:

```bash
echo -n "false" | firebase functions:secrets:set IA_GLOBAL_ENABLE --data-file - --project <projectId> --account <cuenta>
echo -n "not-configured-in-<name>" | firebase functions:secrets:set IA_API_KEY --data-file - --project <projectId> --account <cuenta>
openssl rand -hex 32 | tr -d '\n' | firebase functions:secrets:set CREATE_CARD_API_KEY --data-file - --project <projectId> --account <cuenta>
```

Si el cliente quiere IA activa desde el arranque, pedir al humano las claves reales y ponerlas en vez de los dummy.

### 2.4 — Deploy (🤖)

```bash
firebase deploy --only hosting,functions,database:main,storage --project <projectId> --account <cuenta>
```

**Errores comunes y cómo resolverlos:**

| Error | Causa | Fix |
|---|---|---|
| `Firebase Storage has not been set up` | Storage no inicializado en Console. | 🧑 Ir a Console → Storage → Get Started (región europe-west1). Reintentar deploy. |
| `Secret Manager API has not been used` | API no habilitada. | 🧑 Activar en Fase 0.2. Reintentar. |
| `Failed to verify the project has the correct IAM bindings` | Faltan 3 roles al service account de Cloud Functions. | 🤖 Ejecutar los 3 `gcloud projects add-iam-policy-binding` que imprime el error (roles `iam.serviceAccountTokenCreator`, `run.invoker`, `eventarc.eventReceiver`). Si gcloud da 401, 🧑 debe hacer `gcloud auth login <cuenta> --update-adc` primero. |
| `HTTP Error: 503, service is currently unavailable` en algunas functions | Race condition de la primera creación en europe-west1. | 🤖 Reintentar `firebase deploy --only functions` — normalmente el segundo intento crea las que fallaron. |

### 2.5 — Verificar hosting live (🤖)

```bash
curl -sSI https://<projectId>.web.app/    # → HTTP/2 200
```

Si sale 404: el hosting no subió los archivos. Volver a lanzar `firebase deploy --only hosting`.

---

## Fase 3 — Bootstrap datos (🤖 IA)

La BD RTDB está vacía. La IA usa `serviceAccountKey.json` para sembrar los mínimos para que el SuperAdmin pueda entrar y trabajar. Script Node one-liner con `firebase-admin`.

Semillas mínimas:

- `/data/developers/dev_001` = `{ name, email: <superadmin>, active: true }`
- `/data/stakeholders/stk_001` = idem
- `/data/appAdmins/<encodedEmail>` = `true` (encodedEmail = email con `.` `#` `$` `[` `]` reemplazados por `_`)
- `/data/allowedUsers/<encodedEmail>` = `true`
- `/users/<encodedEmail>` = `{ name, email, developerId: 'dev_001', stakeholderId: 'stk_001', createdAt, createdBy }`

Al hacer login por primera vez, las Cloud Functions se encargan del resto automáticamente:

- `createOrUpdateUser` — registra al user en `/users` si no existe.
- `syncAppAdminClaim` — propaga `isAppAdmin=true` como custom claim (porque el encodedEmail ya está en `/data/appAdmins`). Desde 1.192.1 este trigger también fuerza `allowed=true`, lo que desbloquea la lectura de `/projects` para el SuperAdmin recién bootstrapeado (fix PLN-BUG-0111).
- `syncUserAllowedClaim` — sincroniza `allowed=true` cuando el user tiene proyectos O es appAdmin.

**Nota histórica**: antes de 1.192.1 había que setear `allowed=true` manualmente vía `admin.auth().setCustomUserClaims(uid, {allowed: true, isAppAdmin: true})` como paso extra en esta fase, porque `syncUserAllowedClaim` solo miraba proyectos y el SuperAdmin recién creado no tenía ninguno. Ese paso ya NO es necesario — el trigger lo hace solo. Si por alguna razón el user recién registrado ve "Error al cargar los proyectos", el workaround es forzar refresh del token (logout + login) para que el nuevo claim se propague al cliente.

---

## Fase 4 — Filtro por dominio (🤖 IA)

**Hardening: rechaza el registro en Firebase Auth cuando el email no pertenece al dominio autorizado. Aplica a TODOS los métodos (Google OAuth, email/password, etc.).**

**Prerequisito 🧑**: Identity Platform activado en Fase 0.2 (obligatorio para blocking functions). Sin GCIP habilitado, el deploy de la función `beforeCreate` falla con `OPERATION_NOT_ALLOWED : Blocking Functions may only be configured for GCIP projects`.

**El registro del trigger es condicional** en el código (`functions/index.js`): solo si `PUBLIC_ALLOWED_EMAIL_DOMAINS` está definida en el `.env` de la instancia, el export `beforeCreate` existe en el bundle. Instancias sin la variable NO despliegan la función, así que no necesitan GCIP.

Desde 1.192.x el código ya trae el trigger `beforeUserCreated` implementado (`functions/handlers/before-user-created.js` + exports.beforeCreate en `functions/index.js`). Activarlo para una instancia se reduce a **una línea en el `.env`**:

```bash
# En planning-game-instances/<name>/functions/.env
PUBLIC_ALLOWED_EMAIL_DOMAINS=tribbuapp.com
```

Múltiples dominios se separan por comas: `PUBLIC_ALLOWED_EMAIL_DOMAINS=acme.io,acme.com`. Sin la variable (o vacía) → sin restricción (comportamiento legacy).

**Bypass automático para bootstrap**: cualquier email ya presente en `/data/allowedUsers/<encodedEmail>` o `/data/appAdmins/<encodedEmail>` se acepta aunque su dominio no coincida. Esto permite que la Fase 3 (bootstrap del SuperAdmin) funcione aunque el SuperAdmin sea de otro dominio.

Redeploy solo functions después de tocar el `.env`:

```bash
firebase deploy --only functions --project <projectId> --account <cuenta>
```

Tests unitarios: `tests/functions/before-user-created.test.js` (13/13). Cubre allow/reject por dominio, bypass por pre-autorización, RTDB caída (fail-closed), case-insensitive, multi-dominio.

---

## Fase 5 — Restaurar entorno local (🤖)

Después del deploy la IA restaura el env del desarrollador:

```bash
firebase login:use <cuenta-anterior>              # típicamente mjfosela@gmail.com
node scripts/instance-manager.cjs use manufosela  # o la instancia anterior
```

---

## Fase 6 — Verificación end-to-end (🧑)

El humano hace login por primera vez en `https://<projectId>.web.app` y confirma:

- [ ] Login con `<superadmin>` funciona (Google OAuth).
- [ ] Se ve en el header como admin.
- [ ] Puede crear un proyecto de prueba.
- [ ] Puede crear una task en ese proyecto.

Si /projects muestra "Error al cargar los proyectos" en una instancia vacía, es [PLN-BUG-0111](https://planning-game-xp.web.app/?projectId=PlanningGame&cardId=PLN-BUG-0111) (pendiente). Workaround: crea el primer proyecto vía MCP o admin SDK.

---

## Post-instancia: tareas de mantenimiento

Cosas que la IA debe abrir como cards en el PG (proyecto PlanningGame de la instancia principal) al terminar:

1. **PR con `.audit-allowlist.json` actualizado** si se añadieron vulns nuevas en Fase 2.2. Card de mantenimiento con las vulnerabilidades específicas.
2. **Fase 4 (filtro dominio)** si no se hizo en el mismo golpe.
3. **Bumps de IA reales** si el cliente eventualmente quiere IA activa (reemplazar los secrets dummy de Fase 2.3).

---

## Anatomía de una instancia (referencia)

```
planning-game-instances/<name>/
├── .env.dev           # firebase config para dev (mismo o emulator)
├── .env.pre           # firebase config para pre
├── .env.prod          # firebase config para prod
├── .firebase-account  # email cuenta Firebase CLI
├── .firebaserc        # projectId + database targets
├── database.rules.json # RTDB security rules (copia de manufosela)
├── storage.rules      # Cloud Storage rules
├── theme-config.json  # branding (colores, appName, logo)
├── mcp.user.json      # config MCP local: developerId, stakeholderId, name, email
├── serviceAccountKey.json  # ⚠️ 0600, gitignored
├── functions/
│   └── .env           # SUPER_ADMIN_EMAIL, MS_EMAIL_ENABLED=false, DEMO_MODE=false
└── emulator-data/     # snapshots del emulator local (opcional)
```

Todo `planning-game-instances/*` está en `.gitignore`. Ninguno de estos archivos va a git.

---

## Referencias

- `scripts/instance-manager.cjs` — CRUD de instancias locales.
- `scripts/build-all.sh` / `scripts/deploy-all.sh` — build y deploy multi-instancia.
- `functions/index.js` — Cloud Functions comunes a todas las instancias.
- `database.rules.json` (raíz, symlink a la instancia activa) — reglas RTDB actuales.
- Backlog automatización total del wizard: épica PLN-PCS-0020, tasks PLN-TSK-0347 a 0353.
