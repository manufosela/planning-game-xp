# Firebase Deploy - Multi-instancia

Guia para desplegar a las distintas instancias de Firebase del Planning Game.

## REGLA CRITICA: Cuentas y proyectos

El CLI de Firebase tiene multiples cuentas logadas. Cada proyecto Firebase requiere una cuenta especifica.

**SIEMPRE usar `--project` y `--account` explicitamente en cada comando.**

| Instancia | Project ID | Account | Project Number |
|-----------|-----------|---------|----------------|
| **Personal (manufosela)** | `planning-game-xp` | *(ver nota)* | 755162173855 |
| **Geniova (congelado)** | `planning-gamexp` | *(ver nota)* | 868883195229 |

> **Cuentas reales**: no se publican en este repositorio. La cuenta de cada instancia está en su
> fichero `.firebase-account` (dentro de `planning-game-instances/<instancia>/`, ignorado por git).
> Para ver las cuentas disponibles en tu CLI: `firebase login:list`.
>
> ```bash
> ACCOUNT=$(cat planning-game-instances/<instancia>/.firebase-account)
> firebase deploy --project <project-id> --account "$ACCOUNT"
> ```

> **ATENCION**: `planning-game-xp` (con guion) y `planning-gamexp` (sin guion) son proyectos DISTINTOS.
> Confundirlos puede sobreescribir reglas de seguridad de un proyecto con las del otro.

## Verificar cuenta activa

```bash
firebase login:list
```

Si falta alguna cuenta:
```bash
firebase login:add
```

Si el CLI no ve un proyecto (error "Failed to get details"):
```bash
firebase login --reauth
```

## Deploy de Database Rules

### Personal (manufosela)

Las reglas estan en: `planning-game-instances/manufosela/database.rules.json`

Como el `firebase.json` de la raiz usa **targets**, hay que hacer swap temporal:

```bash
cd /ruta/planning-game-xp

# 1. Backup reglas Geniova
cp database.rules.json database.rules.json.bak

# 2. Copiar reglas personales
cp planning-game-instances/manufosela/database.rules.json database.rules.json

# 3. Configurar target (solo la primera vez)
firebase target:apply database main planning-game-xp-default-rtdb \
  --project planning-game-xp --account "$ACCOUNT"   # cuenta personal — ver .firebase-account

# 4. Deploy
firebase deploy --only database:main \
  --project planning-game-xp \
  --account "$ACCOUNT"   # cuenta personal — ver .firebase-account

# 5. Restaurar reglas Geniova
cp database.rules.json.bak database.rules.json
rm database.rules.json.bak
```

### Geniova

Las reglas estan en la raiz: `database.rules.json`

```bash
cd /ruta/planning-game-xp

# 1. Configurar target (solo la primera vez)
firebase target:apply database main planning-gamexp-default-rtdb \
  --project planning-gamexp --account "$ACCOUNT"   # cuenta corporativa — ver .firebase-account

# 2. Deploy
firebase deploy --only database:main \
  --project planning-gamexp \
  --account "$ACCOUNT"   # cuenta corporativa — ver .firebase-account
```

## Deploy de Hosting

### Personal

```bash
firebase deploy --only hosting \
  --project planning-game-xp \
  --account "$ACCOUNT"   # cuenta personal — ver .firebase-account
```

### Geniova

```bash
firebase deploy --only hosting \
  --project planning-gamexp \
  --account "$ACCOUNT"   # cuenta corporativa — ver .firebase-account
```

## Deploy de Functions

### Personal

```bash
firebase deploy --only functions \
  --project planning-game-xp \
  --account "$ACCOUNT"   # cuenta personal — ver .firebase-account
```

### Geniova

```bash
firebase deploy --only functions \
  --project planning-gamexp \
  --account "$ACCOUNT"   # cuenta corporativa — ver .firebase-account
```

## Targets configurados en .firebaserc

El `.firebaserc` de la raiz contiene targets para ambos proyectos:

```json
{
  "targets": {
    "planning-gamexp": {
      "database": {
        "main": ["planning-gamexp-default-rtdb"],
        "tests": ["planning-gamexp-tests-rtdb"]
      }
    },
    "planning-game-xp": {
      "database": {
        "main": ["planning-game-xp-default-rtdb"]
      }
    }
  }
}
```

## Checklist de seguridad antes de deploy

- [ ] Verificar que `--project` es el correcto para la instancia destino
- [ ] Verificar que `--account` corresponde al proyecto
- [ ] Si son database rules: verificar que `database.rules.json` contiene las reglas correctas para ESA instancia
- [ ] Revisar el output del deploy: confirmar que el nombre de la RTDB es el esperado
- [ ] NUNCA hacer `firebase deploy` sin `--project` y `--account`

## Errores comunes

| Error | Causa | Solucion |
|-------|-------|----------|
| "Failed to get details for project" | Token expirado o cuenta incorrecta | `firebase login --reauth` o cambiar `--account` |
| "Deploy target main not configured" | Falta target para ese project | `firebase target:apply database main <rtdb-name> --project X --account Y` |
| Reglas de Geniova en proyecto personal (o viceversa) | Deploy sin `--project` o con proyecto equivocado | Verificar SIEMPRE `--project` y `--account` |
