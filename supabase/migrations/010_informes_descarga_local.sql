-- ============================================================
-- F&M Fumigación – Migración 010
-- Informes de cierre con descarga local (sin envío por correo)
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- Requiere: 009_informes_cierre.sql. Es repetible; no borra datos.
--
-- El PDF ahora se genera en el navegador y se descarga en el equipo. Esta
-- migración agrega la revisión del supervisor sin depender de la Edge
-- Function: un administrador ajusta el contenido del informe y lo aprueba.
-- La tabla hotel_correos_informe y el bucket 'informes-cierre' de la 009 ya
-- no se usan; se conservan para no borrar nada.
-- ============================================================
BEGIN;

CREATE OR REPLACE FUNCTION empleados_private.revisar_informe_cierre(
  p_informe_id UUID,
  p_analisis JSONB,
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
  v_nombre TEXT;
  v_nota TEXT := NULLIF(btrim(p_nota), '');
BEGIN
  SELECT * INTO v_perfil FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND OR v_perfil.active IS NOT TRUE OR v_perfil.role <> 'admin' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Solo un administrador (supervisor) puede revisar informes.');
  END IF;
  IF p_analisis IS NULL OR jsonb_typeof(p_analisis) <> 'object'
     OR jsonb_typeof(p_analisis->'resumen') <> 'string' OR length(p_analisis->>'resumen') < 10
     OR length(p_analisis::TEXT) > 60000 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'El contenido del informe no es válido (el resumen debe tener al menos 10 caracteres).');
  END IF;
  IF length(COALESCE(v_nota, '')) > 1000 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'La nota de revisión no puede superar 1000 caracteres.');
  END IF;

  v_nombre := COALESCE(NULLIF(btrim(v_perfil.name), ''), v_perfil.email, 'Supervisor');
  UPDATE public.informes_cierre
    SET analisis = p_analisis,
        revisado_por = v_uid,
        revisado_nombre = v_nombre,
        revisado_en = now(),
        revision_nota = v_nota
    WHERE id = p_informe_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Informe no encontrado.');
  END IF;

  INSERT INTO public.informe_eventos (informe_id, tipo, mensaje, usuario_id, detalle)
  VALUES (p_informe_id, 'aprobado', 'Revisado y aprobado por ' || v_nombre, v_uid, jsonb_build_object('nota', v_nota));
  RETURN jsonb_build_object('ok', TRUE);
END;
$$;
REVOKE ALL ON FUNCTION empleados_private.revisar_informe_cierre(UUID, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION empleados_private.revisar_informe_cierre(UUID, JSONB, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.revisar_informe_cierre(
  p_informe_id UUID,
  p_analisis JSONB,
  p_nota TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT empleados_private.revisar_informe_cierre(p_informe_id, p_analisis, p_nota);
$$;
REVOKE ALL ON FUNCTION public.revisar_informe_cierre(UUID, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revisar_informe_cierre(UUID, JSONB, TEXT) TO authenticated;

-- Los informes nuevos ya no esperan un envío.
ALTER TABLE public.informes_cierre ALTER COLUMN estado_envio SET DEFAULT 'no_enviar';
UPDATE public.informes_cierre SET estado_envio = 'no_enviar'
  WHERE estado_envio IN ('pendiente', 'requiere_revision', 'sin_destinatarios', 'error');

NOTIFY pgrst, 'reload schema';
COMMIT;

SELECT to_regprocedure('public.revisar_informe_cierre(uuid,jsonb,text)') IS NOT NULL AS revision_instalada;
