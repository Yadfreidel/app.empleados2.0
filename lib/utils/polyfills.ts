// lib/utils/polyfills.ts
// crypto.randomUUID() solo existe en contextos seguros (https o localhost). Al
// abrir la app desde la red local (http://IP-del-PC:3000) no está disponible y
// fallaban las fotos, el chat y el cierre de operativos. crypto.getRandomValues
// sí funciona sin https, así que se genera un UUID v4 equivalente.
if (typeof crypto !== 'undefined' && typeof crypto.randomUUID !== 'function' && typeof crypto.getRandomValues === 'function') {
  Object.defineProperty(crypto, 'randomUUID', {
    configurable: true,
    writable: true,
    value: function randomUUID(): `${string}-${string}-${string}-${string}-${string}` {
      const b = crypto.getRandomValues(new Uint8Array(16))
      b[6] = (b[6] & 0x0f) | 0x40 // versión 4
      b[8] = (b[8] & 0x3f) | 0x80 // variante RFC 4122
      const h = Array.from(b, x => x.toString(16).padStart(2, '0'))
      return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10).join('')}` as `${string}-${string}-${string}-${string}-${string}`
    },
  })
}

export {}
