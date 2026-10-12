-- ============================================================
-- F&M Fumigación – Migración 006
-- Chat por actividad (mensajes, fotos y documentos)
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- Requiere: schema.sql y 20261005165015_actividad_notificaciones_admin.sql
-- Es repetible. No modifica ni borra tablas o funciones existentes.
-- ============================================================
BEGIN;

-- 1. Tabla de mensajes ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.actividad_mensajes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actividad_id   UUID NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  autor_id       UUID REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  autor_nombre   TEXT,
  autor_rol      TEXT,
  contenido      TEXT CHECK (contenido IS NULL OR length(contenido) <= 2000),
  adjunto_path   TEXT,
  adjunto_tipo   TEXT,
  adjunto_nombre TEXT,
  adjunto_tamano INTEGER,
  es_evidencia   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT actividad_mensajes_no_vacio CHECK (
    NULLIF(btrim(COALESCE(contenido, '')), '') IS NOT NULL OR adjunto_path IS NOT NULL
  )
);
CREATE INDEX IF NOT EXISTS actividad_mensajes_actividad_idx
  ON public.actividad_mensajes(actividad_id, created_at);
ALTER TABLE public.actividad_mensajes ENABLE ROW LEVEL SECURITY;

-- 2. Funciones de permisos (fuera del esquema expuesto por la API) --------
CREATE SCHEMA IF NOT EXISTS empleados_private;
GRANT USAGE ON SCHEMA empleados_private TO authenticated;

-- Un usuario activo puede participar en el chat de una actividad si es
-- administrador o si la actividad está publicada en el calendario.
CREATE OR REPLACE FUNCTION empleados_private.puede_usar_chat(p_actividad_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.activities a ON a.id = p_actividad_id
    WHERE p.id = auth.uid()
      AND p.active IS TRUE
      AND (p.role = 'admin' OR a.published IS TRUE)
  );
$$;
REVOKE ALL ON FUNCTION empleados_private.puede_usar_chat(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION empleados_private.puede_usar_chat(UUID) TO authenticated;

-- Variante para rutas de Storage: '<actividad_id>/<archivo>'.
CREATE OR REPLACE FUNCTION empleados_private.puede_usar_chat_ruta(p_ruta TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_carpeta TEXT := split_part(COALESCE(p_ruta, ''), '/', 1);
BEGIN
  IF v_carpeta !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN FALSE;
  END IF;
  RETURN empleados_private.puede_usar_chat(v_carpeta::UUID);
END;
$$;
REVOKE ALL ON FUNCTION empleados_private.puede_usar_chat_ruta(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION empleados_private.puede_usar_chat_ruta(TEXT) TO authenticated;

-- El autor siempre es el usuario autenticado; el nombre y el rol se toman
-- del perfil para que no se puedan falsificar desde el teléfono.
CREATE OR REPLACE FUNCTION empleados_private.preparar_actividad_mensaje()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_perfil public.profiles%ROWTYPE;
BEGIN
  SELECT * INTO v_perfil FROM public.profiles WHERE id = auth.uid();
  NEW.autor_id := auth.uid();
  NEW.autor_nombre := COALESCE(NULLIF(btrim(v_perfil.name), ''), v_perfil.email, 'Usuario');
  NEW.autor_rol := v_perfil.role;
  NEW.contenido := NULLIF(btrim(COALESCE(NEW.contenido, '')), '');
  NEW.created_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS actividad_mensajes_preparar ON public.actividad_mensajes;
CREATE TRIGGER actividad_mensajes_preparar
  BEFORE INSERT ON public.actividad_mensajes
  FOR EACH ROW EXECUTE FUNCTION empleados_private.preparar_actividad_mensaje();

-- 3. Políticas de la tabla ------------------------------------------------
DROP POLICY IF EXISTS mensajes_select ON public.actividad_mensajes;
CREATE POLICY mensajes_select ON public.actividad_mensajes FOR SELECT TO authenticated
  USING (empleados_private.puede_usar_chat(actividad_id));

DROP POLICY IF EXISTS mensajes_insert ON public.actividad_mensajes;
CREATE POLICY mensajes_insert ON public.actividad_mensajes FOR INSERT TO authenticated
  WITH CHECK (
    autor_id = auth.uid()
    AND empleados_private.puede_usar_chat(actividad_id)
    AND (adjunto_path IS NULL OR split_part(adjunto_path, '/', 1) = actividad_id::TEXT)
  );

DROP POLICY IF EXISTS mensajes_delete_admin ON public.actividad_mensajes;
CREATE POLICY mensajes_delete_admin ON public.actividad_mensajes FOR DELETE TO authenticated
  USING (public.is_admin());

GRANT SELECT, INSERT, DELETE ON public.actividad_mensajes TO authenticated;

-- 4. Bucket privado para fotos y documentos (máx. 10 MB por archivo) ------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'actividad-adjuntos', 'actividad-adjuntos', FALSE, 10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS actividad_adjuntos_select ON storage.objects;
CREATE POLICY actividad_adjuntos_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'actividad-adjuntos' AND empleados_private.puede_usar_chat_ruta(name));

DROP POLICY IF EXISTS actividad_adjuntos_insert ON storage.objects;
CREATE POLICY actividad_adjuntos_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'actividad-adjuntos' AND empleados_private.puede_usar_chat_ruta(name));

-- El autor puede retirar un archivo que no llegó a enviarse; el admin, cualquiera.
DROP POLICY IF EXISTS actividad_adjuntos_delete ON storage.objects;
CREATE POLICY actividad_adjuntos_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'actividad-adjuntos' AND (owner_id = auth.uid()::TEXT OR public.is_admin()));

-- 5. Tiempo real ----------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
    AND NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'actividad_mensajes'
    ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.actividad_mensajes;
  END IF;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Verificación de instalación.
SELECT
  to_regclass('public.actividad_mensajes') IS NOT NULL AS chat_instalado,
  EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'actividad-adjuntos') AS bucket_adjuntos,
  EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'actividad_mensajes') AS realtime_habilitado;
