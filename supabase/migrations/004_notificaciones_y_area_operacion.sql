-- ============================================================
-- F&M Fumigación – Migración 004
-- Notificaciones + operación por área
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- IMPORTANTE: Requiere que las migraciones 002 y 003 ya estén aplicadas.
-- ============================================================

-- 1. Añadir tipo de operación a hotel_areas (nullable, sin romper datos)
ALTER TABLE public.hotel_areas
  ADD COLUMN IF NOT EXISTS operation_type_id UUID REFERENCES public.operation_types(id) ON DELETE SET NULL;

-- 2. Tabla de notificaciones persistentes para administradores
CREATE TABLE IF NOT EXISTS public.notificaciones (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo             TEXT NOT NULL DEFAULT 'confirmacion'
                     CHECK (tipo IN ('confirmacion')),
  -- quién generó la notificación
  empleado_id      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  empleado_nombre  TEXT,
  -- qué servicio se confirmó
  servicio_id      UUID REFERENCES public.area_servicios(id) ON DELETE CASCADE,
  hotel_id         UUID REFERENCES public.hotels(id) ON DELETE CASCADE,
  hotel_nombre     TEXT,
  area_id          UUID REFERENCES public.hotel_areas(id) ON DELETE CASCADE,
  area_nombre      TEXT,
  operacion_nombre TEXT,
  fecha_servicio   DATE,
  -- estado de lectura
  leida            BOOLEAN NOT NULL DEFAULT FALSE,
  leida_en         TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notificaciones_leida_idx    ON public.notificaciones(leida, created_at DESC);
CREATE INDEX IF NOT EXISTS notificaciones_created_idx  ON public.notificaciones(created_at DESC);
CREATE INDEX IF NOT EXISTS notificaciones_servicio_idx ON public.notificaciones(servicio_id);

-- 3. RLS en notificaciones
ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notif_select_admin ON public.notificaciones;
DROP POLICY IF EXISTS notif_insert_admin ON public.notificaciones;
DROP POLICY IF EXISTS notif_update_admin ON public.notificaciones;

CREATE POLICY notif_select_admin ON public.notificaciones
  FOR SELECT TO authenticated USING (public.is_admin());

-- Insert se hace solo desde SECURITY DEFINER (confirmar_y_notificar)
CREATE POLICY notif_insert_admin ON public.notificaciones
  FOR INSERT TO authenticated WITH CHECK (public.is_admin());

CREATE POLICY notif_update_admin ON public.notificaciones
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT SELECT, INSERT, UPDATE ON public.notificaciones TO authenticated;

-- 4. Función transaccional SECURITY DEFINER: confirmar + notificar en una sola TX
--    Permite que el rol 'consulta' confirme y genere notificación sin elevar permisos
--    generales. Los permisos se validan explícitamente dentro de la función.
CREATE OR REPLACE FUNCTION public.confirmar_y_notificar(
  p_area_id  UUID,
  p_fecha    DATE,
  p_nota     TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_perfil    RECORD;
  v_servicio  RECORD;
  v_area      RECORD;
  v_hoy       DATE := CURRENT_DATE;
BEGIN
  -- Validar sesión
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'No autenticado.');
  END IF;

  -- Obtener perfil (fuente de verdad: tabla profiles, NO user_metadata)
  SELECT role, active, name, email
    INTO v_perfil
    FROM public.profiles
   WHERE id = v_uid;

  IF NOT FOUND OR v_perfil.active IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Usuario inactivo o sin perfil.');
  END IF;

  IF v_perfil.role NOT IN ('consulta', 'admin') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Sin permiso para confirmar.');
  END IF;

  -- Validar fecha no futura
  IF p_fecha > v_hoy THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Solo puedes confirmar servicios de hoy o anteriores.');
  END IF;

  -- Leer y bloquear fila para evitar race condition
  SELECT id, area_id, fecha, estado, confirmado_por
    INTO v_servicio
    FROM public.area_servicios
   WHERE area_id = p_area_id AND fecha = p_fecha
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Servicio no encontrado.');
  END IF;

  IF v_servicio.estado <> 'programado' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'El servicio ya fue confirmado o no está programado.');
  END IF;

  -- Actualizar → el trigger proteger_confirmacion_area_servicio rellena confirmado_por/en/nombre
  UPDATE public.area_servicios
     SET estado = 'realizado',
         confirmacion_nota = p_nota
   WHERE id = v_servicio.id
  RETURNING id, area_id, fecha, estado,
            confirmado_por, confirmado_nombre, confirmado_en, confirmacion_nota,
            notas, created_at, updated_at
    INTO v_servicio;

  -- Datos del área / hotel / operación para la notificación
  SELECT ha.nombre        AS area_nombre,
         ha.hotel_id,
         h.name           AS hotel_nombre,
         COALESCE(ot.name, '') AS operacion_nombre
    INTO v_area
    FROM public.hotel_areas ha
    JOIN public.hotels h           ON h.id = ha.hotel_id
    LEFT JOIN public.operation_types ot ON ot.id = ha.operation_type_id
   WHERE ha.id = p_area_id;

  -- Insertar notificación (SECURITY DEFINER permite escribir aunque el usuario sea 'consulta')
  INSERT INTO public.notificaciones (
    tipo, empleado_id, empleado_nombre,
    servicio_id, hotel_id, hotel_nombre,
    area_id, area_nombre, operacion_nombre, fecha_servicio
  ) VALUES (
    'confirmacion',
    v_uid,
    COALESCE(NULLIF(TRIM(COALESCE(v_perfil.name, '')), ''), v_perfil.email, 'Empleado'),
    v_servicio.id,
    v_area.hotel_id,
    v_area.hotel_nombre,
    p_area_id,
    v_area.area_nombre,
    v_area.operacion_nombre,
    p_fecha
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'servicio', row_to_json(v_servicio)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirmar_y_notificar(UUID, DATE, TEXT) TO authenticated;

-- 5. Marcar una notificación como leída (admin)
CREATE OR REPLACE FUNCTION public.marcar_notificacion_leida(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administradores pueden marcar notificaciones.';
  END IF;
  UPDATE public.notificaciones
     SET leida = TRUE, leida_en = NOW()
   WHERE id = p_id AND leida = FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.marcar_notificacion_leida(UUID) TO authenticated;

-- 6. Marcar TODAS las notificaciones como leídas (admin)
CREATE OR REPLACE FUNCTION public.marcar_todas_notificaciones_leidas()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE v_count INT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administradores pueden marcar notificaciones.';
  END IF;
  UPDATE public.notificaciones SET leida = TRUE, leida_en = NOW() WHERE leida = FALSE;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.marcar_todas_notificaciones_leidas() TO authenticated;
