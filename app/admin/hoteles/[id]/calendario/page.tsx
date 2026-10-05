import AreaMatrix from '@/components/calendar/AreaMatrix'
import ImportarExcel from '@/components/calendar/ImportarExcel'
import { obtenerMatrizMensual } from '@/lib/calendario-hotel/datos'

export default async function CalendarioHotelPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ mes?: string }>
}) {
  const { id } = await params
  const { mes } = await searchParams
  const hoy = new Date()
  const [anio, numeroMes] = /^\d{4}-\d{2}$/.test(mes ?? '')
    ? mes!.split('-').map(Number)
    : [hoy.getFullYear(), hoy.getMonth() + 1]
  const matriz = await obtenerMatrizMensual(id, anio, numeroMes)
  const rutaBase = `/admin/hoteles/${id}/calendario`

  return (
    <main className="mx-auto max-w-[1400px] space-y-6 p-6">
      <ImportarExcel hotelId={id} mes={`${anio}-${String(numeroMes).padStart(2, '0')}`} />
      <AreaMatrix matriz={matriz} editable rutaBase={rutaBase} />
    </main>
  )
}