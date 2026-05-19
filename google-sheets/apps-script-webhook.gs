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

      sheet.appendRow([
        payload.registrado_em || new Date().toISOString(),
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
      sheet.appendRow(linhaLeitura)

      const nomeAbaMaterial = criarNomeAbaMaterial_(payload)
      const sheetMaterial = getOrCreateSheet_(ss, nomeAbaMaterial, CABECALHO_LEITURAS)
      sheetMaterial.appendRow(linhaLeitura)
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
    payload.registrado_em || new Date().toISOString(),
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
