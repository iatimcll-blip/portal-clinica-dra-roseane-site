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
