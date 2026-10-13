-- ============================================================
-- F&M Fumigación – Migración 012
-- Cierre de servicio por voz ("Dictar reporte")
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- Requiere: 009, 010 y 011. Es repetible y solo agrega objetos y columnas
-- opcionales: no modifica ni borra datos existentes.
--
-- 1. dictados_cierre: resultado de cada dictado (transcripción y campos
--    extraídos). El id lo genera el teléfono por grabación: si se reenvía,
--    el servidor devuelve el mismo resultado sin volver a transcribir.
--    El audio NO se guarda, salvo que se active DICTADO_CONSERVAR_AUDIO.
-- 2. informes_cierre: columnas opcionales productos, recomendaciones,
--    pendientes y dictado_id (datos confirmados por el técnico).
-- 3. cerrar_operativo_con_informe_v2: mismo cierre que la 011 (mismas
--    validaciones y fotos obligatorias) más los campos nuevos, todo en una
--    transacción.
-- 4. Bucket privado 'dictados-audio' (solo se usa si se conserva el audio).
-- ============================================================
BEGIN;

CREATE SCHEMA IF NOT EXISTS empleados_private;
GRANT USAGE ON SCHEMA empleados_private TO authenticated;

-- 1. Dictados -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dictados_cierre (
  id             UUID PRIMARY KEY,
  actividad_id   UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  usuario_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE DEFAULT auth.uid(),
  transcripcion  TEXT NOT NULL CHECK (length(transcripcion) <= 20000),
  campos         JSONB NOT NULL DEFAULT '{}'::JSONB,
  duracion_seg   NUMERIC(6, 1),
  proveedor      TEXT,
  modelo         TEXT,
  audio_path     TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS dictados_cierre_actividad_idx ON public.dictados_cierre(actividad_id, created_at DESC);
ALTER TABLE public.dictados_cierre ENABLE ROW LEVEL SECURITY;

-- Mismos permisos que el chat de la actividad: el autor (con acceso a la
-- actividad) y el administrador.
DROP POLICY IF EXISTS dictados_select ON public.dictados_cierre;
CREATE POLICY dictados_select ON public.dictados_cierre FOR SELECT TO authenticated
  USING (usuario_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS dictados_insert ON public.dictados_cierre;
CREATE POLICY dictados_insert ON public.dictados_cierre FOR INSERT TO authenticated
  WITH CHECK (usuario_id = auth.uid() AND empleados_private.puede_usar_chat(actividad_id));
DROP POLICY IF EXISTS dictados_delete_admin ON public.dictados_cierre;
CREATE POLICY dictados_delete_admin ON public.dictados_cierre FOR DELETE TO authenticated
  USING (public.is_admin());
GRANT SELECT, INSERT, DELETE ON public.dictados_cierre TO authenticated;

-- 2. Campos nuevos del informe (opcionales) -------------------------------
ALTER TABLE public.informes_cierre
  ADD COLUMN IF NOT EXISTS productos TEXT CHECK (productos IS NULL OR length(productos) <= 1000),
  ADD COLUMN IF NOT EXISTS recomendaciones TEXT CHECK (recomendaciones IS NULL OR length(recomendaciones) <= 3000),
  ADD COLUMN IF NOT EXISTS pendientes TEXT CHECK (pendientes IS NULL OR length(pendientes) <= 3000),
  ADD COLUMN IF NOT EXISTS dictado_id UUID REFERENCES public.dictados_cierre(id) ON DELETE SET NULL;

-- 3. Cierre con los campos nuevos -----------------------------------------
CREATE OR REPLACE FUNCTION empleados_private.cerrar_operativo_con_informe_v2(
  p_informe_id UUID,
  p_actividad_id UUID,
  p_area TEXT,
  p_servicio TEXT,
  p_hallazgos TEXT,
  p_acciones TEXT,
  p_resultado TEXT,
  p_observaciones TEXT,
  p_fotos JSONB,
  p_productos TEXT DEFAULT NULL,
  p_recomendaciones TEXT DEFAULT NULL,
  p_pendientes TEXT DEFAULT NULL,
  p_dictado_id UUID DEFAULT NULL,
  p_version_esperada TIMESTAMPTZ DEFAULT NULL,
  p_forzar BOOLEAN DEFAULT FALSE,
  p_creado_en_dispositivo TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_productos TEXT := NULLIF(btrim(p_productos), '');
  v_recomendaciones TEXT := NULLIF(btrim(p_recomendaciones), '');
  v_pendientes TEXT := NULLIF(btrim(p_pendientes), '');
  v_dictado UUID;
  r JSONB;
BEGIN
  IF length(COALESCE(v_productos, '')) > 1000 OR length(COALESCE(v_recomendaciones, '')) > 3000 OR length(COALESCE(v_pendientes, '')) > 3000 THEN
    RETURN jsonb_build_object('ok', FALSE, 'codigo', 'invalida', 'error', 'Productos, recomendaciones o pendientes son demasiado largos.');
  END IF;
  -- Solo se vincula un dictado del mismo técnico y de la misma actividad.
  SELECT id INTO v_dictado FROM public.dictados_cierre
    WHERE id = p_dictado_id AND usuario_id = auth.uid() AND actividad_id = p_actividad_id;

  -- Mismas validaciones, fotos obligatorias, idempotencia y conflictos que el cierre actual.
  r := empleados_private.cerrar_operativo_con_informe(
    p_informe_id, p_actividad_id, p_area, p_servicio, p_hallazgos, p_acciones, p_resultado,
    p_observaciones, p_fotos, p_version_esperada, p_forzar, p_creado_en_dispositivo
  );
  IF (r->>'ok')::BOOLEAN IS TRUE AND (r->>'duplicado')::BOOLEAN IS NOT TRUE THEN
    UPDATE public.informes_cierre
      SET productos = v_productos, recomendaciones = v_recomendaciones,
          pendientes = v_pendientes, dictado_id = v_dictado
      WHERE id = p_informe_id;
  END IF;
  RETURN r;
END;
$$;
REVOKE ALL ON FUNCTION empleados_private.cerrar_operativo_con_informe_v2(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, UUID, TIMESTAMPTZ, BOOLEAN, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION empleados_private.cerrar_operativo_con_informe_v2(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, UUID, TIMESTAMPTZ, BOOLEAN, TIMESTAMPTZ) TO authenticated;

CREATE OR REPLACE FUNCTION public.cerrar_operativo_con_informe_v2(
  p_informe_id UUID,
  p_actividad_id UUID,
  p_area TEXT,
  p_servicio TEXT,
  p_hallazgos TEXT,
  p_acciones TEXT,
  p_resultado TEXT,
  p_observaciones TEXT,
  p_fotos JSONB,
  p_productos TEXT DEFAULT NULL,
  p_recomendaciones TEXT DEFAULT NULL,
  p_pendientes TEXT DEFAULT NULL,
  p_dictado_id UUID DEFAULT NULL,
  p_version_esperada TIMESTAMPTZ DEFAULT NULL,
  p_forzar BOOLEAN DEFAULT FALSE,
  p_creado_en_dispositivo TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT empleados_private.cerrar_operativo_con_informe_v2(
    p_informe_id, p_actividad_id, p_area, p_servicio, p_hallazgos, p_acciones, p_resultado,
    p_observaciones, p_fotos, p_productos, p_recomendaciones, p_pendientes, p_dictado_id,
    p_version_esperada, p_forzar, p_creado_en_dispositivo
  );
$$;
REVOKE ALL ON FUNCTION public.cerrar_operativo_con_informe_v2(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, UUID, TIMESTAMPTZ, BOOLEAN, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cerrar_operativo_con_informe_v2(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TEXT, TEXT, TEXT, UUID, TIMESTAMPTZ, BOOLEAN, TIMESTAMPTZ) TO authenticated;

-- 4. Audio (solo si DICTADO_CONSERVAR_AUDIO=true). Ruta: '<usuario_id>/<dictado_id>.<ext>'
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('dictados-audio', 'dictados-audio', FALSE, 10485760,
  ARRAY['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/aac', 'audio/x-m4a'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS dictados_audio_insert ON storage.objects;
CREATE POLICY dictados_audio_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'dictados-audio' AND split_part(name, '/', 1) = auth.uid()::TEXT);
DROP POLICY IF EXISTS dictados_audio_select ON storage.objects;
CREATE POLICY dictados_audio_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'dictados-audio' AND (split_part(name, '/', 1) = auth.uid()::TEXT OR public.is_admin()));
DROP POLICY IF EXISTS dictados_audio_delete ON storage.objects;
CREATE POLICY dictados_audio_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'dictados-audio' AND public.is_admin());

NOTIFY pgrst, 'reload schema';
COMMIT;

SELECT
  to_regclass('public.dictados_cierre') IS NOT NULL AS dictados_instalados,
  to_regprocedure('public.cerrar_operativo_con_informe_v2(uuid,uuid,text,text,text,text,text,text,jsonb,text,text,text,uuid,timestamptz,boolean,timestamptz)') IS NOT NULL AS cierre_v2_instalado;
