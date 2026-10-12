// supabase/functions/admin-usuarios/index.ts
// Edge Function: gestión de usuarios desde el panel de administración.
// Usa la API oficial de administración de Supabase Auth. La clave service_role
// solo existe aquí (la inyecta Supabase); nunca llega al navegador.
//
// Despliegue: ver supabase/functions/README.md
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const ROLES = ['admin', 'consulta'] as const
type Rol = typeof ROLES[number]

// Equivale a ~100 años: Supabase no tiene un baneo "permanente" explícito.
const BANEO_INDEFINIDO = '876000h'

function responder(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}
const fallo = (error: string, status = 200) => responder({ ok: false, error }, status)

function texto(valor: unknown, max: number) {
  return typeof valor === 'string' ? valor.trim().slice(0, max + 1) : ''
}
function validarNombre(nombre: string) {
  return nombre.length >= 1 && nombre.length <= 100 ? null : 'Escribe el nombre del usuario (máx. 100 caracteres).'
}
function validarContrasena(password: unknown) {
  return typeof password === 'string' && password.length >= 8 && password.length <= 72
    ? null
    : 'La contraseña debe tener entre 8 y 72 caracteres.'
}
function esRol(valor: unknown): valor is Rol {
  return typeof valor === 'string' && (ROLES as readonly string[]).includes(valor)
}
function esUuid(valor: unknown): valor is string {
  return typeof valor === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor)
}

async function quedaOtroAdmin(admin: SupabaseClient, excluirId: string) {
  const { count } = await admin.from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin').eq('active', true).neq('id', excluirId)
  return (count ?? 0) > 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return fallo('Método no permitido.', 405)

  const url = Deno.env.get('SUPABASE_URL')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // 1. Identificar a quien llama con su propio token.
  const authHeader = req.headers.get('Authorization') ?? ''
  const llamante = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } })
  const { data: { user }, error: authError } = await llamante.auth.getUser()
  if (authError || !user) return fallo('Tu sesión expiró. Vuelve a iniciar sesión.', 401)

  // 2. Verificar que es administrador activo.
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: perfil } = await admin.from('profiles').select('role, active').eq('id', user.id).maybeSingle()
  if (!perfil || perfil.role !== 'admin' || perfil.active !== true) {
    return fallo('Solo un administrador activo puede gestionar usuarios.', 403)
  }

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return fallo('Solicitud inválida.', 400) }

  try {
    switch (body.accion) {
      case 'estado':
        return responder({ ok: true })

      case 'crear': {
        const email = texto(body.email, 254).toLowerCase()
        const nombre = texto(body.nombre, 100)
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fallo('El correo no es válido.')
        const errNombre = validarNombre(nombre); if (errNombre) return fallo(errNombre)
        const errClave = validarContrasena(body.password); if (errClave) return fallo(errClave)
        if (!esRol(body.rol)) return fallo('Rol no válido.')

        const { data, error } = await admin.auth.admin.createUser({
          email,
          password: body.password as string,
          email_confirm: true,
          user_metadata: { name: nombre },
        })
        if (error || !data.user) {
          const duplicado = error?.code === 'email_exists' || /already/i.test(error?.message ?? '')
          return fallo(duplicado ? 'Ya existe un usuario con ese correo.' : 'No se pudo crear la cuenta.')
        }

        // El trigger handle_new_user crea el perfil como 'consulta'; aquí se fija rol y nombre.
        const { error: perfilError } = await admin.from('profiles').upsert({
          id: data.user.id, email, name: nombre, role: body.rol, active: true,
        })
        if (perfilError) {
          await admin.auth.admin.deleteUser(data.user.id)
          return fallo('No se pudo guardar el perfil del usuario. No se creó la cuenta.')
        }
        return responder({ ok: true, id: data.user.id })
      }

      case 'actualizar': {
        if (!esUuid(body.id)) return fallo('Usuario no válido.')
        const nombre = texto(body.nombre, 100)
        const errNombre = validarNombre(nombre); if (errNombre) return fallo(errNombre)
        if (!esRol(body.rol)) return fallo('Rol no válido.')
        if (typeof body.activo !== 'boolean') return fallo('Estado no válido.')

        const { data: actual } = await admin.from('profiles').select('role, active').eq('id', body.id).maybeSingle()
        if (!actual) return fallo('Usuario no encontrado.')
        const pierdeAdmin = body.rol !== 'admin' || !body.activo
        if (body.id === user.id && pierdeAdmin) {
          return fallo('No puedes quitarte el rol de administrador ni desactivar tu propia cuenta.')
        }
        if (actual.role === 'admin' && actual.active && pierdeAdmin && !(await quedaOtroAdmin(admin, body.id))) {
          return fallo('Debe quedar al menos un administrador activo.')
        }

        // Desactivar bloquea el inicio de sesión y la renovación de la sesión.
        const { error: banError } = await admin.auth.admin.updateUserById(body.id, {
          ban_duration: body.activo ? 'none' : BANEO_INDEFINIDO,
          user_metadata: { name: nombre },
        })
        if (banError) return fallo('No se pudo actualizar la cuenta.')
        const { error } = await admin.from('profiles')
          .update({ name: nombre, role: body.rol, active: body.activo })
          .eq('id', body.id)
        if (error) return fallo('No se pudieron guardar los cambios.')
        return responder({ ok: true })
      }

      case 'cambiar_contrasena': {
        if (!esUuid(body.id)) return fallo('Usuario no válido.')
        const errClave = validarContrasena(body.password); if (errClave) return fallo(errClave)
        const { error } = await admin.auth.admin.updateUserById(body.id, { password: body.password as string })
        if (error) return fallo('No se pudo cambiar la contraseña.')
        return responder({ ok: true })
      }

      default:
        return fallo('Acción no reconocida.', 400)
    }
  } catch (err) {
    console.error('admin-usuarios:', err)
    return fallo('Error inesperado en el servidor.', 500)
  }
})
