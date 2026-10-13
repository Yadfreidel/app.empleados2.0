-- ============================================================
-- F&M Fumigación – Migración 014
-- Excelencia del mes (cumplimiento por supervisor y empleado del mes)
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- Requiere: 007 (app_configuracion) y 009/010 (informes). Es repetible y solo
-- agrega objetos y columnas opcionales: no modifica datos existentes.
--
-- Cálculo (por mes y supervisor):
--   cumplimiento = completados y validados / asignados evaluables × 100
--   * Asignado: activities.supervisor_id (el supervisor responsable que
--     registra el administrador). Un operativo tiene un solo responsable, así
--     que nunca se cuenta dos veces. Sin responsable no se atribuye a nadie.
--   * Evaluable: publicado, con fecha dentro del mes y ya vencida (hasta hoy),
--     sin cancelar y sin bloqueo con justificación aprobada.
--   * Completado y validado: estado 'completado' y validado por un
--     administrador (botón Validar) o con su informe de cierre aprobado.
--   * Participa quien tenga al menos el mínimo configurable de evaluables.
--   * Desempate: calidad validada promedio (1–5) solo si todos los empatados la
--     tienen; si persiste, el administrador decide al publicar.
-- ============================================================
BEGIN;

CREATE SCHEMA IF NOT EXISTS empleados_private;
GRANT USAGE ON SCHEMA empleados_private TO authenticated;

-- 1. Datos del operativo para el cálculo ---------------------------------
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS supervisor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS validado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS validado_en TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS calidad_validada SMALLINT CHECK (calidad_validada IS NULL OR calidad_validada BETWEEN 1 AND 5),
  ADD COLUMN IF NOT EXISTS bloqueo_motivo TEXT CHECK (bloqueo_motivo IS NULL OR length(bloqueo_motivo) BETWEEN 5 AND 500),
  ADD COLUMN IF NOT EXISTS bloqueo_aprobado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS bloqueo_aprobado_en TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS activities_supervisor_fecha_idx ON public.activities(supervisor_id, date);

-- El responsable debe ser un supervisor (rol 'consulta') activo.
CREATE OR REPLACE FUNCTION empleados_private.validar_supervisor_actividad()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.supervisor_id IS NOT NULL AND NEW.supervisor_id IS DISTINCT FROM OLD.supervisor_id
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.supervisor_id AND role = 'consulta' AND active IS TRUE) THEN
    RAISE EXCEPTION 'El responsable debe ser un supervisor activo.' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS activities_validar_supervisor ON public.activities;
CREATE TRIGGER activities_validar_supervisor
  BEFORE INSERT OR UPDATE OF supervisor_id ON public.activities
  FOR EACH ROW EXECUTE FUNCTION empleados_private.validar_supervisor_actividad();

-- 2. Mínimo configurable -------------------------------------------------
ALTER TABLE public.app_configuracion
  ADD COLUMN IF NOT EXISTS excelencia_minimo_operativos SMALLINT NOT NULL DEFAULT 5
    CHECK (excelencia_minimo_operativos BETWEEN 1 AND 500);

-- 3. Validación y bloqueo (solo administrador; quedan sellados con quién y cuándo)
CREATE OR REPLACE FUNCTION public.validar_operativo(p_actividad_id UUID, p_validar BOOLEAN, p_calidad INTEGER DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE v_estado TEXT;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Solo un administrador puede validar operativos.');
  END IF;
  IF p_calidad IS NOT NULL AND p_calidad NOT BETWEEN 1 AND 5 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'La calidad debe estar entre 1 y 5.');
  END IF;
  SELECT status INTO v_estado FROM public.activities WHERE id = p_actividad_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'Operativo no encontrado.'); END IF;
  IF p_validar AND v_estado <> 'completado' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Solo se validan operativos completados.');
  END IF;
  UPDATE public.activities SET
    validado_por = CASE WHEN p_validar THEN auth.uid() END,
    validado_en = CASE WHEN p_validar THEN now() END,
    calidad_validada = CASE WHEN p_validar THEN p_calidad END
  WHERE id = p_actividad_id;
  RETURN jsonb_build_object('ok', TRUE);
END;
$$;
REVOKE ALL ON FUNCTION public.validar_operativo(UUID, BOOLEAN, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validar_operativo(UUID, BOOLEAN, INTEGER) TO authenticated;

-- p_motivo NULL o vacío = quitar el bloqueo.
CREATE OR REPLACE FUNCTION public.registrar_bloqueo_operativo(p_actividad_id UUID, p_motivo TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE v_motivo TEXT := NULLIF(btrim(p_motivo), '');
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Solo un administrador puede aprobar bloqueos.');
  END IF;
  IF v_motivo IS NOT NULL AND length(v_motivo) NOT BETWEEN 5 AND 500 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'La justificación debe tener entre 5 y 500 caracteres.');
  END IF;
  UPDATE public.activities SET
    bloqueo_motivo = v_motivo,
    bloqueo_aprobado_por = CASE WHEN v_motivo IS NOT NULL THEN auth.uid() END,
    bloqueo_aprobado_en = CASE WHEN v_motivo IS NOT NULL THEN now() END
  WHERE id = p_actividad_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'Operativo no encontrado.'); END IF;
  RETURN jsonb_build_object('ok', TRUE);
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_bloqueo_operativo(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_bloqueo_operativo(UUID, TEXT) TO authenticated;

-- 4. Clasificación de cada operativo del mes (base de todo el cálculo) ----
CREATE OR REPLACE FUNCTION empleados_private.excelencia_operativos(p_mes DATE)
RETURNS TABLE (
  actividad_id UUID, fecha DATE, titulo TEXT, hotel TEXT, estado TEXT, supervisor_id UUID,
  clasificacion TEXT, evaluable BOOLEAN, cumplido BOOLEAN, calidad SMALLINT, validacion TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH params AS (
    SELECT date_trunc('month', p_mes)::DATE AS ini,
           (date_trunc('month', p_mes) + INTERVAL '1 month')::DATE AS fin,
           (now() AT TIME ZONE 'America/Santo_Domingo')::DATE AS hoy
  ), base AS (
    SELECT a.*, h.name AS hotel_nombre,
           (a.validado_en IS NOT NULL) AS validado_admin,
           EXISTS (SELECT 1 FROM public.informes_cierre i WHERE i.actividad_id = a.id AND i.revisado_en IS NOT NULL) AS informe_aprobado
    FROM public.activities a
    JOIN params p ON a.date >= p.ini AND a.date < p.fin
    LEFT JOIN public.hotels h ON h.id = a.hotel_id
    WHERE a.published IS TRUE
  )
  SELECT b.id, b.date, b.title, b.hotel_nombre, b.status, b.supervisor_id,
    CASE
      WHEN b.supervisor_id IS NULL THEN 'sin_supervisor'
      WHEN b.status = 'cancelado' THEN 'excluido_cancelado'
      WHEN b.bloqueo_aprobado_en IS NOT NULL THEN 'excluido_bloqueo'
      WHEN b.date > (SELECT hoy FROM params) THEN 'aun_no_vence'
      WHEN b.status = 'completado' AND (b.validado_admin OR b.informe_aprobado) THEN 'completado_validado'
      WHEN b.status = 'completado' THEN 'completado_sin_validar'
      ELSE 'no_completado'
    END,
    b.supervisor_id IS NOT NULL AND b.status <> 'cancelado' AND b.bloqueo_aprobado_en IS NULL AND b.date <= (SELECT hoy FROM params),
    b.supervisor_id IS NOT NULL AND b.status <> 'cancelado' AND b.bloqueo_aprobado_en IS NULL AND b.date <= (SELECT hoy FROM params)
      AND b.status = 'completado' AND (b.validado_admin OR b.informe_aprobado),
    CASE WHEN b.validado_admin THEN b.calidad_validada END,
    CASE WHEN b.validado_admin THEN 'administrador' WHEN b.informe_aprobado THEN 'informe aprobado' END
  FROM base b;
$$;
REVOKE ALL ON FUNCTION empleados_private.excelencia_operativos(DATE) FROM PUBLIC, anon, authenticated;

-- 5. Ranking del mes (solo administrador: incluye correos) ---------------
CREATE OR REPLACE FUNCTION empleados_private.excelencia_ranking(p_mes DATE)
RETURNS TABLE (
  posicion INT, supervisor_id UUID, nombre TEXT, email TEXT, asignados INT, completados INT,
  porcentaje NUMERIC, calidad_promedio NUMERIC, participa BOOLEAN, empatado BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH ops AS (
    SELECT * FROM empleados_private.excelencia_operativos(p_mes) WHERE supervisor_id IS NOT NULL
  ), conteo AS (
    SELECT o.supervisor_id,
           count(*) FILTER (WHERE o.evaluable)::INT AS asignados,
           count(*) FILTER (WHERE o.cumplido)::INT AS completados,
           round(avg(o.calidad) FILTER (WHERE o.cumplido AND o.calidad IS NOT NULL), 2) AS calidad_promedio
    FROM ops o GROUP BY o.supervisor_id
  ), minimo AS (
    SELECT COALESCE((SELECT excelencia_minimo_operativos FROM public.app_configuracion WHERE id = 1), 5) AS n
  ), calc AS (
    SELECT c.*,
           CASE WHEN c.asignados > 0 THEN c.completados::NUMERIC / c.asignados END AS razon,
           c.asignados >= (SELECT n FROM minimo) AS participa
    FROM conteo c
  ), desempate AS (
    -- La calidad solo desempata si todos los empatados en porcentaje la tienen.
    SELECT d.*,
           CASE WHEN bool_or(d.calidad_promedio IS NULL) OVER (PARTITION BY d.participa, d.razon) THEN NULL
                ELSE d.calidad_promedio END AS clave2
    FROM calc d
  ), ranking AS (
    SELECT d.*,
           CASE WHEN d.participa THEN rank() OVER (PARTITION BY d.participa ORDER BY d.razon DESC, d.clave2 DESC NULLS LAST) END AS pos,
           count(*) OVER (PARTITION BY d.participa, d.razon, d.clave2) > 1 AS emp
    FROM desempate d
  )
  SELECT r.pos::INT, r.supervisor_id,
         COALESCE(NULLIF(btrim(p.name), ''), p.email), p.email,
         r.asignados, r.completados, round(COALESCE(r.razon, 0) * 100, 1), r.calidad_promedio,
         r.participa, r.participa AND r.emp
  FROM ranking r JOIN public.profiles p ON p.id = r.supervisor_id
  ORDER BY r.participa DESC, r.pos NULLS LAST, r.razon DESC NULLS LAST, 3;
$$;
REVOKE ALL ON FUNCTION empleados_private.excelencia_ranking(DATE) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.excelencia_ranking(p_mes DATE)
RETURNS TABLE (
  posicion INT, supervisor_id UUID, nombre TEXT, email TEXT, asignados INT, completados INT,
  porcentaje NUMERIC, calidad_promedio NUMERIC, participa BOOLEAN, empatado BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede ver la excelencia del mes.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM empleados_private.excelencia_ranking(p_mes);
END;
$$;
REVOKE ALL ON FUNCTION public.excelencia_ranking(DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.excelencia_ranking(DATE) TO authenticated;

-- Detalle del cálculo: operativos de un supervisor (o sin supervisor si p_supervisor es NULL).
CREATE OR REPLACE FUNCTION public.excelencia_detalle(p_mes DATE, p_supervisor UUID)
RETURNS TABLE (
  actividad_id UUID, fecha DATE, titulo TEXT, hotel TEXT, estado TEXT,
  clasificacion TEXT, evaluable BOOLEAN, cumplido BOOLEAN, calidad SMALLINT, validacion TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo un administrador puede ver el detalle.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT o.actividad_id, o.fecha, o.titulo, o.hotel, o.estado, o.clasificacion, o.evaluable, o.cumplido, o.calidad, o.validacion
    FROM empleados_private.excelencia_operativos(p_mes) o
    WHERE o.supervisor_id IS NOT DISTINCT FROM p_supervisor
    ORDER BY o.fecha, o.titulo;
END;
$$;
REVOKE ALL ON FUNCTION public.excelencia_detalle(DATE, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.excelencia_detalle(DATE, UUID) TO authenticated;

-- 6. Empleado del mes ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.empleado_mes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mes               DATE NOT NULL UNIQUE CHECK (mes = date_trunc('month', mes)::DATE),
  supervisor_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  nombre            TEXT NOT NULL,
  foto_path         TEXT NOT NULL,
  mensaje           TEXT NOT NULL CHECK (length(mensaje) BETWEEN 10 AND 500),
  porcentaje        NUMERIC(5, 1) NOT NULL,
  completados       INT NOT NULL,
  asignados         INT NOT NULL,
  desempate_manual  BOOLEAN NOT NULL DEFAULT FALSE,
  foto_autorizada   BOOLEAN NOT NULL CHECK (foto_autorizada),
  estado            TEXT NOT NULL DEFAULT 'publicado' CHECK (estado IN ('publicado', 'retirado', 'sustituido')),
  publicado_por     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  publicado_en      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retirado_por      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  retirado_en       TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Solo un reconocimiento visible a la vez.
CREATE UNIQUE INDEX IF NOT EXISTS empleado_mes_un_publicado ON public.empleado_mes ((TRUE)) WHERE estado = 'publicado';
ALTER TABLE public.empleado_mes ENABLE ROW LEVEL SECURITY;
-- Todos (también sin sesión, como el calendario) ven el publicado; el historial, solo el admin.
-- La tabla no guarda correos.
DROP POLICY IF EXISTS empleado_mes_select ON public.empleado_mes;
CREATE POLICY empleado_mes_select ON public.empleado_mes FOR SELECT TO anon, authenticated
  USING (estado = 'publicado' OR public.is_admin());
GRANT SELECT ON public.empleado_mes TO anon, authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('empleado-mes', 'empleado-mes', TRUE, 3145728, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO NOTHING;
DROP POLICY IF EXISTS empleado_mes_foto_select ON storage.objects;
CREATE POLICY empleado_mes_foto_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'empleado-mes' AND public.is_admin());
DROP POLICY IF EXISTS empleado_mes_foto_insert ON storage.objects;
CREATE POLICY empleado_mes_foto_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'empleado-mes' AND public.is_admin());
DROP POLICY IF EXISTS empleado_mes_foto_delete ON storage.objects;
CREATE POLICY empleado_mes_foto_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'empleado-mes' AND public.is_admin());

-- Publicar: verifica en el servidor que sea el primer puesto del mes.
CREATE OR REPLACE FUNCTION empleados_private.publicar_empleado_mes(
  p_mes DATE, p_supervisor_id UUID, p_mensaje TEXT, p_foto_path TEXT,
  p_foto_autorizada BOOLEAN, p_desempate_manual BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_mes DATE := date_trunc('month', p_mes)::DATE;
  v_mensaje TEXT := btrim(COALESCE(p_mensaje, ''));
  v_fila RECORD;
  v_primeros INT;
  v_id UUID;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Solo un administrador puede publicar el empleado del mes.');
  END IF;
  IF p_foto_autorizada IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Confirma que la persona autorizó publicar su foto.');
  END IF;
  IF length(v_mensaje) NOT BETWEEN 10 AND 500 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'La felicitación debe tener entre 10 y 500 caracteres.');
  END IF;
  IF p_foto_path IS NULL OR NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'empleado-mes' AND name = p_foto_path) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Sube la foto antes de publicar.');
  END IF;

  SELECT * INTO v_fila FROM empleados_private.excelencia_ranking(v_mes) r WHERE r.supervisor_id = p_supervisor_id;
  IF NOT FOUND OR v_fila.participa IS NOT TRUE OR v_fila.posicion IS DISTINCT FROM 1 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Solo se puede publicar a quien ocupa el primer puesto del mes.');
  END IF;
  SELECT count(*) INTO v_primeros FROM empleados_private.excelencia_ranking(v_mes) r WHERE r.posicion = 1;
  IF v_primeros > 1 AND p_desempate_manual IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Hay un empate en el primer puesto: confirma tu decisión de desempate.');
  END IF;

  -- El reconocimiento anterior deja de mostrarse (queda en el historial).
  UPDATE public.empleado_mes SET estado = 'sustituido', updated_at = now()
    WHERE estado = 'publicado' AND mes <> v_mes;

  INSERT INTO public.empleado_mes (
    mes, supervisor_id, nombre, foto_path, mensaje, porcentaje, completados, asignados,
    desempate_manual, foto_autorizada, estado, publicado_por, publicado_en
  ) VALUES (
    v_mes, p_supervisor_id, v_fila.nombre, p_foto_path, v_mensaje, v_fila.porcentaje, v_fila.completados, v_fila.asignados,
    v_primeros > 1, TRUE, 'publicado', auth.uid(), now()
  )
  ON CONFLICT (mes) DO UPDATE SET
    supervisor_id = EXCLUDED.supervisor_id, nombre = EXCLUDED.nombre, foto_path = EXCLUDED.foto_path,
    mensaje = EXCLUDED.mensaje, porcentaje = EXCLUDED.porcentaje, completados = EXCLUDED.completados,
    asignados = EXCLUDED.asignados, desempate_manual = EXCLUDED.desempate_manual, foto_autorizada = TRUE,
    estado = 'publicado', publicado_por = EXCLUDED.publicado_por, publicado_en = now(),
    retirado_por = NULL, retirado_en = NULL, updated_at = now()
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', TRUE, 'id', v_id);
END;
$$;
REVOKE ALL ON FUNCTION empleados_private.publicar_empleado_mes(DATE, UUID, TEXT, TEXT, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION empleados_private.publicar_empleado_mes(DATE, UUID, TEXT, TEXT, BOOLEAN, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.publicar_empleado_mes(
  p_mes DATE, p_supervisor_id UUID, p_mensaje TEXT, p_foto_path TEXT,
  p_foto_autorizada BOOLEAN, p_desempate_manual BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT empleados_private.publicar_empleado_mes(p_mes, p_supervisor_id, p_mensaje, p_foto_path, p_foto_autorizada, p_desempate_manual);
$$;
REVOKE ALL ON FUNCTION public.publicar_empleado_mes(DATE, UUID, TEXT, TEXT, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publicar_empleado_mes(DATE, UUID, TEXT, TEXT, BOOLEAN, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION empleados_private.retirar_empleado_mes(p_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Solo un administrador puede retirar el reconocimiento.');
  END IF;
  UPDATE public.empleado_mes SET estado = 'retirado', retirado_por = auth.uid(), retirado_en = now(), updated_at = now()
    WHERE id = p_id AND estado = 'publicado';
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'No hay un reconocimiento publicado con ese id.'); END IF;
  RETURN jsonb_build_object('ok', TRUE);
END;
$$;
REVOKE ALL ON FUNCTION empleados_private.retirar_empleado_mes(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION empleados_private.retirar_empleado_mes(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.retirar_empleado_mes(p_id UUID)
RETURNS JSONB
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT empleados_private.retirar_empleado_mes(p_id);
$$;
REVOKE ALL ON FUNCTION public.retirar_empleado_mes(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retirar_empleado_mes(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;

SELECT
  to_regclass('public.empleado_mes') IS NOT NULL AS empleado_mes_instalado,
  to_regprocedure('public.excelencia_ranking(date)') IS NOT NULL AS ranking_instalado;
