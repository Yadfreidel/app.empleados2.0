# F&M Fumigación — Sistema de Gestión Operativa

Calendario operativo digital para F&M Fumigación. Permite al administrador registrar actividades y al personal consultar trabajos programados en cada hotel.

## Stack

| Tecnología | Versión | Uso |
|---|---|---|
| Next.js | 14+ | Framework (App Router) |
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
├── middleware.ts          # Protección de rutas /admin
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
3. Copia el archivo `.env.local.example` a `.env.local`:
   ```bash
   cp .env.local.example .env.local
   ```
4. Completa `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` en `.env.local`.
5. En **Authentication > Users** de Supabase, crea los usuarios y asígnales rol `'admin'` o `'employee'` en la tabla `profiles`.

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

