-- ============================================================
-- F&M Fumigación – Migración 009
-- Informes automáticos de cierre de operativos
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- Requiere: schema.sql, 20261005165015_actividad_notificaciones_admin.sql,
--           006_chat_actividades.sql y 008_sincronizacion_offline.sql
-- Es repetible y solo agrega objetos: no modifica ni borra datos existentes.
--
-- Flujo
--   1. El técnico cierra el operativo con el formulario de informe (hotel,
--      área exacta, servicio, hallazgos, acciones, resultado y mínimo 4 fotos:
--      área, hallazgo/inspección, trabajo y estado final). La función
--      cerrar_operativo_con_informe guarda en UNA transacción: la actividad
--      como realizada, el informe, la notificación al administrador y la clave
--      de idempotencia (el teléfono puede reintentar sin duplicar nada).
--   2. La Edge Function 'informes-cierre' (con las claves de IA y correo, que
--      solo existen en el servidor) analiza fotos y textos, genera el PDF, lo
--      guarda en el bucket privado 'informes-cierre' y lo envía a los correos
--      de gerencia del hotel. Si la evidencia es insuficiente o hay
--      contradicciones, queda en «requiere revisión» hasta que un
--      administrador (supervisor) lo apruebe.
--   3. Cada paso queda registrado en informe_eventos (errores incluidos) y la
--      función reintenta con espera creciente.
-- ============================================================
BEGIN;

CREATE SCHEMA IF NOT EXISTS empleados_private;
GRANT USAGE ON SCHEMA empleados_private TO authenticated;

-- 1. Correos de gerencia por hotel ----------------------------------------
-- Tabla aparte porque 'hotels' se puede leer sin sesión (calendario público):
-- los correos solo los ve y edita un administrador.
CREATE TABLE IF NOT EXISTS public.hotel_correos_informe (
  hotel_id   UUID PRIMARY KEY REFERENCES public.hotels(id) ON DELETE CASCADE,
  correos    TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(correos) <= 10),
  envio_automatico BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid()
);
ALTER TABLE public.hotel_correos_informe ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS hotel_correos_admin ON public.hotel_correos_informe;
CREATE POLICY hotel_correos_admin ON public.hotel_correos_informe FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hotel_correos_informe TO authenticated;

CREATE OR REPLACE FUNCTION empleados_private.validar_correos_hotel()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_correo TEXT;
  v_limpios TEXT[] := '{}';
BEGIN
  FOREACH v_correo IN ARRAY COALESCE(NEW.correos, '{}') LOOP
    v_correo := lower(btrim(v_correo));
    CONTINUE WHEN v_correo = '';
    IF length(v_correo) > 254 OR v_correo !~ '^[^@\s,;<>]+@[^@\s,;<>]+\.[^@\s,;<>]+$' THEN
      RAISE EXCEPTION 'Correo no válido: %', v_correo USING ERRCODE = '22023';
    END IF;
    IF NOT v_correo = ANY (v_limpios) THEN
      v_limpios := array_append(v_limpios, v_correo);
    END IF;
  END LOOP;
  NEW.correos := v_limpios;
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS hotel_correos_validar ON public.hotel_correos_informe;
CREATE TRIGGER hotel_correos_validar
  BEFORE INSERT OR UPDATE ON public.hotel_correos_informe
  FOR EACH ROW EXECUTE FUNCTION empleados_private.validar_correos_hotel();

-- 2. Informes de cierre ---------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.informes_cierre_numero_seq;

CREATE TABLE IF NOT EXISTS public.informes_cierre (
  -- Lo genera el teléfono: es la clave de idempotencia de todo el cierre.
  id                    UUID PRIMARY KEY,
  numero                TEXT NOT NULL UNIQUE,
  -- Un solo informe por operativo (prevención de duplicados).
  actividad_id          UUID NOT NULL UNIQUE REFERENCES public.activities(id) ON DELETE CASCADE,
  hotel_id              UUID NOT NULL REFERENCES public.hotels(id) ON DELETE RESTRICT,
  hotel_nombre          TEXT NOT NULL,
  operacion_nombre      TEXT,
  actividad_titulo      TEXT NOT NULL,
  fecha_programada      DATE NOT NULL,
  area                  TEXT NOT NULL CHECK (length(area) BETWEEN 3 AND 200),
  servicio              TEXT NOT NULL CHECK (length(servicio) BETWEEN 3 AND 1000),
  hallazgos             TEXT NOT NULL CHECK (length(hallazgos) BETWEEN 3 AND 3000),
  acciones              TEXT NOT NULL CHECK (length(acciones) BETWEEN 3 AND 3000),
  -- Lo que declara el técnico: distingue «servicio realizado» de «problema resuelto».
  resultado             TEXT NOT NULL CHECK (resultado IN ('servicio_realizado', 'problema_resuelto', 'requiere_seguimiento')),
  observaciones         TEXT CHECK (observaciones IS NULL OR length(observaciones) <= 500),
  -- [{ "path", "categoria", "nombre", "tipo", "tamano" }] en el bucket actividad-adjuntos.
  fotos                 JSONB NOT NULL,
  tecnico_id            UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  tecnico_nombre        TEXT NOT NULL,
  -- Fecha y hora del servidor al recibir el cierre; y la del teléfono si se cerró sin conexión.
  cerrado_en            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  creado_en_dispositivo TIMESTAMPTZ,

  -- Generación (IA + PDF)
  estado_generacion     TEXT NOT NULL DEFAULT 'pendiente'
                          CHECK (estado_generacion IN ('pendiente', 'generando', 'generado', 'error')),
  analisis              JSONB,
  modelo_ia             TEXT,
  pdf_path              TEXT,
  pdf_tamano            INTEGER,
  generado_en           TIMESTAMPTZ,
  intentos_generacion   INTEGER NOT NULL DEFAULT 0,

  -- Revisión del supervisor
  requiere_revision     BOOLEAN NOT NULL DEFAULT FALSE,
  motivos_revision      TEXT[] NOT NULL DEFAULT '{}',
  revisado_por          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  revisado_nombre       TEXT,
  revisado_en           TIMESTAMPTZ,
  revision_nota         TEXT,

  -- Envío por correo
  estado_envio          TEXT NOT NULL DEFAULT 'pendiente'
                          CHECK (estado_envio IN ('pendiente', 'requiere_revision', 'enviando', 'enviado',
                                                  'error', 'sin_destinatarios', 'no_enviar')),
  enviado_a             TEXT[],
  enviado_en            TIMESTAMPTZ,
  envio_id              TEXT,
  intentos_envio        INTEGER NOT NULL DEFAULT 0,

  -- Control de reintentos y concurrencia
  ultimo_error          TEXT,
  proximo_intento       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  bloqueado_hasta       TIMESTAMPTZ,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS informes_cierre_hotel_idx ON public.informes_cierre(hotel_id, cerrado_en DESC);
CREATE INDEX IF NOT EXISTS informes_cierre_tecnico_idx ON public.informes_cierre(tecnico_id);
CREATE INDEX IF NOT EXISTS informes_cierre_cola_idx ON public.informes_cierre(proximo_intento)
  WHERE estado_generacion IN ('pendiente', 'generando', 'error') OR estado_envio IN ('pendiente', 'enviando', 'error');
ALTER TABLE public.informes_cierre ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION empleados_private.tocar_informe()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS informes_cierre_tocar ON public.informes_cierre;
CREATE TRIGGER informes_cierre_tocar
  BEFORE UPDATE ON public.informes_cierre
  FOR EACH ROW EXECUTE FUNCTION empleados_private.tocar_informe();

-- Lectura: el administrador (supervisor) y el técnico que cerró el operativo.
-- Nadie escribe directamente: el cierre lo hace la función de abajo y la
-- generación/envío la Edge Function con la clave de servicio.
DROP POLICY IF EXISTS informes_select ON public.informes_cierre;
CREATE POLICY informes_select ON public.informes_cierre FOR SELECT TO authenticated
  USING (public.is_admin() OR tecnico_id = auth.uid());
GRANT SELECT ON public.informes_cierre TO authenticated;

-- 3. Registro de eventos y errores ----------------------------------------
CREATE TABLE IF NOT EXISTS public.informe_eventos (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  informe_id  UUID NOT NULL REFERENCES public.informes_cierre(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL CHECK (tipo IN ('creado', 'generacion', 'revision', 'envio', 'error', 'reintento', 'aprobado', 'no_enviar')),
  mensaje     TEXT NOT NULL,
  detalle     JSONB,
  usuario_id  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS informe_eventos_informe_idx ON public.informe_eventos(informe_id, created_at);
ALTER TABLE public.informe_eventos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS informe_eventos_select_admin ON public.informe_eventos;
CREATE POLICY informe_eventos_select_admin ON public.informe_eventos FOR SELECT TO authenticated
  USING (public.is_admin());
GRANT SELECT ON public.informe_eventos TO authenticated;

-- 4. Bucket privado para los PDF -----------------------------------------
-- Ruta: '<actividad_id>/<informe_id>.pdf'. Solo la Edge Function escribe.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('informes-cierre', 'informes-cierre', FALSE, 26214400, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION empleados_private.puede_ver_informe_ruta(p_ruta TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.informes_cierre i
    JOIN public.profiles p ON p.id = auth.uid()
    WHERE i.pdf_path = p_ruta
      AND p.active IS TRUE
      AND (p.role = 'admin' OR i.tecnico_id = p.id)
  );
$$;
REVOKE ALL ON FUNCTION empleados_private.puede_ver_informe_ruta(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION empleados_private.puede_ver_informe_ruta(TEXT) TO authenticated;

DROP POLICY IF EXISTS informes_cierre_pdf_select ON storage.objects;
CREATE POLICY informes_cierre_pdf_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'informes-cierre' AND empleados_private.puede_ver_informe_ruta(name));

-- 5. Cierre del operativo con informe (atómico e idempotente) -------------
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
  v_faltan TEXT[];
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

  -- Validación de los datos obligatorios.
  IF v_area IS NULL OR length(v_area) < 3 OR length(v_area) > 200 THEN
    RETURN jsonb_build_object('ok', FALSE, 'codigo', 'invalida', 'error', 'Indica el área exacta (3 a 200 caracteres).');
  END IF;
  IF v_servicio IS NULL OR length(v_servicio) < 3 OR length(v_servicio) > 1000 THEN
    RETURN jsonb_build_object('ok', FALSE, 'codigo', 'invalida', 'error', 'Describe el servicio realizado (3 a 1000 caracteres).');
  END IF;
  IF v_hallazgos IS NULL OR length(v_hallazgos) < 3 OR length(v_hallazgos) > 3000 THEN
    RETURN jsonb_build_object('ok', FALSE, 'codigo', 'invalida', 'error', 'Describe los hallazgos (3 a 3000 caracteres).');
  END IF;
  IF v_acciones IS NULL OR length(v_acciones) < 3 OR length(v_acciones) > 3000 THEN
    RETURN jsonb_build_object('ok', FALSE, 'codigo', 'invalida', 'error', 'Describe las acciones realizadas (3 a 3000 caracteres).');
  END IF;
  IF p_resultado IS NULL OR p_resultado NOT IN ('servicio_realizado', 'problema_resuelto', 'requiere_seguimiento') THEN
    RETURN jsonb_build_object('ok', FALSE, 'codigo', 'invalida', 'error', 'Indica el resultado del servicio.');
  END IF;
  IF length(COALESCE(v_observaciones, '')) > 500 THEN
    RETURN jsonb_build_object('ok', FALSE, 'codigo', 'invalida', 'error', 'Las observaciones no pueden superar 500 caracteres.');
  END IF;

  -- Fotos: mínimo una de cada categoría obligatoria, máximo 12, todas ya
  -- subidas al bucket privado dentro de la carpeta de esta actividad.
  IF p_fotos IS NULL OR jsonb_typeof(p_fotos) <> 'array' OR jsonb_array_length(p_fotos) < 4 OR jsonb_array_length(p_fotos) > 12 THEN
    RETURN jsonb_build_object('ok', FALSE, 'codigo', 'invalida', 'error', 'Se requieren entre 4 y 12 fotos.');
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
  SELECT array_agg(c) INTO v_faltan
  FROM unnest(ARRAY['area', 'hallazgo', 'trabajo', 'estado_final']) AS c
  WHERE NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_fotos) f WHERE f->>'categoria' = c);
  IF v_faltan IS NOT NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'codigo', 'invalida',
      'error', 'Faltan fotos obligatorias: ' || array_to_string(v_faltan, ', ') || '.');
  END IF;

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
    v_area, v_servicio, v_hallazgos, v_acciones, p_resultado, v_observaciones, v_fotos,
    v_uid, v_nombre, p_creado_en_dispositivo
  );
  INSERT INTO public.informe_eventos (informe_id, tipo, mensaje, usuario_id, detalle)
  VALUES (p_informe_id, 'creado', 'Operativo cerrado por ' || v_nombre, v_uid,
          jsonb_build_object('fotos', jsonb_array_length(v_fotos), 'resultado', p_resultado));

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

-- API pública sin privilegios elevados; la función interna verifica la identidad.
CREATE OR REPLACE FUNCTION public.cerrar_operativo_con_informe(
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
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT empleados_private.cerrar_operativo_con_informe(
    p_informe_id, p_actividad_id, p_area, p_servicio, p_hallazgos, p_acciones, p_resultado,
    p_observaciones, p_fotos, p_version_esperada, p_forzar, p_creado_en_dispositivo
  );
$$;
REVOKE ALL ON FUNCTION public.cerrar_operativo_con_informe(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ, BOOLEAN, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cerrar_operativo_con_informe(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, TIMESTAMPTZ, BOOLEAN, TIMESTAMPTZ) TO authenticated;

-- 6. Reserva atómica de un informe para procesarlo ------------------------
-- La usa la Edge Function (clave de servicio): evita que dos ejecuciones
-- simultáneas (reintento del teléfono + tarea programada) generen o envíen
-- el mismo informe dos veces. La reserva caduca sola si la función se corta.
CREATE OR REPLACE FUNCTION public.reservar_informe_cierre(p_id UUID, p_segundos INTEGER DEFAULT 300)
RETURNS SETOF public.informes_cierre
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  UPDATE public.informes_cierre
    SET bloqueado_hasta = now() + make_interval(secs => GREATEST(60, LEAST(p_segundos, 900)))
    WHERE id = p_id AND (bloqueado_hasta IS NULL OR bloqueado_hasta < now())
    RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.reservar_informe_cierre(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_informe_cierre(UUID, INTEGER) TO service_role;

-- 7. Tiempo real (estado del informe en el panel) -------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'informes_cierre'
    ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.informes_cierre;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Verificación de instalación (no modifica datos).
SELECT
  to_regclass('public.informes_cierre') IS NOT NULL AS informes_instalados,
  to_regclass('public.hotel_correos_informe') IS NOT NULL AS correos_gerencia,
  EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'informes-cierre') AS bucket_informes,
  to_regprocedure('public.cerrar_operativo_con_informe(uuid,uuid,text,text,text,text,text,text,jsonb,timestamptz,boolean,timestamptz)') IS NOT NULL AS cierre_instalado;
