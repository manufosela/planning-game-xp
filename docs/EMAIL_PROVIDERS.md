# Email Providers

Planning Game XP soporta estos proveedores para notificaciones por email:

- `msgraph`
- `smtp`
- `sendgrid`
- `none` (solo push + logs de metadatos)

## Variables

Revisa `config-examples/functions/.env.example` para todas las variables.

## Selección de proveedor

Usa `EMAIL_PROVIDER`:

- `EMAIL_PROVIDER=msgraph`
- `EMAIL_PROVIDER=smtp`
- `EMAIL_PROVIDER=sendgrid`
- `EMAIL_PROVIDER=none`

Si no se define `EMAIL_PROVIDER`:

- Si existe `MS_CLIENT_ID`, se usa `msgraph` por compatibilidad.
- Si no existe, se usa `none`.

## Recomendación de seguridad

- Usa secretos para credenciales sensibles.
- Evita guardar API keys o passwords en repositorios.
- En `none`, no se registra el contenido del email, solo metadatos.
