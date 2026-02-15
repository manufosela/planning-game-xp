# Config Examples (Canonical)

Este directorio es la fuente canónica de plantillas de configuración.

## Contenido

- `.env.example`: variables de entorno del frontend/app.
- `.env.dev.example`: entorno local con emuladores (recomendado para desarrollo diario).
- `.env.pre.example`: entorno cloud de validación (idealmente proyecto clonado/snapshot).
- `.env.prod.example`: entorno de producción.
- `functions/.env.example`: variables de Cloud Functions (incluye proveedor de email).
- `theme-config.example.json`: ejemplo de branding/tema (incluye `branding.orgName`).
- `serviceAccountKey.example.json`: estructura de service account sin datos reales.
- `manifest.example.json`: ejemplo de `manifest.json` para PWA.

## Uso recomendado

1. Copia los archivos de ejemplo a tu configuración real.
2. Mantén 3 entornos separados: `dev` (emulador), `pre` (cloud de validación), `prod`.
3. Para `pre`, usa un proyecto clonado/snapshot en vez de producción directa.
4. Si usas email en cloud, configura credenciales con secretos de Firebase.
