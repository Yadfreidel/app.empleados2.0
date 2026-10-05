-- ============================================================
-- F&M Fumigación – Migración 005
-- Confirmación de actividades generales + auditoría
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- 1. Añadir columnas de auditoría a activities
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS confirmado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confirmado_nombre TEXT,
  ADD COLUMN IF NOT EXISTS confirmado_en TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmacion_nota TEXT;

-- 2. Asegurar que notificaciones soporte actividad_id
ALTER TABLE public.notificaciones
  ADD COLUMN IF NOT EXISTS actividad_id UUID REFERENCES public.activities(id) ON DELETE CASCADE;

-- 3. Permitir que usuarios autenticados confirmen actividades
DROP POLICY IF EXISTS act_confirmar_autenticados ON public.activities;
CREATE POLICY act_confirmar_autenticados ON public.activities
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (true);

-- 4. Función RPC transaccional: confirmar actividad y notificar al admin
CREATE OR REPLACE FUNCTION public.confirmar_actividad_y_notificar(
  p_actividad_id UUID,
  p_nota         TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid       UUID := auth.uid();
  v_perfil    RECORD;
  v_actividad RECORD;
  v_hotel     RECORD;
  v_op        RECORD;
  v_nombre    TEXT;
BEGIN
  -- Validar actividad existente
  SELECT id, hotel_id, operation_type_id, title, date, status, notes
    INTO v_actividad
    FROM public.activities
   WHERE id = p_actividad_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Actividad no encontrada.');
  END IF;

  IF v_actividad.status = 'completado' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'La actividad ya fue confirmada como completada.');
  END IF;

  -- Resolver nombre del empleado
  IF v_uid IS NOT NULL THEN
    SELECT name, email INTO v_perfil FROM public.profiles WHERE id = v_uid;
    v_nombre := COALESCE(NULLIF(TRIM(COALESCE(v_perfil.name, '')), ''), v_perfil.email, 'Empleado');
  ELSE
    v_nombre := 'Empleado';
  END IF;

  -- Actualizar actividad
  UPDATE public.activities
     SET status = 'completado',
         confirmado_por = v_uid,
         confirmado_nombre = v_nombre,
         confirmado_en = NOW(),
         confirmacion_nota = p_nota,
         updated_at = NOW()
   WHERE id = p_actividad_id
  RETURNING * INTO v_actividad;

  -- Obtener nombres para la notificación
  SELECT name INTO v_hotel FROM public.hotels WHERE id = v_actividad.hotel_id;
  SELECT name INTO v_op FROM public.operation_types WHERE id = v_actividad.operation_type_id;

  -- Insertar notificación
  INSERT INTO public.notificaciones (
    tipo, empleado_id, empleado_nombre,
    actividad_id, hotel_id, hotel_nombre,
    area_nombre, operacion_nombre, fecha_servicio
  ) VALUES (
    'confirmacion',
    v_uid,
    v_nombre,
    p_actividad_id,
    v_actividad.hotel_id,
    COALESCE(v_hotel.name, 'Hotel'),
    v_actividad.title,
    COALESCE(v_op.name, 'Operación'),
    v_actividad.date
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'actividad', row_to_json(v_actividad)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirmar_actividad_y_notificar(UUID, TEXT) TO authenticated, anon;
