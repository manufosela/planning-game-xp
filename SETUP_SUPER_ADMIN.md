# Configuración del Super Admin

## 🔒 Seguridad implementada

Se ha implementado un sistema de seguridad de 3 capas para la sección Development:

### Capa 1: Variable de entorno (Cliente - UX)
- Archivo: `.env.dev`, `.env.pre`, `.env.pro`
- Variable: `PUBLIC_SUPER_ADMIN_EMAIL=admin@example.com`
- Propósito: Ocultar enlace en menú de navegación

### Capa 2: Validación cliente (JavaScript)
- Archivo: `src/pages/development.astro`
- Valida contra Firebase antes de mostrar contenido
- Redirige automáticamente si no es super admin

### Capa 3: Firebase Security Rules (Servidor - REAL)
- Archivo: `database.rules.json`
- Protege nodo `/data/superAdminEmails`
- Solo el super admin puede modificar la lista

## 📋 Pasos para activar la seguridad

### 1. Inicializar super admin en Firebase Database

Necesitas añadir tu email a Firebase Realtime Database manualmente:

**Opción A: Usar Firebase Console**
1. Abre [Firebase Console](https://console.firebase.google.com/)
2. Selecciona el proyecto `<your-project-id>`
3. Ve a **Realtime Database**
4. Navega a `/data/superAdminEmails`
5. Añade un nuevo hijo:
   - **Clave**: `admin_example_com` (email con caracteres especiales reemplazados)
   - **Valor**: `true`

**Opción B: Usar script de inicialización**

Ejecuta este código desde la consola del navegador **después de iniciar sesión**:

```javascript
// Copiar y pegar en la consola del navegador
(async function() {
  const { database, ref, set } = await import('/firebase-config.js');
  const email = 'admin@example.com';
  const encodedEmail = email.replace(/\./g, '_').replace(/#/g, '_').replace(/\$/g, '_').replace(/\[/g, '_').replace(/]/g, '_');

  try {
    await set(ref(database, `/data/superAdminEmails/${encodedEmail}`), true);
    console.log('✅ Super admin inicializado correctamente:', email);
    console.log('🔄 Recarga la página para aplicar cambios');
  } catch (error) {
    console.error('❌ Error al inicializar super admin:', error);
    console.log('⚠️ Asegúrate de haber desplegado las reglas de Firebase primero');
  }
})();
```

### 2. Desplegar las nuevas Firebase Security Rules

```bash
# Desplegar solo las reglas (no hosting ni functions)
npm run deploy:rules

# O desplegar todo
firebase deploy --only database
```

### 3. Verificar que funciona

1. Inicia sesión con tu usuario (`admin@example.com`)
2. Abre la consola del navegador
3. Deberías ver:
   ```
   🔑 Super Admin access granted from environment variable: admin@example.com
   ```
   O si usas Firebase:
   ```
   🔑 Super Admin access granted from Firebase: admin@example.com
   ```

4. Cierra sesión e inicia con otro usuario
5. Deberías ver:
   ```
   ⛔ Access denied to Development page. Redirecting to dashboard...
   ```

## 🔐 Estructura de Firebase

```
/data
  /superAdminEmails
    /admin_example_com: true
```

## ⚠️ Importante

- **NUNCA** compartas las credenciales del super admin
- El email está en el código JavaScript (visible pero ofuscado)
- La **verdadera seguridad** está en las Firebase Security Rules
- Solo tú puedes modificar la lista de super admins en Firebase

## 🛠️ Para añadir más super admins en el futuro

1. Solo el super admin actual puede añadir nuevos super admins
2. Ejecuta desde la consola (siendo super admin):

```javascript
(async function() {
  const { database, ref, set } = await import('/firebase-config.js');
  const newSuperAdminEmail = 'newadmin@example.com'; // Cambiar aquí
  const encodedEmail = newSuperAdminEmail.replace(/\./g, '_').replace(/#/g, '_').replace(/\$/g, '_').replace(/\[/g, '_').replace(/]/g, '_');

  await set(ref(database, `/data/superAdminEmails/${encodedEmail}`), true);
  console.log('✅ Nuevo super admin añadido:', newSuperAdminEmail);
})();
```

## 🧪 Testing

Para probar que funciona correctamente:

1. **Como super admin** (`admin@example.com`):
   - ✅ Ves el enlace "Development" en el menú
   - ✅ Puedes acceder a `/development/`
   - ✅ Puedes modificar `/data/superAdminEmails`

2. **Como usuario normal**:
   - ❌ No ves el enlace "Development"
   - ❌ Si intentas acceder directamente a `/development/`, te redirige
   - ❌ No puedes leer ni modificar `/data/superAdminEmails`
