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

## `informes-cierre` (opcional: análisis con IA)

Los informes de cierre **funcionan sin esta función**: el PDF se genera en el navegador y se
descarga en el equipo (Admin → Informes o el detalle de la actividad), con los datos y fotos que
registró el técnico. Si despliegas esta función con una clave de IA, el PDF incluye además la
descripción de cada foto, el resumen, recomendaciones y pendientes, y marca para revisión los
informes con evidencia insuficiente o contradicciones. No envía correos.

Requisito previo: `009_informes_cierre.sql` y `010_informes_descarga_local.sql`.

### Secretos (Supabase → Edge Functions → Secrets)

| Variable | Obligatoria | Uso |
|---|---|---|
| `ANTHROPIC_API_KEY` | Sí | Clave de la API de Claude (empieza por `sk-ant-api03-`, de console.anthropic.com). |
| `INFORMES_MODELO_IA` | No | Modelo de Claude. Por defecto `claude-opus-5-5`. |
| `INFORMES_CRON_SECRET` | No | Secreto para la tarea programada de reintentos. |

### Despliegue (CLI; en PowerShell usa `npx.cmd`)

```bash
npx supabase login
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-api03-... --project-ref ichmofgzfywbmhzflevx
npx supabase functions deploy informes-cierre --project-ref ichmofgzfywbmhzflevx
```

Deja activada **Verify JWT**. Comprueba en **Admin → Configuración → Sistema → Comprobar**.

### Reintentos automáticos (opcional)

Con `pg_cron` y `pg_net` activados, en el SQL Editor:

```sql
select cron.schedule('informes-cierre-reintentos', '*/10 * * * *', $$
  select net.http_post(
    url := 'https://ichmofgzfywbmhzflevx.supabase.co/functions/v1/informes-cierre',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer <SUPABASE_ANON_KEY>', 'x-cron-secret', '<INFORMES_CRON_SECRET>'),
    body := '{"accion":"procesar_pendientes"}'::jsonb);
$$);
```

Sin esto, el botón **Analizar pendientes con IA** de Admin → Informes hace lo mismo a mano.
