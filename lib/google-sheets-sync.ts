type SheetsEventBase = {
  email?: string | null
  nome?: string | null
  perfil?: string | null
  profile_id?: string | null
}

type AccessEvent = SheetsEventBase & {
  tipo: 'acesso'
  destino?: string
}

type MaterialReadEvent = SheetsEventBase & {
  tipo: 'leitura_material'
  material_id: number
  material_titulo: string
  material_arquivo: string
  material_categoria?: string | null
}

type SheetsEvent = AccessEvent | MaterialReadEvent

const GOOGLE_SHEETS_WEBHOOK_URL = process.env.NEXT_PUBLIC_GOOGLE_SHEETS_WEBHOOK_URL

type JsonpResponse<T> = {
  ok: boolean
  data?: T
  error?: string
}

type GoogleSheetsReadRow = {
  registrado_em?: string
  email?: string
  nome?: string
  perfil?: string
  profile_id?: string
  material_id?: string | number
  material_titulo?: string
  material_arquivo?: string
  categoria?: string
}

export function registrarEventoGoogleSheets(evento: SheetsEvent) {
  if (!GOOGLE_SHEETS_WEBHOOK_URL || typeof window === 'undefined') return

  const payload = JSON.stringify({
    ...evento,
    origem: 'portal-clinica',
    registrado_em: new Date().toISOString(),
    pagina: window.location.pathname,
    user_agent: window.navigator.userAgent,
  })

  if (navigator.sendBeacon) {
    const blob = new Blob([payload], { type: 'text/plain;charset=UTF-8' })
    navigator.sendBeacon(GOOGLE_SHEETS_WEBHOOK_URL, blob)
    return
  }

  fetch(GOOGLE_SHEETS_WEBHOOK_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: payload,
    keepalive: true,
  }).catch(() => {
    // O Google Sheets e apenas um espelho; o Supabase continua sendo a fonte principal.
  })
}

export function buscarLeiturasMateriaisGoogleSheets(): Promise<GoogleSheetsReadRow[]> {
  if (!GOOGLE_SHEETS_WEBHOOK_URL || typeof window === 'undefined') return Promise.resolve([])

  return new Promise((resolve, reject) => {
    const callbackName = `googleSheetsLeituras_${Date.now()}_${Math.random().toString(36).slice(2)}`
    const script = document.createElement('script')
    const timeout = window.setTimeout(() => {
      cleanup()
      reject(new Error('Tempo esgotado ao consultar o Google Sheets.'))
    }, 6000)

    function cleanup() {
      window.clearTimeout(timeout)
      script.remove()
      delete (window as unknown as Record<string, unknown>)[callbackName]
    }

    ;(window as unknown as Record<string, (payload: JsonpResponse<GoogleSheetsReadRow[]>) => void>)[callbackName] = payload => {
      cleanup()
      if (!payload?.ok) {
        reject(new Error(payload?.error || 'Nao foi possivel consultar o Google Sheets.'))
        return
      }
      resolve(payload.data ?? [])
    }

    const url = new URL(GOOGLE_SHEETS_WEBHOOK_URL)
    url.searchParams.set('tipo', 'leituras_materiais')
    url.searchParams.set('callback', callbackName)
    script.src = url.toString()
    script.onerror = () => {
      cleanup()
      reject(new Error('Nao foi possivel carregar o retorno do Google Sheets.'))
    }

    document.body.appendChild(script)
  })
}
