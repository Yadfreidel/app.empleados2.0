// app/api/dictado/route.ts
// POST multipart { audio, dictado_id, actividad_id, duracion }: transcribe el
// dictado del técnico y extrae los campos del cierre. No completa el servicio:
// solo devuelve los campos para que el técnico los revise y confirme.
// El audio se procesa en memoria y no se guarda, salvo DICTADO_CONSERVAR_AUDIO=true.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  CAMPOS_VACIOS, ErrorDictado, configDictado, extensionAudio, extraerCampos, normalizarCampos, transcribir, validarAudio,
  type CamposDictado,
} from '@/lib/dictado/servidor'

export const maxDuration = 120

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const responder = (cuerpo: Record<string, unknown>, status = 200) => NextResponse.json(cuerpo, { status })
const fallo = (error: string, status: number) => responder({ ok: false, error }, status)

interface FilaDictado { id: string; actividad_id: string; transcripcion: string; campos: Partial<CamposDictado>; duracion_seg: number | null }
const respuestaDe = (d: FilaDictado, duplicado: boolean) => responder({
  ok: true, duplicado, dictado_id: d.id, transcripcion: d.transcripcion,
  campos: { ...CAMPOS_VACIOS, ...normalizarCampos(d.campos) }, duracion: d.duracion_seg,
})

export async function POST(request: Request) {
  const cfg = configDictado()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return fallo('Tu sesión expiró. Inicia sesión para dictar el reporte.', 401)

  let form: FormData
  try { form = await request.formData() } catch { return fallo('Solicitud inválida.', 400) }
  const audio = form.get('audio')
  const dictadoId = String(form.get('dictado_id') ?? '')
  const actividadId = String(form.get('actividad_id') ?? '')
  const duracion = Number(form.get('duracion'))
  if (!UUID.test(dictadoId) || !UUID.test(actividadId)) return fallo('Datos del dictado no válidos.', 400)

  // Reenvío de la misma grabación: se devuelve el resultado guardado sin volver a transcribir.
  const { data: previo, error: errorPrevio } = await supabase.from('dictados_cierre')
    .select('id, actividad_id, transcripcion, campos, duracion_seg').eq('id', dictadoId).maybeSingle()
  if (errorPrevio && (errorPrevio.code === 'PGRST205' || errorPrevio.code === '42P01')) {
    return fallo('El dictado aún no está habilitado: falta ejecutar la migración 012 en Supabase.', 503)
  }
  if (previo) {
    if (previo.actividad_id !== actividadId) return fallo('Identificador de dictado no válido.', 409)
    return respuestaDe(previo as FilaDictado, true)
  }

  // El servicio debe existir, ser visible para el usuario (permisos actuales) y seguir pendiente.
  const { data: actividad } = await supabase.from('activities').select('id, status').eq('id', actividadId).maybeSingle()
  if (!actividad) return fallo('Servicio no encontrado o sin permiso.', 404)
  if (actividad.status !== 'programado') return fallo('Este servicio ya no está pendiente de cierre.', 409)

  if (!(audio instanceof Blob)) return fallo('No se recibió el audio.', 400)
  try {
    validarAudio(audio, duracion, cfg)
    const { texto, duracion: duracionReal } = await transcribir(audio, cfg)
    if (duracionReal !== null && duracionReal > cfg.maxSegundos + 5) {
      throw new ErrorDictado(`La grabación supera ${cfg.maxSegundos} segundos.`, 413)
    }
    if (texto.length < 3) throw new ErrorDictado('No se entendió el audio. Graba de nuevo hablando cerca del teléfono, o escribe el reporte.', 422)

    const { campos, extraido, modelo } = await extraerCampos(texto, cfg)

    let audioPath: string | null = null
    if (cfg.conservarAudio) {
      const ruta = `${user.id}/${dictadoId}.${extensionAudio(audio.type)}`
      const { error } = await supabase.storage.from('dictados-audio').upload(ruta, audio, { contentType: audio.type.split(';')[0], upsert: true })
      if (error) console.error('No se pudo conservar el audio del dictado:', error.message)
      else audioPath = ruta
    }

    const fila = {
      id: dictadoId, actividad_id: actividadId, usuario_id: user.id, transcripcion: texto.slice(0, 20000), campos,
      duracion_seg: Math.round((duracionReal ?? duracion) * 10) / 10,
      proveedor: new URL(cfg.transcripcionUrl).hostname, modelo: [cfg.transcripcionModelo, modelo].filter(Boolean).join(' + '),
      audio_path: audioPath,
    }
    const { error: errorInsert } = await supabase.from('dictados_cierre').insert(fila)
    if (errorInsert) {
      // Dos envíos simultáneos de la misma grabación: se devuelve el que quedó guardado.
      if (errorInsert.code === '23505') {
        const { data } = await supabase.from('dictados_cierre').select('id, actividad_id, transcripcion, campos, duracion_seg').eq('id', dictadoId).single()
        if (data) return respuestaDe(data as FilaDictado, true)
      }
      console.error('No se pudo guardar el dictado:', errorInsert.message)
      return fallo('No tienes permiso para dictar en este servicio.', 403)
    }
    return responder({ ok: true, duplicado: false, dictado_id: dictadoId, transcripcion: fila.transcripcion, campos, extraido, duracion: fila.duracion_seg })
  } catch (error) {
    if (error instanceof ErrorDictado) return fallo(error.message, error.status)
    console.error('Dictado:', error)
    return fallo('Error inesperado al procesar el dictado. Escribe el reporte manualmente.', 500)
  }
}
