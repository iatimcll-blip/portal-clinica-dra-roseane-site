const ABA_ACESSOS = 'Acessos'
const ABA_LEITURAS = 'Leituras de Materiais'
const CABECALHO_LEITURAS = [
  'Registrado em',
  'E-mail',
  'Nome',
  'Perfil',
  'ID do perfil',
  'ID do material',
  'Título do material',
  'Arquivo',
  'Categoria',
  'Página',
  'Origem',
  'Navegador',
]

function doPost(e) {
  const lock = LockService.getScriptLock()
  lock.waitLock(10000)

  try {
    const payload = JSON.parse(e.postData.contents)
    const ss = SpreadsheetApp.getActiveSpreadsheet()

    if (payload.tipo === 'acesso') {
      const sheet = getOrCreateSheet_(ss, ABA_ACESSOS, [
        'Registrado em',
        'E-mail',
        'Nome',
        'Perfil',
        'ID do perfil',
        'Destino',
        'Página',
        'Origem',
        'Navegador',
      ])
      prepararColunaDataHora_(sheet)

      sheet.appendRow([
        formatarDataHoraBrasil_(payload.registrado_em),
        payload.email || '',
        payload.nome || '',
        payload.perfil || '',
        payload.profile_id || '',
        payload.destino || '',
        payload.pagina || '',
        payload.origem || '',
        payload.user_agent || '',
      ])
    }

    if (payload.tipo === 'leitura_material') {
      const linhaLeitura = criarLinhaLeitura_(payload)
      const sheet = getOrCreateSheet_(ss, ABA_LEITURAS, CABECALHO_LEITURAS)

      const nomeAbaMaterial = criarNomeAbaMaterial_(payload)
      const sheetMaterial = getOrCreateSheet_(ss, nomeAbaMaterial, CABECALHO_LEITURAS)
      prepararColunaDataHora_(sheet)
      prepararColunaDataHora_(sheetMaterial)

      if (termoJaAssinado_(sheet, payload)) {
        return ContentService
          .createTextOutput(JSON.stringify({ ok: true, status: 'termo_ja_assinado' }))
          .setMimeType(ContentService.MimeType.JSON)
      }

      sheet.appendRow(linhaLeitura)
      if (!termoJaAssinado_(sheetMaterial, payload)) {
        sheetMaterial.appendRow(linhaLeitura)
      }
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON)
  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(error) }))
      .setMimeType(ContentService.MimeType.JSON)
  } finally {
    lock.releaseLock()
  }
}

function criarLinhaLeitura_(payload) {
  return [
    formatarDataHoraBrasil_(payload.registrado_em),
    payload.email || '',
    payload.nome || '',
    payload.perfil || '',
    payload.profile_id || '',
    payload.material_id || '',
    payload.material_titulo || '',
    payload.material_arquivo || '',
    payload.material_categoria || '',
    payload.pagina || '',
    payload.origem || '',
    payload.user_agent || '',
  ]
}

function formatarDataHoraBrasil_(valor) {
  const data = valor ? new Date(valor) : new Date()
  if (isNaN(data.getTime())) {
    return Utilities.formatDate(new Date(), 'America/Fortaleza', 'dd/MM/yyyy HH:mm:ss')
  }

  return Utilities.formatDate(data, 'America/Fortaleza', 'dd/MM/yyyy HH:mm:ss')
}

function prepararColunaDataHora_(sheet) {
  sheet.getRange('A:A').setNumberFormat('@')
}

function termoJaAssinado_(sheet, payload) {
  const lastRow = sheet.getLastRow()
  if (lastRow < 2) return false

  const registros = sheet.getRange(2, 5, lastRow - 1, 2).getValues()
  const profileId = String(payload.profile_id || '')
  const materialId = String(payload.material_id || '')

  return registros.some(row => String(row[0] || '') === profileId && String(row[1] || '') === materialId)
}

function criarNomeAbaMaterial_(payload) {
  const base = payload.material_titulo || payload.material_arquivo || `Material ${payload.material_id || ''}`
  const limpo = String(base)
    .replace(/[\[\]\:\*\?\/\\]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 85)

  return `Ciência - ${limpo || 'Material'}`
}

function getOrCreateSheet_(ss, name, headers) {
  let sheet = ss.getSheetByName(name)
  if (!sheet) sheet = ss.insertSheet(name)

  const currentHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0]
  const needsHeaders = currentHeaders.every(value => value === '')
  if (needsHeaders) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    sheet.setFrozenRows(1)
  }

  return sheet
}
