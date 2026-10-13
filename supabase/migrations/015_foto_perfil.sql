-- ============================================================
-- F&M Fumigación – Migración 015
-- Foto de perfil de administradores y supervisores
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- Requiere: schema.sql (profiles). Es repetible; solo agrega columnas
-- opcionales, un bucket y funciones: no modifica ni borra datos existentes.
--
-- * La foto vive en el bucket privado 'avatares', en la carpeta del propio
--   usuario: '<usuario_id>/avatar-<marca>.jpg'. El servidor de Storage limita
--   el tipo (JPG, PNG, WebP) y el tamaño (5 MB).
-- * Cada usuario solo puede subir, ver y borrar archivos de su carpeta; el
--   administrador puede verlos (p. ej. para el empleado del mes).
-- * profiles sigue sin permitir que un usuario se edite a sí mismo: la foto
--   se registra con actualizar_mi_foto(), que solo toca la foto. El rol se
--   sigue asignando como antes (solo el administrador).
-- ============================================================
BEGIN;

CREATE SCHEMA IF NOT EXISTS empleados_private;
GRANT USAGE ON SCHEMA empleados_private TO authenticated;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS avatar_path TEXT CHECK (avatar_path IS NULL OR length(avatar_path) <= 300),
  ADD COLUMN IF NOT EXISTS avatar_actualizado_en TIMESTAMPTZ;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatares', 'avatares', FALSE, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS avatares_select ON storage.objects;
CREATE POLICY avatares_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'avatares' AND (split_part(name, '/', 1) = auth.uid()::TEXT OR public.is_admin()));
DROP POLICY IF EXISTS avatares_insert ON storage.objects;
CREATE POLICY avatares_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatares' AND split_part(name, '/', 1) = auth.uid()::TEXT);
DROP POLICY IF EXISTS avatares_delete ON storage.objects;
CREATE POLICY avatares_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'avatares' AND split_part(name, '/', 1) = auth.uid()::TEXT);

-- Registra la foto ya subida. Verifica en el servidor: carpeta propia, que el
-- archivo exista y que su tipo y tamaño sean válidos. Devuelve la ruta
-- anterior para que el cliente la borre (no quedan archivos huérfanos).
CREATE OR REPLACE FUNCTION empleados_private.actualizar_mi_foto(p_path TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_perfil public.profiles%ROWTYPE;
  v_obj RECORD;
  v_anterior TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Inicia sesión para cambiar tu foto.');
  END IF;
  SELECT * INTO v_perfil FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND OR v_perfil.active IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Tu cuenta no está activa.');
  END IF;
  IF p_path IS NULL OR split_part(p_path, '/', 1) <> v_uid::TEXT OR p_path LIKE '%..%' OR length(p_path) > 300 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Ruta de foto no válida.');
  END IF;
  SELECT o.metadata INTO v_obj FROM storage.objects o WHERE o.bucket_id = 'avatares' AND o.name = p_path;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'La foto no llegó al servidor. Inténtalo de nuevo.');
  END IF;
  IF COALESCE(v_obj.metadata->>'mimetype', '') NOT IN ('image/jpeg', 'image/png', 'image/webp')
     OR COALESCE((v_obj.metadata->>'size')::BIGINT, 0) > 5242880 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'La foto debe ser JPG, PNG o WebP de máximo 5 MB.');
  END IF;

  v_anterior := v_perfil.avatar_path;
  UPDATE public.profiles SET avatar_path = p_path, avatar_actualizado_en = now() WHERE id = v_uid;
  RETURN jsonb_build_object('ok', TRUE, 'anterior', CASE WHEN v_anterior IS DISTINCT FROM p_path THEN v_anterior END);
END;
$$;
REVOKE ALL ON FUNCTION empleados_private.actualizar_mi_foto(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION empleados_private.actualizar_mi_foto(TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.actualizar_mi_foto(p_path TEXT)
RETURNS JSONB
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT empleados_private.actualizar_mi_foto(p_path);
$$;
REVOKE ALL ON FUNCTION public.actualizar_mi_foto(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.actualizar_mi_foto(TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;

SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'avatar_path') AS columna_foto,
  EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'avatares') AS bucket_avatares,
  to_regprocedure('public.actualizar_mi_foto(text)') IS NOT NULL AS funcion_foto;
