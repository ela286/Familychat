# FamilyChat — archivos iniciales

Esta carpeta contiene una primera versión instalable de FamilyChat, basada en tu proyecto Supabase actual.

## Incluye
- `index.html`: interfaz adaptable a móvil y escritorio.
- `styles.css`: diseño oscuro con degradados.
- `app.js`: registro, inicio de sesión, clave de invitación, chats directos, grupos, mensajes en tiempo real y foto de perfil.
- `manifest.webmanifest`, `sw.js`, `icons/icon.svg`: base para instalarla como PWA.
- `supabase.sql`: tablas, clave de invitación y políticas RLS de acceso.

## Antes de publicarla
**No la uses todavía para conversaciones sensibles.** Es una versión inicial que debes probar con cuentas de prueba. Las políticas de privacidad son importantes y deben verificarse en Supabase antes de guardar datos reales. Esta versión no implementa cifrado de extremo a extremo, llamadas de audio/video ni envío de adjuntos dentro de los chats. Tampoco es una app nativa de las tiendas.

## Paso 1 — Configurar Supabase
1. Abre tu proyecto: `https://supabase.com/dashboard/project/yrxtarhmiwxdpexdekpz`.
2. Entra en **SQL Editor** → **New query**.
3. Abre `supabase.sql`, copia todo su contenido, pégalo y pulsa **Run**.
4. Revisa que la ejecución termine sin errores. Si falla, no publiques aún: copia el error y pide ayuda para corregirlo.
5. En **Authentication → URL Configuration**, agrega tu URL de GitHub Pages a **Site URL** y **Redirect URLs**. Ejemplo: `https://TU-USUARIO.github.io/TU-REPOSITORIO/`.
6. Durante las pruebas puedes desactivar la confirmación de correo en Authentication, o dejarla activada y confirmar el email de cada cuenta.

La clave de invitación configurada en SQL es `amoalilli`. Para cambiarla, edita el valor dentro del `digest('amoalilli', 'sha256')` en `supabase.sql` antes de ejecutarlo. Si ya ejecutaste el SQL, cambiar el archivo no cambia la base de datos automáticamente: debes actualizar la fila de configuración desde el SQL Editor.

## Paso 2 — Subir a GitHub Pages
1. Descarga y descomprime `FamilyChat.zip`.
2. Abre tu repositorio de GitHub.
3. Sube los archivos y carpetas que están dentro de la carpeta `FamilyChat` (no subas solo el ZIP).
4. Asegúrate de que `index.html`, `app.js`, `styles.css`, `manifest.webmanifest`, `sw.js`, `supabase.sql` y `icons/` estén en la raíz del repositorio.
5. En **Settings → Pages**, activa GitHub Pages desde la rama principal y la carpeta `/ (root)`.
6. Abre la URL que GitHub muestre. La instalación PWA requiere HTTPS, que GitHub Pages proporciona.

## Paso 3 — Probarlo con dos cuentas
1. Abre la web en dos navegadores o en una ventana normal y otra privada.
2. Crea una cuenta con correo, contraseña, nombre y clave `amoalilli`.
3. Si Supabase pide confirmación, confirma el correo y vuelve a iniciar sesión.
4. Crea una segunda cuenta y valida la misma clave.
5. Desde una cuenta, crea un chat o grupo e intenta enviar mensajes.
6. Comprueba que una cuenta que no pertenece a un chat no puede leer sus mensajes.

## Instalar en el teléfono
- **Android/Chrome:** abre la web publicada, pulsa “Instalar app” si aparece; si no, menú ⋮ → **Instalar aplicación** o **Añadir a pantalla de inicio**.
- **iPhone/Safari:** abre la web, pulsa **Compartir** → **Añadir a pantalla de inicio**.
- El botón de instalación aparece en navegadores compatibles; en iPhone normalmente se utiliza el menú Compartir.

## Limitaciones actuales
- No hay llamadas de voz/video todavía; requieren señalización y WebRTC, además de pruebas con distintos teléfonos y redes.
- Los mensajes son privados mediante las políticas RLS, pero **no están cifrados de extremo a extremo** como WhatsApp.
- El código es una base funcional que necesita pruebas de seguridad antes de utilizarse con datos personales reales.
- La clave compartida es una puerta de invitación, no reemplaza la cuenta individual.
