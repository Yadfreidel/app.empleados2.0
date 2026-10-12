# Edge Functions de Supabase

## `admin-usuarios`

Crea usuarios, cambia contraseñas y activa/desactiva cuentas desde **Admin → Configuración → Usuarios**.
Usa la API oficial de administración de Supabase Auth. La clave `service_role` la inyecta Supabase
en el servidor y nunca llega al navegador. Antes de cada acción verifica que quien llama sea un
administrador activo.

Requisito previo: haber ejecutado `supabase/migrations/007_configuracion_y_usuarios.sql`.

### Opción A — Desde el panel de Supabase (sin instalar nada)

1. Abre tu proyecto en Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor**.
2. Nombre de la función: `admin-usuarios` (exactamente así).
3. Borra el código de ejemplo y pega el contenido completo de [`admin-usuarios/index.ts`](admin-usuarios/index.ts).
4. Pulsa **Deploy function**.
5. Deja activada la opción **Verify JWT** (viene activada por defecto).
6. En la app: **Admin → Configuración → Sistema → Comprobar**. La fila "Creación y edición de usuarios" debe salir en verde.

### Opción B — Con la CLI de Supabase

```bash
npx supabase login
npx supabase functions deploy admin-usuarios --project-ref ichmofgzfywbmhzflevx
```

### Para actualizarla

Repite el mismo proceso con el código nuevo; Supabase reemplaza la versión anterior.
