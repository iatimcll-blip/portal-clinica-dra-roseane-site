var ABA_ACESSOS = 'Acessos'
var ABA_LEITURAS = 'Leituras de Materiais'
var ABA_MENSAGENS = 'Mensagens'
var ABA_RESET_SENHAS = 'Reset de Senhas'
var ABA_AUTOAVALIACAO_CONFIG = 'Autoavaliacao Config'
var ABA_AUTOAVALIACAO_RESPOSTAS = 'Autoavaliacao Respostas'

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

var CABECALHO_MENSAGENS = [
  'Registrado em',
  'E-mail',
  'Nome',
  'Perfil',
  'ID do perfil',
  'Mensagem',
  'Destino',
  'Pagina',
  'Origem',
  'Navegador',
]

var CABECALHO_RESET_SENHAS = [
  'Registrado em',
  'E-mail solicitado',
  'Nome profissional',
  'ID profissional',
  'Senha temporária',
  'Status',
  'Solicitado por',
  'Perfil solicitante',
  'Observação',
  'Página',
  'Origem',
  'Navegador',
]

var CABECALHO_AUTOAVALIACAO_CONFIG = [
  'Atualizado em',
  'Liberado',
  'Periodo',
  'Inicio',
  'Fim',
  'Origem',
  'Navegador',
]

var CABECALHO_AUTOAVALIACAO_RESPOSTAS = [
  'Registrado em',
  'Periodo',
  'E-mail',
  'Nome',
  'Perfil',
  'ID do perfil',
  'Media criterios',
  'Desempenho geral',
  'Notas JSON',
  'Respostas JSON',
  'Origem',
  'Navegador',
]

function doGet(e) {
  try {
    var tipo = e && e.parameter ? e.parameter.tipo : ''
    var callback = e && e.parameter ? e.parameter.callback : ''
    var acao = e && e.parameter ? e.parameter.acao : ''

    if (acao === 'registrar_mensagem') {
      var payloadMensagem = JSON.parse(e.parameter.payload || '{}')
      registrarMensagem_(payloadMensagem)

      return responderJson_({ ok: true, data: { status: 'mensagem_registrada' } }, callback)
    }

    if (acao === 'autoavaliacao_config') {
      var payloadConfig = JSON.parse(e.parameter.payload || '{}')
      atualizarAutoavaliacaoConfig_(payloadConfig)

      return responderJson_({ ok: true, data: { status: 'autoavaliacao_config_atualizada' } }, callback)
    }

    if (acao === 'registrar_autoavaliacao') {
      var payloadAutoavaliacao = JSON.parse(e.parameter.payload || '{}')
      registrarAutoavaliacao_(payloadAutoavaliacao)

      return responderJson_({ ok: true, data: { status: 'autoavaliacao_registrada' } }, callback)
    }

    if (tipo === 'autoavaliacao_config') {
      return responderJson_({ ok: true, data: obterAutoavaliacaoConfig_() }, callback)
    }

    if (tipo === 'autoavaliacao_respostas') {
      return responderJson_({ ok: true, data: listarAutoavaliacoes_() }, callback)
    }

    if (tipo === 'mensagens') {
      var ssMensagens = SpreadsheetApp.getActiveSpreadsheet()
      var sheetMensagens = getOrCreateSheet_(ssMensagens, ABA_MENSAGENS, CABECALHO_MENSAGENS)
      var mensagens = listarMensagens_(sheetMensagens)

      return responderJson_({ ok: true, data: mensagens }, callback)
    }

    if (tipo !== 'leituras_materiais') {
      return responderJson_({ ok: false, error: 'Tipo de consulta invalido.' }, callback)
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet()
    var sheetLeituras = getOrCreateSheet_(ss, ABA_LEITURAS, CABECALHO_LEITURAS)
    var data = listarLeiturasMateriaisUnicas_(sheetLeituras)

    return responderJson_({ ok: true, data: data }, callback)
  } catch (error) {
    return responderJson_({ ok: false, error: String(error) }, e && e.parameter ? e.parameter.callback : '')
  }
}

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

    if (payload.tipo === 'mensagem_texto') {
      registrarMensagem_(payload, ss)
    }

    if (payload.tipo === 'reset_senha') {
      registrarResetSenha_(payload, ss)
    }

    if (payload.tipo === 'autoavaliacao_resposta') {
      registrarAutoavaliacao_(payload, ss)
    }

    if (payload.tipo === 'autoavaliacao_config') {
      atualizarAutoavaliacaoConfig_(payload, ss)
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

function listarLeiturasMateriaisUnicas_(sheet) {
  var lastRow = sheet.getLastRow()
  if (lastRow < 2) return []

  var rows = sheet.getRange(2, 1, lastRow - 1, CABECALHO_LEITURAS.length).getValues()
  var mapa = {}
  var saida = []

  rows.forEach(function(row) {
    var nome = normalizarChave_(row[2])
    var titulo = normalizarChave_(row[6])
    if (!nome || !titulo) return

    var chave = nome + ':' + titulo
    if (mapa[chave]) return
    mapa[chave] = true

    saida.push({
      registrado_em: String(row[0] || ''),
      email: String(row[1] || ''),
      nome: String(row[2] || ''),
      perfil: String(row[3] || ''),
      profile_id: String(row[4] || ''),
      material_id: String(row[5] || ''),
      material_titulo: String(row[6] || ''),
      material_arquivo: String(row[7] || ''),
      categoria: String(row[8] || ''),
    })
  })

  return saida
}

function listarMensagens_(sheet) {
  var lastRow = sheet.getLastRow()
  if (lastRow < 2) return []

  var rows = sheet.getRange(2, 1, lastRow - 1, CABECALHO_MENSAGENS.length).getValues()
  return rows
    .filter(function(row) {
      return String(row[5] || '').trim() !== ''
    })
    .map(function(row) {
      return {
        registrado_em: String(row[0] || ''),
        email: String(row[1] || ''),
        nome: String(row[2] || ''),
        perfil: String(row[3] || ''),
        profile_id: String(row[4] || ''),
        mensagem: String(row[5] || ''),
        destino: String(row[6] || ''),
        pagina: String(row[7] || ''),
      }
    })
    .reverse()
}

function registrarMensagem_(payload, ss) {
  var planilha = ss || SpreadsheetApp.getActiveSpreadsheet()
  var sheetMensagens = getOrCreateSheet_(planilha, ABA_MENSAGENS, CABECALHO_MENSAGENS)

  prepararColunaDataHora_(sheetMensagens)
  sheetMensagens.appendRow([
    formatarDataHoraBrasil_(payload.registrado_em),
    payload.email || '',
    payload.nome || '',
    payload.perfil || '',
    payload.profile_id || '',
    payload.mensagem || '',
    payload.destino || 'admin',
    payload.pagina || '',
    payload.origem || '',
    payload.user_agent || '',
  ])
}

function registrarResetSenha_(payload, ss) {
  var planilha = ss || SpreadsheetApp.getActiveSpreadsheet()
  var sheetReset = getOrCreateSheet_(planilha, ABA_RESET_SENHAS, CABECALHO_RESET_SENHAS)

  prepararColunaDataHora_(sheetReset)
  sheetReset.appendRow([
    formatarDataHoraBrasil_(payload.registrado_em),
    payload.email_profissional || payload.email || '',
    payload.nome_profissional || '',
    payload.profile_id_profissional || '',
    payload.senha_temporaria || '',
    payload.status || '',
    payload.nome || '',
    payload.perfil || '',
    payload.observacao || '',
    payload.pagina || '',
    payload.origem || '',
    payload.user_agent || '',
  ])
}

function obterAutoavaliacaoConfig_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet()
  var sheetConfig = getOrCreateSheet_(ss, ABA_AUTOAVALIACAO_CONFIG, CABECALHO_AUTOAVALIACAO_CONFIG)
  var lastRow = sheetConfig.getLastRow()

  if (lastRow < 2) {
    return {
      liberado: false,
      periodo: '',
      data_inicio: '',
      data_fim: '',
    }
  }

  var row = sheetConfig.getRange(lastRow, 1, 1, CABECALHO_AUTOAVALIACAO_CONFIG.length).getValues()[0]
  return {
    liberado: String(row[1] || '').toLowerCase() === 'sim',
    periodo: String(row[2] || ''),
    data_inicio: formatarDataISO_(row[3]),
    data_fim: formatarDataISO_(row[4]),
    liberado_em: String(row[0] || ''),
  }
}

function atualizarAutoavaliacaoConfig_(payload, ss) {
  var planilha = ss || SpreadsheetApp.getActiveSpreadsheet()
  var sheetConfig = getOrCreateSheet_(planilha, ABA_AUTOAVALIACAO_CONFIG, CABECALHO_AUTOAVALIACAO_CONFIG)

  prepararColunaDataHora_(sheetConfig)
  sheetConfig.appendRow([
    formatarDataHoraBrasil_(payload.registrado_em),
    payload.liberado ? 'Sim' : 'Nao',
    payload.periodo || '',
    payload.data_inicio || '',
    payload.data_fim || '',
    payload.origem || '',
    payload.user_agent || '',
  ])
}

function registrarAutoavaliacao_(payload, ss) {
  var planilha = ss || SpreadsheetApp.getActiveSpreadsheet()
  var sheetRespostas = getOrCreateSheet_(planilha, ABA_AUTOAVALIACAO_RESPOSTAS, CABECALHO_AUTOAVALIACAO_RESPOSTAS)

  prepararColunaDataHora_(sheetRespostas)
  removerAutoavaliacaoAnterior_(sheetRespostas, payload)
  sheetRespostas.appendRow([
    formatarDataHoraBrasil_(payload.registrado_em),
    payload.periodo || '',
    payload.email || '',
    payload.nome || '',
    payload.perfil || '',
    payload.profile_id || '',
    payload.media || '',
    payload.desempenho_geral || '',
    JSON.stringify(payload.notas || {}),
    JSON.stringify(payload.textos || {}),
    payload.origem || '',
    payload.user_agent || '',
  ])
}

function removerAutoavaliacaoAnterior_(sheet, payload) {
  var lastRow = sheet.getLastRow()
  if (lastRow < 2) return

  var profileId = String(payload.profile_id || '')
  var periodo = String(payload.periodo || '')
  var rows = sheet.getRange(2, 2, lastRow - 1, 5).getValues()

  for (var i = rows.length - 1; i >= 0; i -= 1) {
    var rowPeriodo = String(rows[i][0] || '')
    var rowProfileId = String(rows[i][4] || '')
    if (rowPeriodo === periodo && rowProfileId === profileId) {
      sheet.deleteRow(i + 2)
    }
  }
}

function listarAutoavaliacoes_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet()
  var sheetRespostas = getOrCreateSheet_(ss, ABA_AUTOAVALIACAO_RESPOSTAS, CABECALHO_AUTOAVALIACAO_RESPOSTAS)
  var lastRow = sheetRespostas.getLastRow()
  if (lastRow < 2) return []

  var rows = sheetRespostas.getRange(2, 1, lastRow - 1, CABECALHO_AUTOAVALIACAO_RESPOSTAS.length).getValues()
  return rows.map(function(row) {
    return {
      registrado_em: String(row[0] || ''),
      periodo: String(row[1] || ''),
      email: String(row[2] || ''),
      nome: String(row[3] || ''),
      perfil: String(row[4] || ''),
      profile_id: String(row[5] || ''),
      media: Number(row[6] || 0),
      desempenho_geral: Number(row[7] || 0),
      notas: parseJsonSeguro_(row[8]),
      textos: parseJsonSeguro_(row[9]),
    }
  }).reverse()
}

function parseJsonSeguro_(valor) {
  try {
    return JSON.parse(String(valor || '{}'))
  } catch (error) {
    return {}
  }
}

function normalizarChave_(valor) {
  return String(valor || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function responderJson_(payload, callback) {
  var body = JSON.stringify(payload)
  var output = callback
    ? ContentService.createTextOutput(String(callback).replace(/[^\w.$]/g, '') + '(' + body + ');')
    : ContentService.createTextOutput(body)

  return output.setMimeType(callback ? ContentService.MimeType.JAVASCRIPT : ContentService.MimeType.JSON)
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

function testarMensagem() {
  var e = {
    postData: {
      contents: JSON.stringify({
        tipo: 'mensagem_texto',
        registrado_em: new Date().toISOString(),
        email: 'gestao@clinica.com',
        nome: 'Gestao',
        perfil: 'gestao',
        profile_id: 'teste-gestao',
        mensagem: 'Mensagem de teste para o Admin.',
        destino: 'admin',
        pagina: '/admin',
        origem: 'teste-manual',
        user_agent: 'Apps Script',
      }),
    },
  }

  return doPost(e)
}

function testarResetSenha() {
  var e = {
    postData: {
      contents: JSON.stringify({
        tipo: 'reset_senha',
        registrado_em: new Date().toISOString(),
        email: 'admin@clinica.com',
        nome: 'Admin',
        perfil: 'admin',
        profile_id: '',
        email_profissional: 'tayane@clinica.com',
        nome_profissional: 'Tayane Borges De Sousa',
        profile_id_profissional: 'teste-tayane',
        senha_temporaria: 'Tayane@2026!',
        status: 'senha_atualizada',
        observacao: 'Teste de registro de senha temporaria pelo Apps Script.',
        pagina: '/admin/editar',
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

function formatarDataISO_(valor) {
  if (!valor) return ''
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor

  var data = valor instanceof Date ? valor : new Date(valor)
  if (isNaN(data.getTime())) return ''

  return Utilities.formatDate(data, 'America/Fortaleza', 'yyyy-MM-dd')
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
  var missingHeaders = headers.some(function(value, index) {
    return String(currentHeaders[index] || '') !== String(value || '')
  })

  if (needsHeaders || missingHeaders) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers])
    sheet.setFrozenRows(1)
  }

  return sheet
}
