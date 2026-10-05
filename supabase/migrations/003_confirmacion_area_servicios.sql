ALTER TABLE public.area_servicios
  ADD COLUMN IF NOT EXISTS confirmado_por UUID REFERENCES public.profiles(id) ON DELETE SET NULL DEFAULT auth.uid(),
  ADD COLUMN IF NOT EXISTS confirmado_en TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmado_nombre TEXT,
  ADD COLUMN IF NOT EXISTS confirmacion_nota TEXT;

CREATE OR REPLACE FUNCTION public.proteger_confirmacion_area_servicio()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  nombre_confirmador TEXT;
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF public.is_admin() THEN
    IF OLD.estado = 'programado' AND NEW.estado = 'realizado' AND auth.uid() IS NOT NULL THEN
      NEW.confirmado_por := auth.uid();
      NEW.confirmado_en := NOW();
      SELECT COALESCE(NULLIF(BTRIM(name), ''), 'Administrador')
        INTO nombre_confirmador
        FROM public.profiles
        WHERE id = auth.uid();
      NEW.confirmado_nombre := nombre_confirmador;
    END IF;
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL
    OR OLD.estado <> 'programado'
    OR NEW.estado <> 'realizado'
    OR NEW.id IS DISTINCT FROM OLD.id
    OR NEW.area_id IS DISTINCT FROM OLD.area_id
    OR NEW.fecha IS DISTINCT FROM OLD.fecha
    OR NEW.notas IS DISTINCT FROM OLD.notas
    OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'Los empleados solo pueden confirmar servicios programados.';
  END IF;

  NEW.confirmado_por := auth.uid();
  NEW.confirmado_en := NOW();
  SELECT COALESCE(NULLIF(BTRIM(name), ''), 'Empleado')
    INTO nombre_confirmador
    FROM public.profiles
    WHERE id = auth.uid();
  NEW.confirmado_nombre := nombre_confirmador;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS area_servicios_confirmacion_guard ON public.area_servicios;
CREATE TRIGGER area_servicios_confirmacion_guard
  BEFORE UPDATE ON public.area_servicios
  FOR EACH ROW EXECUTE FUNCTION public.proteger_confirmacion_area_servicio();

DROP POLICY IF EXISTS serv_confirmar_empleado ON public.area_servicios;
CREATE POLICY serv_confirmar_empleado ON public.area_servicios
  FOR UPDATE TO authenticated
  USING (
    estado = 'programado'
    AND fecha <= CURRENT_DATE
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'consulta' AND active = TRUE
    )
  )
  WITH CHECK (
    estado = 'realizado'
    AND confirmado_por = auth.uid()
    AND confirmado_en IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'consulta' AND active = TRUE
    )
  );