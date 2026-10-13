# F&M Fumigación — Sistema de Gestión Operativa

Calendario operativo digital para F&M Fumigación. Permite al administrador registrar actividades y al personal consultar trabajos programados en cada hotel.

## Stack

| Tecnología | Versión | Uso |
|---|---|---|
| Next.js | 16 | Framework (App Router) |
| TypeScript | 5+ | Tipado estático |
| Tailwind CSS | 4 | Estilos |
| Supabase | latest | DB + Auth + RLS |
| date-fns | latest | Manejo de fechas |
| Zod | latest | Validación de datos |
| lucide-react | latest | Íconos |

## Comandos

```bash
# Instalar dependencias
npm install

# Desarrollo local
npm run dev

# Verificar tipos TypeScript
npm run typecheck  # o: npx tsc --noEmit

# Linting
npm run lint

# Build de producción
npm run build
```

## Configuración

1. Copia `.env.local.example` como `.env.local`
2. Completa `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Ejecuta `npm run dev`

## Estructura de carpetas

```
app.empleados/
├── app/
│   ├── (public)/         # Rutas públicas
│   ├── (admin)/          # Panel administrador (protegido)
│   ├── (auth)/           # Login
│   ├── layout.tsx        # Root layout
│   └── page.tsx          # Página principal (calendario)
├── components/
│   ├── ui/               # Button, Badge, Modal, Skeleton, EmptyState
│   ├── calendar/         # CalendarGrid, ActivityCard, DayPanel, Filters, Legend
│   └── layout/           # Header, Logo
├── lib/
│   ├── supabase/         # client.ts, server.ts, middleware.ts
│   ├── validations/      # Schemas Zod
│   └── utils/            # Helpers, tokens de color/status
├── types/                # Tipos TypeScript globales
├── proxy.ts               # Protección de rutas /admin (antes middleware.ts)
├── supabase/
│   └── schema.sql        # Esquema completo DDL + RLS + Triggers + Datos semilla
└── .env.local.example    # Plantilla de variables de entorno
```

## Configuración y Puesta en Marcha con Supabase

1. Crea tu proyecto en [Supabase](https://supabase.com).
2. Ve a **SQL Editor** en tu panel de Supabase y ejecuta:
   - [`supabase/schema.sql`](supabase/schema.sql) (esquema base)
   - [`supabase/migrations/002_calendario_por_areas.sql`](supabase/migrations/002_calendario_por_areas.sql) (tablas de áreas y servicios por área)
   - [`supabase/migrations/003_confirmacion_area_servicios.sql`](supabase/migrations/003_confirmacion_area_servicios.sql) (auditoría de confirmación de servicios)
   - [`supabase/migrations/004_notificaciones_y_area_operacion.sql`](supabase/migrations/004_notificaciones_y_area_operacion.sql) (notificaciones en tiempo real y RPC atómico de confirmación)
   - [`supabase/migrations/005_confirmacion_actividades_generales.sql`](supabase/migrations/005_confirmacion_actividades_generales.sql) (confirmación de actividades generales)
   - [`supabase/migrations/20261005165015_actividad_notificaciones_admin.sql`](supabase/migrations/20261005165015_actividad_notificaciones_admin.sql) (confirmación segura de actividades con notificación al administrador)
   - [`supabase/migrations/006_chat_actividades.sql`](supabase/migrations/006_chat_actividades.sql) (chat por actividad con fotos y PDFs; bucket privado `actividad-adjuntos`)
   - [`supabase/migrations/007_configuracion_y_usuarios.sql`](supabase/migrations/007_configuracion_y_usuarios.sql) (Configuración del panel admin y listado de usuarios)
   - [`supabase/migrations/008_sincronizacion_offline.sql`](supabase/migrations/008_sincronizacion_offline.sql) (confirmaciones sin conexión: idempotencia y conflictos)
   - [`supabase/migrations/009_informes_cierre.sql`](supabase/migrations/009_informes_cierre.sql) (informes de cierre de operativos)
   - [`supabase/migrations/010_informes_descarga_local.sql`](supabase/migrations/010_informes_descarga_local.sql) (PDF descargable en el equipo y revisión del supervisor, sin correo)
   - [`supabase/migrations/011_cierre_simplificado.sql`](supabase/migrations/011_cierre_simplificado.sql) (cierre con descripción + 2 fotos)
   - [`supabase/migrations/012_cierre_por_voz.sql`](supabase/migrations/012_cierre_por_voz.sql) (dictar reporte: dictados, productos/recomendaciones/pendientes)
   - [`supabase/migrations/013_logo_hoteles.sql`](supabase/migrations/013_logo_hoteles.sql) (logotipo de cada hotel)
   - [`supabase/migrations/014_excelencia_del_mes.sql`](supabase/migrations/014_excelencia_del_mes.sql) (excelencia del mes y empleado del mes)
   - [`supabase/migrations/015_foto_perfil.sql`](supabase/migrations/015_foto_perfil.sql) (foto de perfil de administradores y supervisores)
   - Opcional: Edge Function `informes-cierre` para el análisis con IA: ver [`supabase/functions/README.md`](supabase/functions/README.md)
   - Despliega la Edge Function `admin-usuarios` para crear y editar usuarios desde el panel: ver [`supabase/functions/README.md`](supabase/functions/README.md)
3. Copia el archivo `.env.local.example` a `.env.local`:
   ```bash
   cp .env.local.example .env.local
   ```
4. Completa `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` en `.env.local`.
5. Crea el primer administrador: en **Authentication > Users** crea tu usuario y ejecuta [`supabase/admin_setup.sql`](supabase/admin_setup.sql) (opción B) para darle rol `admin`. Los demás usuarios (supervisores y administradores) se crean desde **Admin → Configuración → Usuarios**.
6. Recomendado: en **Authentication > Sign In / Providers** desactiva **Allow new users to sign up**.

## Despliegue en Vercel

La app necesita servidor (Server Actions, `proxy.ts` y rutas dinámicas), por eso se publica en Vercel y no en GitHub Pages.

1. En [vercel.com](https://vercel.com) → **Add New… → Project** → importa este repositorio de GitHub.
2. Framework: **Next.js** (se detecta solo). No cambies los comandos de build.
3. En **Environment Variables** agrega `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` (los mismos valores de `.env.local`).
4. Pulsa **Deploy**. Cada `git push` a `main` vuelve a desplegar automáticamente.
5. En Supabase → **Authentication → URL Configuration**, pon la URL de Vercel (`https://….vercel.app`) como **Site URL**.

## Nuevas Funcionalidades Implementadas

1. **Calendario por Áreas**:
   - Vista por matriz mensual organizada por áreas operativas en filas y días en columnas.
   - Filtros de hotel, área, mes/año y estado (Pendiente, Realizado, Todos).
   - Actualización en tiempo real vía Supabase Realtime.

2. **Importación Excel (.xlsx)**:
   - Carga de planillas Excel con áreas en filas y marcas `X` en columnas de días.
   - Selector de hotel, mes y año con detección del número de días reales del mes.
   - **Vista previa** interactiva antes de guardar, con desglose de áreas a crear y servicios a programar.
   - Detección de duplicados y protección de servicios ya confirmados/realizados.

3. **Confirmación de Realización**:
   - Empleados y administradores autenticados pueden marcar actividades como realizadas.
   - Registro automático en base de datos del usuario que confirmó (`confirmado_por`) y marca temporal exacta (`confirmado_en`).
   - Bloqueo de re-confirmación para preservar la auditoría.

4. **Notificaciones al Administrador**:
   - Campana de notificaciones en la barra de navegación del Header y del panel Admin con conteo de no leídas en tiempo real.
   - Detalle completo: nombre del empleado, hotel, área, fecha y estado.
   - Acciones para marcar individualmente o todas como leídas.

5. **Chat por actividad** (migración 006): mensajes, fotos (cámara o galería, comprimidas para datos móviles) y PDFs en tiempo real desde el panel de confirmación; bandeja **Admin → Chats** con no leídos.

6. **Configuración** (migración 007 + Edge Function `admin-usuarios`): alta y edición de usuarios, datos de la empresa, foto obligatoria al confirmar y estado del sistema.

7. **Calendario por áreas en PDF**: importación desde PDF exportado de Excel (con vista previa) y exportación a PDF con resumen mensual y detalle día por día.

## Estado del Proyecto

| Módulo / Fase | Estado | Descripción |
|---|---|---|
| Auditoría & Core | ✅ Completado | Tipos TypeScript, Zod validations, Next.js 16 (Turbopack) |
| Base de Datos Supabase | ✅ Completado | Schema DDL, RLS policies, trigger auth, migraciones 002, 003 y 004 |
| Calendario General y por Áreas | ✅ Completado | Vista por días y vista matricial por áreas con filtros y Realtime |
| Importador Excel (.xlsx) | ✅ Completado | Modal admin con parsing seguro, preview y guardado no destructivo |
| Confirmación de Servicios | ✅ Completado | RPC atómico transaccional con auditoría de empleado y timestamp |
| Notificaciones en Tiempo Real | ✅ Completado | Hook `useNotificaciones`, Realtime listener y componente `NotificacionesCampana` |
| Build de Producción | ✅ Verificado | `npm run build` compila al 100% sin errores de tipos |

## Dictar reporte (cierre por voz)

En el cierre de servicio, **Dictar reporte** graba un audio (grabar, detener, escuchar, eliminar,
volver a grabar), lo envía a `POST /api/dictado`, lo transcribe y separa área, hallazgos, trabajo
realizado, productos, recomendaciones y pendientes. Los datos se pasan al formulario para que el
técnico los revise y marque «Revisé y confirmo»; el servicio solo se cierra con el botón de cierre
(mismas validaciones y fotos obligatorias). Lo no mencionado queda vacío.

- Requiere la migración `012_cierre_por_voz.sql` y **https** (el micrófono no funciona por `http://IP`).
- Variables (solo servidor, en Vercel → Settings → Environment Variables): ver `.env.local.example`.
  Obligatoria `TRANSCRIPCION_API_KEY`; recomendada `ANTHROPIC_API_KEY` para separar los campos.
- Límites: formatos de audio comunes (webm, ogg, mp4/m4a, mp3, wav, aac), 4 MB y 180 s por defecto.
- El audio se procesa en memoria y no se guarda, salvo `DICTADO_CONSERVAR_AUDIO=true`.
- Cada grabación tiene un id: si se reenvía, no se transcribe ni se cobra dos veces.
