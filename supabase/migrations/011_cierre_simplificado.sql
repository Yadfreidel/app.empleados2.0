-- ============================================================
-- F&M Fumigación – Migración 011
-- Cierre simplificado: 2 fotos + descripción de lo encontrado
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- Requiere: 009 y 010. Es repetible; no borra datos.
--
-- Para cerrar un operativo y generar su informe basta con:
--   * describir lo que se encontró (hallazgos), y
--   * mínimo 2 fotos (máximo 12).
-- Área, servicio, acciones y resultado son opcionales. Si faltan se usan los
-- datos del operativo (título y tipo de servicio) y "servicio realizado";
-- nunca se inventa información.
-- ============================================================
BEGIN;

CREATE OR REPLACE FUNCTION empleados_private.cerrar_operativo_con_informe(
  p_informe_id UUID,
  p_actividad_id UUID,
  p_area TEXT,
  p_servicio TEXT,
  p_hallazgos TEXT,
  p_acciones TEXT,
  p_resultado TEXT,
  p_observaciones TEXT,
  p_fotos JSONB,
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
  v_uid UUID := auth.uid();
  v_perfil public.profiles%ROWTYPE;
  v_actividad public.activities%ROWTYPE;
  v_previo public.informes_cierre%ROWTYPE;
  v_nombre TEXT;
  v_hotel TEXT;
  v_operacion TEXT;
  v_conflicto TEXT;
  v_foto JSONB;
  v_fotos JSONB := '[]'::JSONB;
  v_categoria TEXT;
  v_path TEXT;
  v_numero TEXT;
  v_area TEXT := NULLIF(btrim(p_area), '');
  v_servicio TEXT := NULLIF(btrim(p_servicio), '');
  v_hallazgos TEXT := NULLIF(btrim(p_hallazgos), '');
  v_acciones TEXT := NULLIF(btrim(p_acciones), '');
  v_observaciones TEXT := NULLIF(btrim(p_observaciones), '');
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'codigo', 'sin_sesion', 'error', 'Inicia sesión para cerrar el operativo.');
  END IF;
  SELECT * INTO v_perfil FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND OR v_perfil.active IS NOT TRUE OR v_perfil.role NOT IN ('admin', 'consulta') THEN
    RETURN jsonb_build_object('ok', FALSE, 'codigo', 'sin_permiso', 'error', 'Tu cuenta no tiene permiso para cerrar operativos.');
  END IF;
  IF p_informe_id IS NULL OR p_actividad_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'codigo', 'invalida', 'error', 'Cierre incompleto.');
  END IF;

  -- Obligatorio: lo que se encontró. Lo demás es opcional y se completa con
  -- los datos del operativo (nunca con información inventada).
  IF v_hallazgos IS NULL OR length(v_hallazgos) < 3 OR length(v_hallazgos) > 3000 THEN
    RETURN jsonb_build_object('ok', FALSE, 'codigo', 'invalida', 'error', 'Describe lo que se encontró (3 a 3000 caracteres).');
  END IF;
  IF length(COALESCE(v_area, '')) > 200 OR length(COALESCE(v_servicio, '')) > 1000 OR length(COALESCE(v_acciones, '')) > 3000 THEN
    RETURN jsonb_build_object('ok', FALSE, 'codigo', 'invalida', 'error', 'Alguno de los textos es demasiado largo.');
  END IF;
  IF p_resultado IS NOT NULL AND p_resultado NOT IN ('servicio_realizado', 'problema_resuelto', 'requiere_seguimiento') THEN
    RETURN jsonb_build_object('ok', FALSE, 'codigo', 'invalida', 'error', 'Resultado no válido.');
  END IF;
  IF length(COALESCE(v_observaciones, '')) > 500 THEN
    RETURN jsonb_build_object('ok', FALSE, 'codigo', 'invalida', 'error', 'Las observaciones no pueden superar 500 caracteres.');
  END IF;

  -- Fotos: mínimo 2, máximo 12, todas ya subidas al bucket privado dentro de
  -- la carpeta de esta actividad.
  IF p_fotos IS NULL OR jsonb_typeof(p_fotos) <> 'array' OR jsonb_array_length(p_fotos) < 2 OR jsonb_array_length(p_fotos) > 12 THEN
    RETURN jsonb_build_object('ok', FALSE, 'codigo', 'invalida', 'error', 'Se requieren entre 2 y 12 fotos.');
  END IF;
  FOR v_foto IN SELECT * FROM jsonb_array_elements(p_fotos) LOOP
    v_categoria := v_foto->>'categoria';
    v_path := v_foto->>'path';
    IF v_categoria IS NULL OR v_categoria NOT IN ('area', 'hallazgo', 'trabajo', 'estado_final', 'adicional') THEN
      RETURN jsonb_build_object('ok', FALSE, 'codigo', 'invalida', 'error', 'Categoría de foto no válida.');
    END IF;
    IF v_path IS NULL OR split_part(v_path, '/', 1) <> p_actividad_id::TEXT OR v_path LIKE '%..%' THEN
      RETURN jsonb_build_object('ok', FALSE, 'codigo', 'invalida', 'error', 'Ruta de foto no válida.');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'actividad-adjuntos' AND name = v_path) THEN
      -- Error temporal: la subida pudo no haberse completado; el teléfono reintentará.
      RETURN jsonb_build_object('ok', FALSE, 'codigo', 'foto_faltante', 'error', 'Una foto aún no llegó al servidor. Se reintentará.');
    END IF;
    v_fotos := v_fotos || jsonb_build_array(jsonb_build_object(
      'path', v_path,
      'categoria', v_categoria,
      'nombre', left(COALESCE(v_foto->>'nombre', 'foto'), 200),
      'tipo', left(COALESCE(v_foto->>'tipo', 'image/jpeg'), 60),
      'tamano', CASE WHEN (v_foto->>'tamano') ~ '^[0-9]{1,9}$' THEN (v_foto->>'tamano')::INTEGER ELSE 0 END
    ));
  END LOOP;
  -- El bloqueo de la fila serializa reintentos simultáneos del mismo cierre.
  SELECT * INTO v_actividad FROM public.activities WHERE id = p_actividad_id FOR UPDATE;

  -- Reintento de un cierre ya guardado: se responde igual, sin repetir nada.
  SELECT * INTO v_previo FROM public.informes_cierre WHERE id = p_informe_id;
  IF FOUND THEN
    IF v_previo.tecnico_id IS DISTINCT FROM v_uid OR v_previo.actividad_id <> p_actividad_id THEN
      RETURN jsonb_build_object('ok', FALSE, 'codigo', 'invalida', 'error', 'Identificador de informe no válido.');
    END IF;
    RETURN jsonb_build_object('ok', TRUE, 'duplicado', TRUE, 'actividad', to_jsonb(v_actividad),
      'informe', jsonb_build_object('id', v_previo.id, 'numero', v_previo.numero));
  END IF;

  IF v_actividad.id IS NULL OR (v_perfil.role <> 'admin' AND v_actividad.published IS NOT TRUE) THEN
    v_conflicto := 'no_disponible';
  ELSIF v_actividad.status = 'completado' OR EXISTS (SELECT 1 FROM public.informes_cierre WHERE actividad_id = p_actividad_id) THEN
    v_conflicto := 'ya_confirmada';
  ELSIF v_actividad.status = 'cancelado' THEN
    v_conflicto := 'cancelada';
  ELSIF v_actividad.status <> 'programado' THEN
    v_conflicto := 'estado_cambiado';
  ELSIF p_version_esperada IS NOT NULL AND v_actividad.updated_at IS DISTINCT FROM p_version_esperada AND NOT p_forzar THEN
    v_conflicto := 'modificada';
  END IF;
  IF v_conflicto IS NOT NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'codigo', 'conflicto', 'conflicto', v_conflicto,
      'actividad', CASE WHEN v_conflicto = 'no_disponible' THEN NULL ELSE to_jsonb(v_actividad) END);
  END IF;

  v_nombre := COALESCE(NULLIF(btrim(v_perfil.name), ''), v_perfil.email, 'Técnico');
  SELECT name INTO v_hotel FROM public.hotels WHERE id = v_actividad.hotel_id;
  SELECT name INTO v_operacion FROM public.operation_types WHERE id = v_actividad.operation_type_id;

  v_area := left(COALESCE(v_area, NULLIF(btrim(v_actividad.title), ''), 'Área del operativo'), 200);
  IF length(v_area) < 3 THEN v_area := 'Área del operativo'; END IF;
  v_servicio := COALESCE(v_servicio, NULLIF(concat_ws(' - ', v_operacion, NULLIF(btrim(v_actividad.title), '')), ''), 'Servicio programado');
  IF length(v_servicio) < 3 THEN v_servicio := 'Servicio programado'; END IF;
  v_acciones := COALESCE(v_acciones, 'No se detallaron acciones adicionales.');
  IF length(v_acciones) < 3 THEN v_acciones := 'No se detallaron acciones adicionales.'; END IF;

  UPDATE public.activities
    SET status = 'completado', confirmado_por = v_uid,
        confirmado_nombre = v_nombre, confirmado_en = now(),
        confirmacion_nota = left(COALESCE(v_observaciones, 'Cierre con informe: ' || v_area), 500),
        updated_at = now()
    WHERE id = p_actividad_id
    RETURNING * INTO v_actividad;

  INSERT INTO public.confirmaciones_offline (id, actividad_id, usuario_id, creada_en_dispositivo)
  VALUES (p_informe_id, p_actividad_id, v_uid, p_creado_en_dispositivo)
  ON CONFLICT (id) DO NOTHING;

  v_numero := 'FM-' || to_char(now() AT TIME ZONE 'America/Santo_Domingo', 'YYYY') || '-'
           || lpad(nextval('public.informes_cierre_numero_seq')::TEXT, 5, '0');

  INSERT INTO public.informes_cierre (
    id, numero, actividad_id, hotel_id, hotel_nombre, operacion_nombre, actividad_titulo, fecha_programada,
    area, servicio, hallazgos, acciones, resultado, observaciones, fotos,
    tecnico_id, tecnico_nombre, creado_en_dispositivo
  ) VALUES (
    p_informe_id, v_numero, p_actividad_id, v_actividad.hotel_id, COALESCE(v_hotel, 'Hotel'), v_operacion,
    v_actividad.title, v_actividad.date,
    v_area, v_servicio, v_hallazgos, v_acciones, COALESCE(p_resultado, 'servicio_realizado'), v_observaciones, v_fotos,
    v_uid, v_nombre, p_creado_en_dispositivo
  );
  INSERT INTO public.informe_eventos (informe_id, tipo, mensaje, usuario_id, detalle)
  VALUES (p_informe_id, 'creado', 'Operativo cerrado por ' || v_nombre, v_uid,
          jsonb_build_object('fotos', jsonb_array_length(v_fotos), 'resultado', COALESCE(p_resultado, 'servicio_realizado')));

  INSERT INTO public.notificaciones (
    tipo, empleado_id, empleado_nombre, actividad_id, hotel_id,
    hotel_nombre, area_nombre, operacion_nombre, fecha_servicio
  ) VALUES (
    'confirmacion', v_uid, v_nombre, v_actividad.id, v_actividad.hotel_id,
    COALESCE(v_hotel, 'Hotel'), v_actividad.title || ' · ' || v_area, COALESCE(v_operacion, 'Operación'), v_actividad.date
  );

  RETURN jsonb_build_object('ok', TRUE, 'duplicado', FALSE, 'actividad', to_jsonb(v_actividad),
    'informe', jsonb_build_object('id', p_informe_id, 'numero', v_numero));
END;
$$;
REVOKE ALL ON FUNCTION empleados_private.cerrar_operativo_con_informe(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ, BOOLEAN, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION empleados_private.cerrar_operativo_con_informe(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ, BOOLEAN, TIMESTAMPTZ) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;

SELECT to_regprocedure('public.cerrar_operativo_con_informe(uuid,uuid,text,text,text,text,text,text,jsonb,timestamptz,boolean,timestamptz)') IS NOT NULL AS cierre_simplificado_instalado;
