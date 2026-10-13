-- ============================================================
-- F&M Fumigación – Migración 013
-- Logotipo de cada hotel
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- Requiere: schema.sql. Es repetible; solo agrega una columna opcional y un
-- bucket: no modifica datos existentes.
--
-- El logo se guarda en el bucket 'hotel-logos' (lectura pública, como el
-- calendario y los nombres de hoteles). Solo un administrador puede subir,
-- cambiar o borrar logos. Formatos: PNG, JPG o WEBP, máximo 2 MB (sin SVG,
-- que puede contener código).
-- ============================================================
BEGIN;

ALTER TABLE public.hotels
  ADD COLUMN IF NOT EXISTS logo_url TEXT CHECK (logo_url IS NULL OR length(logo_url) <= 500);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('hotel-logos', 'hotel-logos', TRUE, 2097152, ARRAY['image/png', 'image/jpeg', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS hotel_logos_select_admin ON storage.objects;
CREATE POLICY hotel_logos_select_admin ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'hotel-logos' AND public.is_admin());
DROP POLICY IF EXISTS hotel_logos_insert_admin ON storage.objects;
CREATE POLICY hotel_logos_insert_admin ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'hotel-logos' AND public.is_admin());
DROP POLICY IF EXISTS hotel_logos_update_admin ON storage.objects;
CREATE POLICY hotel_logos_update_admin ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'hotel-logos' AND public.is_admin()) WITH CHECK (bucket_id = 'hotel-logos' AND public.is_admin());
DROP POLICY IF EXISTS hotel_logos_delete_admin ON storage.objects;
CREATE POLICY hotel_logos_delete_admin ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'hotel-logos' AND public.is_admin());

NOTIFY pgrst, 'reload schema';
COMMIT;

SELECT
  EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'hotels' AND column_name = 'logo_url') AS columna_logo,
  EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'hotel-logos') AS bucket_logos;
