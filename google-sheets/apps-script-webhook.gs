var ABA_ACESSOS = 'Acessos'
var ABA_LEITURAS = 'Leituras de Materiais'

var CABECALHO_LEITURAS = [
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
  var lock = LockService.getScriptLock()
  lock.waitLock(10000)

  try {
    var payload = JSON.parse(e.postData.contents)
    var ss = SpreadsheetApp.getActiveSpreadsheet()

    if (payload.tipo === 'acesso') {
      var sheetAcessos = getOrCreateSheet_(ss, ABA_ACESSOS, [
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

      prepararColunaDataHora_(sheetAcessos)
      sheetAcessos.appendRow([
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
      var linhaLeitura = criarLinhaLeitura_(payload)
      var sheetLeituras = getOrCreateSheet_(ss, ABA_LEITURAS, CABECALHO_LEITURAS)
      var nomeAbaMaterial = criarNomeAbaMaterial_(payload)
      var sheetMaterial = getOrCreateSheet_(ss, nomeAbaMaterial, CABECALHO_LEITURAS)

      prepararColunaDataHora_(sheetLeituras)
      prepararColunaDataHora_(sheetMaterial)

      if (termoJaAssinado_(sheetLeituras, payload)) {
        return ContentService
          .createTextOutput(JSON.stringify({ ok: true, status: 'termo_ja_assinado' }))
          .setMimeType(ContentService.MimeType.JSON)
      }

      sheetLeituras.appendRow(linhaLeitura)

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

function testarAcesso() {
  var e = {
    postData: {
      contents: JSON.stringify({
        tipo: 'acesso',
        registrado_em: new Date().toISOString(),
        email: 'gestao@clinica.com',
        nome: 'Gestão',
        perfil: 'gestao',
        profile_id: 'teste-gestao',
        destino: '/admin',
        pagina: '/login',
        origem: 'teste-manual',
        user_agent: 'Apps Script',
      }),
    },
  }

  return doPost(e)
}

function testarLeituraMaterial() {
  var e = {
    postData: {
      contents: JSON.stringify({
        tipo: 'leitura_material',
        registrado_em: new Date().toISOString(),
        email: 'tayane@clinica.com',
        nome: 'Tayane Borges De Sousa',
        perfil: 'user',
        profile_id: 'teste-tayane',
        material_id: 999001,
        material_titulo: 'Teste de Ciência Codex',
        material_arquivo: 'teste-ciencia-codex.pdf',
        material_categoria: 'Comunicados',
        pagina: '/painel',
        origem: 'teste-manual',
        user_agent: 'Apps Script',
      }),
    },
  }

  return doPost(e)
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
  var data = valor ? new Date(valor) : new Date()

  if (isNaN(data.getTime())) {
    return Utilities.formatDate(new Date(), 'America/Fortaleza', 'dd/MM/yyyy HH:mm:ss')
  }

  return Utilities.formatDate(data, 'America/Fortaleza', 'dd/MM/yyyy HH:mm:ss')
}

function prepararColunaDataHora_(sheet) {
  sheet.getRange('A:A').setNumberFormat('@')
}

function termoJaAssinado_(sheet, payload) {
  var lastRow = sheet.getLastRow()
  if (lastRow < 2) return false

  var registros = sheet.getRange(2, 5, lastRow - 1, 2).getValues()
  var profileId = String(payload.profile_id || '')
  var materialId = String(payload.material_id || '')

  return registros.some(function(row) {
    return String(row[0] || '') === profileId && String(row[1] || '') === materialId
  })
}

function criarNomeAbaMaterial_(payload) {
  var base = payload.material_titulo || payload.material_arquivo || ('Material ' + (payload.material_id || ''))
  var limpo = String(base)
    .replace(/[\[\]\:\*\?\/\\]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 85)

  return 'Ciência - ' + (limpo || 'Material')
}

function getOrCreateSheet_(ss, name, headers) {
  var sheet = ss.getSheetByName(name)
  if (!sheet) sheet = ss.insertSheet(name)

  var currentHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0]
  var needsHeaders = currentHeaders.every(function(value) {
    return value === ''
  })

  if (needsHeaders) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    sheet.setFrozenRows(1)
  }

  return sheet
}
