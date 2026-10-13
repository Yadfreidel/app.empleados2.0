-- ============================================================
-- F&M Fumigación – Migración 008
-- Confirmaciones sin conexión: idempotencia y detección de conflictos
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- Requiere: schema.sql y 20261005165015_actividad_notificaciones_admin.sql
-- Es repetible y solo agrega objetos: no modifica ni borra datos existentes.
--
-- Propósito
--   Un técnico puede confirmar una actividad sin internet; el teléfono la
--   envía más tarde y puede reintentar varias veces (cortes de red, respuestas
--   perdidas). Esta migración garantiza que:
--   1. Cada confirmación lleva un identificador único generado en el teléfono.
--      Si llega dos veces, la segunda no vuelve a confirmar ni a notificar.
--   2. La actividad y la notificación al administrador se guardan juntas en
--      una sola transacción (igual que la confirmación actual).
--   3. Si la actividad cambió mientras el técnico estaba sin conexión
--      (modificada, cancelada, confirmada por otro o despublicada), no se
--      sobrescribe: se devuelve el conflicto para que el técnico decida.
-- ============================================================
BEGIN;

CREATE SCHEMA IF NOT EXISTS empleados_private;
GRANT USAGE ON SCHEMA empleados_private TO authenticated;

-- 1. Registro de confirmaciones recibidas (clave de idempotencia) ---------
CREATE TABLE IF NOT EXISTS public.confirmaciones_offline (
  id                   UUID PRIMARY KEY,
  actividad_id         UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  usuario_id           UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  creada_en_dispositivo TIMESTAMPTZ,
  recibida_en          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS confirmaciones_offline_actividad_idx ON public.confirmaciones_offline(actividad_id);
ALTER TABLE public.confirmaciones_offline ENABLE ROW LEVEL SECURITY;

-- Cada usuario ve solo las suyas; el administrador, todas. Nadie escribe
-- directamente: solo la función de confirmación.
DROP POLICY IF EXISTS confirmaciones_offline_select ON public.confirmaciones_offline;
CREATE POLICY confirmaciones_offline_select ON public.confirmaciones_offline FOR SELECT TO authenticated
  USING (usuario_id = auth.uid() OR public.is_admin());
GRANT SELECT ON public.confirmaciones_offline TO authenticated;

-- 2. Mantener updated_at al día (necesario para detectar modificaciones) --
-- schema.sql ya crea este trigger; solo se agrega si falta.
CREATE OR REPLACE FUNCTION empleados_private.tocar_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE t.tgrelid = 'public.activities'::regclass
      AND NOT t.tgisinternal
      AND p.proname IN ('set_updated_at', 'tocar_updated_at')
  ) THEN
    CREATE TRIGGER activities_tocar_updated_at
      BEFORE UPDATE ON public.activities
      FOR EACH ROW EXECUTE FUNCTION empleados_private.tocar_updated_at();
  END IF;
END;
$$;

-- 3. Confirmación idempotente con detección de conflictos -----------------
CREATE OR REPLACE FUNCTION empleados_private.confirmar_actividad_offline(
  p_confirmacion_id UUID,
  p_actividad_id UUID,
  p_nota TEXT DEFAULT NULL,
  p_version_esperada TIMESTAMPTZ DEFAULT NULL,
  p_forzar BOOLEAN DEFAULT FALSE,
  p_creada_en_dispositivo TIMESTAMPTZ DEFAULT NULL
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
  v_previa public.confirmaciones_offline%ROWTYPE;
  v_nombre TEXT;
  v_hotel TEXT;
  v_operacion TEXT;
  v_conflicto TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'codigo', 'sin_sesion', 'error', 'Inicia sesión para sincronizar.');
  END IF;
  SELECT * INTO v_perfil FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND OR v_perfil.active IS NOT TRUE OR v_perfil.role NOT IN ('admin', 'consulta') THEN
    RETURN jsonb_build_object('ok', FALSE, 'codigo', 'sin_permiso', 'error', 'Tu cuenta no tiene permiso para confirmar.');
  END IF;
  IF p_confirmacion_id IS NULL OR p_actividad_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'codigo', 'invalida', 'error', 'Confirmación incompleta.');
  END IF;
  IF length(COALESCE(p_nota, '')) > 500 THEN
    RETURN jsonb_build_object('ok', FALSE, 'codigo', 'invalida', 'error', 'Las observaciones no pueden superar 500 caracteres.');
  END IF;

  -- El bloqueo de la fila serializa reintentos simultáneos de la misma confirmación.
  SELECT * INTO v_actividad FROM public.activities WHERE id = p_actividad_id FOR UPDATE;

  -- Reintento de una confirmación ya guardada: se responde igual, sin repetir nada.
  SELECT * INTO v_previa FROM public.confirmaciones_offline WHERE id = p_confirmacion_id;
  IF FOUND THEN
    IF v_previa.usuario_id <> v_uid OR v_previa.actividad_id <> p_actividad_id THEN
      RETURN jsonb_build_object('ok', FALSE, 'codigo', 'invalida', 'error', 'Identificador de confirmación no válido.');
    END IF;
    RETURN jsonb_build_object('ok', TRUE, 'duplicado', TRUE, 'actividad', to_jsonb(v_actividad));
  END IF;

  IF v_actividad.id IS NULL OR (v_perfil.role <> 'admin' AND v_actividad.published IS NOT TRUE) THEN
    v_conflicto := 'no_disponible';
  ELSIF v_actividad.status = 'completado' THEN
    v_conflicto := 'ya_confirmada';
  ELSIF v_actividad.status = 'cancelado' THEN
    v_conflicto := 'cancelada';
  ELSIF v_actividad.status <> 'programado' THEN
    v_conflicto := 'estado_cambiado';
  ELSIF p_version_esperada IS NOT NULL AND v_actividad.updated_at IS DISTINCT FROM p_version_esperada AND NOT p_forzar THEN
    v_conflicto := 'modificada';
  END IF;

  IF v_conflicto IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'codigo', 'conflicto',
      'conflicto', v_conflicto,
      'actividad', CASE WHEN v_conflicto = 'no_disponible' THEN NULL ELSE to_jsonb(v_actividad) END
    );
  END IF;

  v_nombre := COALESCE(NULLIF(btrim(v_perfil.name), ''), v_perfil.email, 'Empleado');
  UPDATE public.activities
    SET status = 'completado', confirmado_por = v_uid,
        confirmado_nombre = v_nombre, confirmado_en = now(),
        confirmacion_nota = NULLIF(btrim(p_nota), ''), updated_at = now()
    WHERE id = p_actividad_id
    RETURNING * INTO v_actividad;

  INSERT INTO public.confirmaciones_offline (id, actividad_id, usuario_id, creada_en_dispositivo)
  VALUES (p_confirmacion_id, p_actividad_id, v_uid, p_creada_en_dispositivo);

  -- La notificación se crea en la misma transacción, después de guardar la
  -- confirmación, y una sola vez gracias a la clave anterior.
  SELECT name INTO v_hotel FROM public.hotels WHERE id = v_actividad.hotel_id;
  SELECT name INTO v_operacion FROM public.operation_types WHERE id = v_actividad.operation_type_id;
  INSERT INTO public.notificaciones (
    tipo, empleado_id, empleado_nombre, actividad_id, hotel_id,
    hotel_nombre, area_nombre, operacion_nombre, fecha_servicio
  ) VALUES (
    'confirmacion', v_uid, v_nombre, v_actividad.id, v_actividad.hotel_id,
    COALESCE(v_hotel, 'Hotel'), v_actividad.title, COALESCE(v_operacion, 'Operación'), v_actividad.date
  );

  RETURN jsonb_build_object('ok', TRUE, 'duplicado', FALSE, 'actividad', to_jsonb(v_actividad));
END;
$$;
REVOKE ALL ON FUNCTION empleados_private.confirmar_actividad_offline(UUID, UUID, TEXT, TIMESTAMPTZ, BOOLEAN, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION empleados_private.confirmar_actividad_offline(UUID, UUID, TEXT, TIMESTAMPTZ, BOOLEAN, TIMESTAMPTZ) TO authenticated;

-- API pública sin privilegios elevados; la función interna verifica la identidad.
CREATE OR REPLACE FUNCTION public.confirmar_actividad_offline(
  p_confirmacion_id UUID,
  p_actividad_id UUID,
  p_nota TEXT DEFAULT NULL,
  p_version_esperada TIMESTAMPTZ DEFAULT NULL,
  p_forzar BOOLEAN DEFAULT FALSE,
  p_creada_en_dispositivo TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT empleados_private.confirmar_actividad_offline(
    p_confirmacion_id, p_actividad_id, p_nota, p_version_esperada, p_forzar, p_creada_en_dispositivo
  );
$$;
REVOKE ALL ON FUNCTION public.confirmar_actividad_offline(UUID, UUID, TEXT, TIMESTAMPTZ, BOOLEAN, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirmar_actividad_offline(UUID, UUID, TEXT, TIMESTAMPTZ, BOOLEAN, TIMESTAMPTZ) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Verificación de instalación (no modifica datos).
SELECT
  to_regclass('public.confirmaciones_offline') IS NOT NULL AS tabla_idempotencia,
  to_regprocedure('public.confirmar_actividad_offline(uuid,uuid,text,timestamptz,boolean,timestamptz)') IS NOT NULL AS confirmacion_offline_instalada;
