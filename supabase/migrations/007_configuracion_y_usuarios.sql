-- ============================================================
-- F&M Fumigación – Migración 007
-- Configuración de la app y listado de usuarios para el panel admin
-- (el alta/edición de usuarios la hace la Edge Function admin-usuarios)
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- Requiere: schema.sql (profiles, is_admin). Es repetible.
-- ============================================================
BEGIN;

CREATE SCHEMA IF NOT EXISTS empleados_private;
GRANT USAGE ON SCHEMA empleados_private TO authenticated;

-- 1. Corrección de seguridad ---------------------------------------------
-- Antes el rol se tomaba de los datos que envía quien se registra, por lo que
-- cualquiera podía crearse una cuenta 'admin'. Ahora todo registro nuevo entra
-- como 'consulta'; el rol solo lo cambia un administrador.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role, name)
  VALUES (NEW.id, NEW.email, 'consulta', NEW.raw_user_meta_data->>'name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 2. Configuración general (una sola fila) --------------------------------
CREATE TABLE IF NOT EXISTS public.app_configuracion (
  id                          SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  nombre_empresa              TEXT NOT NULL DEFAULT 'F&M Fumigación' CHECK (length(nombre_empresa) BETWEEN 1 AND 80),
  telefono_oficina            TEXT CHECK (telefono_oficina IS NULL OR length(telefono_oficina) <= 30),
  correo_oficina              TEXT CHECK (correo_oficina IS NULL OR length(correo_oficina) <= 120),
  chat_habilitado             BOOLEAN NOT NULL DEFAULT TRUE,
  foto_obligatoria_confirmar  BOOLEAN NOT NULL DEFAULT FALSE,
  max_fotos_evidencia         SMALLINT NOT NULL DEFAULT 6 CHECK (max_fotos_evidencia BETWEEN 1 AND 10),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by                  UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);
INSERT INTO public.app_configuracion (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.app_configuracion ENABLE ROW LEVEL SECURITY;

-- El calendario es público, así que la configuración se puede leer sin sesión.
DROP POLICY IF EXISTS config_select ON public.app_configuracion;
CREATE POLICY config_select ON public.app_configuracion FOR SELECT TO anon, authenticated USING (TRUE);
DROP POLICY IF EXISTS config_update_admin ON public.app_configuracion;
CREATE POLICY config_update_admin ON public.app_configuracion FOR UPDATE TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT ON public.app_configuracion TO anon, authenticated;
GRANT UPDATE ON public.app_configuracion TO authenticated;

CREATE OR REPLACE FUNCTION empleados_private.sellar_configuracion()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  NEW.updated_by := auth.uid();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS app_configuracion_sellar ON public.app_configuracion;
CREATE TRIGGER app_configuracion_sellar
  BEFORE UPDATE ON public.app_configuracion
  FOR EACH ROW EXECUTE FUNCTION empleados_private.sellar_configuracion();

-- 3. Gestión de usuarios (solo administradores) ---------------------------
-- Listado de solo lectura con el último inicio de sesión, que vive en auth.users.
CREATE OR REPLACE FUNCTION public.admin_listar_usuarios()
RETURNS TABLE (
  id UUID, email TEXT, name TEXT, role TEXT, active BOOLEAN,
  created_at TIMESTAMPTZ, last_sign_in_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Solo administradores pueden ver los usuarios.' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
    SELECT p.id, p.email, p.name, p.role, p.active, p.created_at, u.last_sign_in_at
    FROM public.profiles p
    LEFT JOIN auth.users u ON u.id = p.id
    ORDER BY p.active DESC, p.role, lower(COALESCE(p.name, p.email));
END;
$$;
REVOKE ALL ON FUNCTION public.admin_listar_usuarios() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_listar_usuarios() TO authenticated;

-- Crear usuarios, cambiar contraseñas y activar/desactivar cuentas lo hace la
-- Edge Function 'admin-usuarios' con la API oficial de Supabase Auth.
-- Se eliminan versiones anteriores de este archivo que escribían en auth.users.
DROP FUNCTION IF EXISTS public.admin_crear_usuario(TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_actualizar_usuario(UUID, TEXT, TEXT, BOOLEAN);
DROP FUNCTION IF EXISTS public.admin_cambiar_contrasena(UUID, TEXT);

NOTIFY pgrst, 'reload schema';
COMMIT;

-- Verificación de instalación.
SELECT
  to_regclass('public.app_configuracion') IS NOT NULL AS configuracion_instalada,
  to_regprocedure('public.admin_listar_usuarios()') IS NOT NULL AS listado_usuarios_instalado;
