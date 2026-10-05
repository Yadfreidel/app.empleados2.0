-- Ejecutar este archivo completo en Supabase > SQL Editor > New query.
-- Proyecto de la app: ichmofgzfywbmhzflevx.
-- Requiere las tablas base profiles, activities, hotels y operation_types.
-- Es repetible. No borra actividades ni notificaciones existentes.
BEGIN;

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS confirmado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confirmado_nombre TEXT,
  ADD COLUMN IF NOT EXISTS confirmado_en TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmacion_nota TEXT;

CREATE TABLE IF NOT EXISTS public.notificaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL DEFAULT 'confirmacion' CHECK (tipo IN ('confirmacion')),
  empleado_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  empleado_nombre TEXT,
  actividad_id UUID REFERENCES public.activities(id) ON DELETE CASCADE,
  servicio_id UUID,
  hotel_id UUID REFERENCES public.hotels(id) ON DELETE CASCADE,
  hotel_nombre TEXT,
  area_id UUID,
  area_nombre TEXT,
  operacion_nombre TEXT,
  fecha_servicio DATE,
  leida BOOLEAN NOT NULL DEFAULT FALSE,
  leida_en TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.notificaciones
  ADD COLUMN IF NOT EXISTS actividad_id UUID REFERENCES public.activities(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS notificaciones_actividad_idx ON public.notificaciones(actividad_id);
CREATE INDEX IF NOT EXISTS notificaciones_leida_idx ON public.notificaciones(leida, created_at DESC);
CREATE INDEX IF NOT EXISTS notificaciones_created_idx ON public.notificaciones(created_at DESC);
ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notif_select_admin ON public.notificaciones;
CREATE POLICY notif_select_admin ON public.notificaciones FOR SELECT TO authenticated
  USING (public.is_admin());
DROP POLICY IF EXISTS notif_update_admin ON public.notificaciones;
CREATE POLICY notif_update_admin ON public.notificaciones FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT, UPDATE ON public.notificaciones TO authenticated;

-- Los empleados confirman mediante la función validada, sin abrir permisos
-- generales de UPDATE sobre todas las columnas de activities.
DROP POLICY IF EXISTS act_confirmar_autenticados ON public.activities;

-- El código privilegiado vive fuera del esquema expuesto por la API.
CREATE SCHEMA IF NOT EXISTS empleados_private;
GRANT USAGE ON SCHEMA empleados_private TO authenticated;
CREATE OR REPLACE FUNCTION empleados_private.confirmar_actividad_y_notificar(
  p_actividad_id UUID,
  p_nota TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_perfil public.profiles%ROWTYPE;
  v_actividad public.activities%ROWTYPE;
  v_nombre TEXT;
  v_hotel TEXT;
  v_operacion TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Inicia sesión para confirmar.');
  END IF;
  SELECT * INTO v_perfil FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND OR v_perfil.active IS NOT TRUE OR v_perfil.role NOT IN ('admin', 'consulta') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Tu cuenta no tiene permiso para confirmar.');
  END IF;
  IF length(COALESCE(p_nota, '')) > 500 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Las observaciones no pueden superar 500 caracteres.');
  END IF;

  SELECT * INTO v_actividad FROM public.activities WHERE id = p_actividad_id FOR UPDATE;
  IF NOT FOUND OR (v_perfil.role <> 'admin' AND v_actividad.published IS NOT TRUE) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Actividad no encontrada o no disponible.');
  END IF;
  IF v_actividad.status <> 'programado' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'La actividad ya fue confirmada o no está programada.');
  END IF;

  v_nombre := COALESCE(NULLIF(btrim(v_perfil.name), ''), v_perfil.email, 'Empleado');
  UPDATE public.activities
    SET status = 'completado', confirmado_por = v_uid,
        confirmado_nombre = v_nombre, confirmado_en = now(),
        confirmacion_nota = NULLIF(btrim(p_nota), ''), updated_at = now()
    WHERE id = p_actividad_id
    RETURNING * INTO v_actividad;

  SELECT name INTO v_hotel FROM public.hotels WHERE id = v_actividad.hotel_id;
  SELECT name INTO v_operacion FROM public.operation_types WHERE id = v_actividad.operation_type_id;
  INSERT INTO public.notificaciones (
    tipo, empleado_id, empleado_nombre, actividad_id, hotel_id,
    hotel_nombre, area_nombre, operacion_nombre, fecha_servicio
  ) VALUES (
    'confirmacion', v_uid, v_nombre, v_actividad.id, v_actividad.hotel_id,
    COALESCE(v_hotel, 'Hotel'), v_actividad.title, COALESCE(v_operacion, 'Operación'), v_actividad.date
  );
  RETURN jsonb_build_object('ok', TRUE, 'actividad', to_jsonb(v_actividad));
END;
$$;
REVOKE ALL ON FUNCTION empleados_private.confirmar_actividad_y_notificar(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION empleados_private.confirmar_actividad_y_notificar(UUID, TEXT) TO authenticated;

-- API pública sin privilegios elevados; la función interna verifica la identidad.
CREATE OR REPLACE FUNCTION public.confirmar_actividad_y_notificar(
  p_actividad_id UUID,
  p_nota TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT empleados_private.confirmar_actividad_y_notificar(p_actividad_id, p_nota);
$$;
REVOKE ALL ON FUNCTION public.confirmar_actividad_y_notificar(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirmar_actividad_y_notificar(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.marcar_notificacion_leida(p_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administradores pueden marcar notificaciones.';
  END IF;
  UPDATE public.notificaciones SET leida = TRUE, leida_en = now()
    WHERE id = p_id AND leida = FALSE;
END;
$$;
REVOKE ALL ON FUNCTION public.marcar_notificacion_leida(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_notificacion_leida(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.marcar_todas_notificaciones_leidas()
RETURNS INT
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE v_count INT;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administradores pueden marcar notificaciones.';
  END IF;
  UPDATE public.notificaciones SET leida = TRUE, leida_en = now() WHERE leida = FALSE;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.marcar_todas_notificaciones_leidas() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.marcar_todas_notificaciones_leidas() TO authenticated;

-- Habilitar actualizaciones inmediatas si la publicación Realtime está disponible.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notificaciones'
    ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notificaciones;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Verificación de instalación (no confirma ni modifica actividades).
SELECT
  to_regprocedure('public.confirmar_actividad_y_notificar(uuid,text)') IS NOT NULL AS confirmacion_instalada,
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'notificaciones' AND column_name = 'actividad_id') AS notificaciones_actividades,
  EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notificaciones') AS realtime_habilitado;
