import type { MaterialInformativo, Profile } from '@/lib/types'

export const CATEGORIA_FOLHA_PONTO_D1 = 'Folha de Ponto D-1'

export type FolhaPontoD1 = {
  material_id: number
  material_titulo: string
  material_arquivo: string
  pagina: number
  nome: string
  nome_normalizado: string
  periodo: string
  horas_batidas: string
  horas_previstas: string
  horas_com_abono: string
  saldo_periodo: string
  saldo_minutos: number
  extras_total: string
  faltas_horas: string
  dias_faltosos: number | null
}

function limparTexto(valor: string) {
  return valor.trim().replace(/\s+/g, ' ')
}

export function normalizarNomePonto(valor: string) {
  return limparTexto(valor)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase()
}

export function isFolhaPontoD1(material: Pick<MaterialInformativo, 'categoria'>) {
  return normalizarNomePonto(material.categoria ?? '') === normalizarNomePonto(CATEGORIA_FOLHA_PONTO_D1)
}

function minutosDeHora(valor: string) {
  const match = valor.match(/^(-?)(\d{1,4}):(\d{2})$/)
  if (!match) return 0
  const sinal = match[1] === '-' ? -1 : 1
  return sinal * (Number(match[2]) * 60 + Number(match[3]))
}

export function formatarMinutosPonto(minutos: number) {
  const sinal = minutos < 0 ? '-' : ''
  const absoluto = Math.abs(minutos)
  const horas = Math.floor(absoluto / 60)
  const mins = absoluto % 60
  return `${sinal}${String(horas).padStart(2, '0')}:${String(mins).padStart(2, '0')}`
}

function valorAposRotulo(linhas: string[], rotulo: string) {
  const rotuloNormalizado = normalizarNomePonto(rotulo)
  const indice = linhas.findIndex(linha => normalizarNomePonto(linha).includes(rotuloNormalizado))
  if (indice < 0) return ''

  const mesmaLinha = linhas[indice].match(/(-?\d{1,4}:\d{2})/)
  if (mesmaLinha) return mesmaLinha[1]

  for (let i = indice + 1; i < Math.min(linhas.length, indice + 4); i += 1) {
    const match = linhas[i].match(/(-?\d{1,4}:\d{2})/)
    if (match) return match[1]
  }

  return ''
}

function extrairNome(linhas: string[]) {
  const idx = linhas.findIndex(linha => normalizarNomePonto(linha).includes('DADOS DO COLABORADOR'))
  const candidatos = idx >= 0 ? linhas.slice(idx + 1, idx + 5) : linhas
  const nome = candidatos.find(linha => {
    const normalizado = normalizarNomePonto(linha)
    return normalizado.length > 3
      && !normalizado.startsWith('FUNCAO')
      && !normalizado.startsWith('NOME')
      && !normalizado.includes('DIA MES')
  })

  return limparTexto(nome ?? '')
}

function extrairTotais(texto: string, nome: string) {
  const nomeEscapado = nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const porNome = nome
    ? texto.match(new RegExp(`(\\d{1,4}:\\d{2})\\s+(\\d{1,4}:\\d{2})\\s*\\n\\s*${nomeEscapado}`, 'i'))
    : null

  if (porNome) return { batidas: porNome[1], previstas: porNome[2] }

  const matches = [...texto.matchAll(/(\d{1,4}:\d{2})\s+(\d{1,4}:\d{2})/g)]
  const ultimo = matches.at(-1)
  return { batidas: ultimo?.[1] ?? '00:00', previstas: ultimo?.[2] ?? '00:00' }
}

export function analisarPaginasFolhaPontoD1(
  paginas: string[],
  material: Pick<MaterialInformativo, 'id' | 'titulo' | 'file_name'>,
): FolhaPontoD1[] {
  return paginas.map((textoOriginal, index) => {
    const texto = textoOriginal.replace(/\r/g, '')
    const linhas = texto.split('\n').map(limparTexto).filter(Boolean)
    const nome = extrairNome(linhas)
    const periodo = texto.match(/(\d{2}\/\d{2}\/\d{4})\s+a\s+(\d{2}\/\d{2}\/\d{4})/)?.slice(1, 3).join(' a ') ?? ''
    const totais = extrairTotais(texto, nome)
    const horasComAbono = texto.match(/(\d{1,4}:\d{2})\s*Trabalhadas \+ Abono/i)?.[1] ?? totais.batidas
    const saldoMinutos = minutosDeHora(horasComAbono) - minutosDeHora(totais.previstas)
    const diasFaltososMatch = texto.match(/Dias Faltosos:\s*(\d+)/i)

    return {
      material_id: material.id,
      material_titulo: material.titulo,
      material_arquivo: material.file_name,
      pagina: index + 1,
      nome,
      nome_normalizado: normalizarNomePonto(nome),
      periodo,
      horas_batidas: totais.batidas,
      horas_previstas: totais.previstas,
      horas_com_abono: horasComAbono,
      saldo_periodo: formatarMinutosPonto(saldoMinutos),
      saldo_minutos: saldoMinutos,
      extras_total: valorAposRotulo(linhas, 'Total') || '00:00',
      faltas_horas: valorAposRotulo(linhas, 'Faltas em Horas') || '00:00',
      dias_faltosos: diasFaltososMatch ? Number(diasFaltososMatch[1]) : null,
    }
  }).filter(folha => folha.nome)
}

export async function extrairFolhasPontoD1DePdf(
  url: string,
  material: Pick<MaterialInformativo, 'id' | 'titulo' | 'file_name'>,
) {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

  const documento = await pdfjs.getDocument({ url }).promise
  const paginas: string[] = []

  for (let pageNumber = 1; pageNumber <= documento.numPages; pageNumber += 1) {
    const pagina = await documento.getPage(pageNumber)
    const conteudo = await pagina.getTextContent()
    const texto = conteudo.items
      .map(item => ('str' in item ? item.str : ''))
      .join('\n')
    paginas.push(texto)
  }

  return analisarPaginasFolhaPontoD1(paginas, material)
}

export function encontrarFolhaDoProfissional(folhas: FolhaPontoD1[], profile: Profile | null) {
  if (!profile) return null
  const nomeProfile = normalizarNomePonto(profile.nome)
  return folhas.find(folha => folha.nome_normalizado === nomeProfile)
    ?? folhas.find(folha => folha.nome_normalizado.includes(nomeProfile) || nomeProfile.includes(folha.nome_normalizado))
    ?? null
}
