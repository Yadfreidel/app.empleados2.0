CREATE TABLE IF NOT EXISTS public.hotel_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  horario TEXT,
  orden INTEGER NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS hotel_areas_hotel_nombre_uq
  ON public.hotel_areas (hotel_id, lower(nombre));
CREATE INDEX IF NOT EXISTS hotel_areas_hotel_idx ON public.hotel_areas (hotel_id, orden);

CREATE TABLE IF NOT EXISTS public.area_servicios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area_id UUID NOT NULL REFERENCES public.hotel_areas(id) ON DELETE CASCADE,
  fecha DATE NOT NULL,
  estado TEXT NOT NULL DEFAULT 'programado'
    CHECK (estado IN ('programado', 'realizado', 'reprogramado', 'cancelado')),
  notas TEXT,
  created_by UUID REFERENCES auth.users(id) DEFAULT auth.uid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (area_id, fecha)
);

CREATE INDEX IF NOT EXISTS area_servicios_fecha_idx ON public.area_servicios (fecha);

CREATE OR REPLACE FUNCTION public.touch_area_servicio_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS area_servicios_touch ON public.area_servicios;
CREATE TRIGGER area_servicios_touch
  BEFORE UPDATE ON public.area_servicios
  FOR EACH ROW EXECUTE FUNCTION public.touch_area_servicio_updated_at();

ALTER TABLE public.hotel_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.area_servicios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS areas_lectura ON public.hotel_areas;
DROP POLICY IF EXISTS areas_admin ON public.hotel_areas;
DROP POLICY IF EXISTS serv_lectura ON public.area_servicios;
DROP POLICY IF EXISTS serv_admin ON public.area_servicios;

CREATE POLICY areas_lectura ON public.hotel_areas
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY areas_admin ON public.hotel_areas
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY serv_lectura ON public.area_servicios
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY serv_admin ON public.area_servicios
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT SELECT ON public.hotel_areas, public.area_servicios TO anon, authenticated;
GRANT ALL ON public.hotel_areas, public.area_servicios TO authenticated;