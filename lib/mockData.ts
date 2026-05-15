export const MESES_LISTA = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
]

export const META_INDIVIDUAL_ANUAL = 187000
export const META_GATILHO = 15000
export const META_MAX = 18000
export const META_CLINICA = 55000

export type Profissional = {
  nome: string
  primeiroNome: string
  realizado: number
  comissaoAvaliacoes?: number
}

export type DadosMes = {
  mes: string
  faturamento: number
  metaClinica: number
  metaGatilho: number
  metaMax: number
  profissionais: Profissional[]
}

// Dados históricos por mês — usados para calcular acumulado anual
export const DADOS_POR_MES: DadosMes[] = [
  {
    mes: 'JANEIRO',
    faturamento: 52340.00,
    metaClinica: 55000,
    metaGatilho: 15000,
    metaMax: 18000,
    profissionais: [
      { nome: 'Kelly Lavinya Silva Nascimento Sousa',   primeiroNome: 'Kelly',   realizado: 22800.00, comissaoAvaliacoes: 0 },
      { nome: 'Tayane Borges De Sousa',                  primeiroNome: 'Tayane',  realizado: 16200.00, comissaoAvaliacoes: 0 },
      { nome: 'Maria Williara De Castro Silva',           primeiroNome: 'Maria',   realizado: 8300.00,  comissaoAvaliacoes: 0 },
      { nome: 'Erica Peres Ciriaco',                     primeiroNome: 'Erica',   realizado: 2900.00,  comissaoAvaliacoes: 320.00 },
      { nome: 'Gilmara Sousa Cavalcante',                primeiroNome: 'Gilmara', realizado: 2140.00,  comissaoAvaliacoes: 410.00 },
    ],
  },
  {
    mes: 'FEVEREIRO',
    faturamento: 49870.50,
    metaClinica: 55000,
    metaGatilho: 15000,
    metaMax: 18000,
    profissionais: [
      { nome: 'Kelly Lavinya Silva Nascimento Sousa',   primeiroNome: 'Kelly',   realizado: 20470.00, comissaoAvaliacoes: 0 },
      { nome: 'Tayane Borges De Sousa',                  primeiroNome: 'Tayane',  realizado: 15238.05, comissaoAvaliacoes: 0 },
      { nome: 'Maria Williara De Castro Silva',           primeiroNome: 'Maria',   realizado: 9236.39,  comissaoAvaliacoes: 0 },
      { nome: 'Erica Peres Ciriaco',                     primeiroNome: 'Erica',   realizado: 2724.00,  comissaoAvaliacoes: 390.00 },
      { nome: 'Gilmara Sousa Cavalcante',                primeiroNome: 'Gilmara', realizado: 2202.06,  comissaoAvaliacoes: 460.00 },
    ],
  },
  {
    mes: 'MARÇO',
    faturamento: 68210.00,
    metaClinica: 55000,
    metaGatilho: 15000,
    metaMax: 18000,
    profissionais: [
      { nome: 'Kelly Lavinya Silva Nascimento Sousa',   primeiroNome: 'Kelly',   realizado: 22001.00, comissaoAvaliacoes: 0 },
      { nome: 'Tayane Borges De Sousa',                  primeiroNome: 'Tayane',  realizado: 18000.00, comissaoAvaliacoes: 0 },
      { nome: 'Maria Williara De Castro Silva',           primeiroNome: 'Maria',   realizado: 9000.00,  comissaoAvaliacoes: 0 },
      { nome: 'Erica Peres Ciriaco',                     primeiroNome: 'Erica',   realizado: 0.00,     comissaoAvaliacoes: 0 },
      { nome: 'Gilmara Sousa Cavalcante',                primeiroNome: 'Gilmara', realizado: 0.00,     comissaoAvaliacoes: 0 },
    ],
  },
  {
    mes: 'ABRIL',
    faturamento: 74586.88,
    metaClinica: 55000,
    metaGatilho: 15000,
    metaMax: 18000,
    profissionais: [
      { nome: 'Kelly Lavinya Silva Nascimento Sousa',   primeiroNome: 'Kelly',   realizado: 35615.70, comissaoAvaliacoes: 0 },
      { nome: 'Tayane Borges De Sousa',                  primeiroNome: 'Tayane',  realizado: 20824.19, comissaoAvaliacoes: 0 },
      { nome: 'Maria Williara De Castro Silva',           primeiroNome: 'Maria',   realizado: 12909.19, comissaoAvaliacoes: 0 },
      { nome: 'Erica Peres Ciriaco',                     primeiroNome: 'Erica',   realizado: 2690.90,  comissaoAvaliacoes: 429.72 },
      { nome: 'Gilmara Sousa Cavalcante',                primeiroNome: 'Gilmara', realizado: 2546.90,  comissaoAvaliacoes: 517.86 },
    ],
  },
]

// --- Funções de cálculo ---

export function calcBonus(realizado: number, metaGatilho: number, metaMax: number): number {
  if (realizado >= metaMax) return 1350
  if (realizado >= metaGatilho) return realizado * 0.075
  return realizado * 0.075
}

export function calcStatus(realizado: number, metaGatilho: number, metaMax: number): string {
  if (realizado >= metaMax) return 'Acima da meta'
  if (realizado >= metaGatilho) return 'Acima do gatilho'
  return 'Abaixo do gatilho'
}

export function calcPctGatilho(realizado: number, metaGatilho: number): number {
  return parseFloat(((realizado / metaGatilho) * 100).toFixed(1))
}

export function calcPctMeta(realizado: number, metaMax: number): number {
  return parseFloat(((realizado / metaMax) * 100).toFixed(1))
}

// Retorna ranking mensal calculado para um mês
export function getRankingMensal(dadosMes: DadosMes) {
  return [...dadosMes.profissionais]
    .sort((a, b) => b.realizado - a.realizado)
    .map((p, i) => ({
      pos: i + 1,
      nome: p.nome,
      primeiroNome: p.primeiroNome,
      realizado: p.realizado,
      comissaoAvaliacoes: p.comissaoAvaliacoes ?? 0,
      pctGatilho: calcPctGatilho(p.realizado, dadosMes.metaGatilho),
      pctMeta: calcPctMeta(p.realizado, dadosMes.metaMax),
      status: calcStatus(p.realizado, dadosMes.metaGatilho, dadosMes.metaMax),
      bonus: calcBonus(p.realizado, dadosMes.metaGatilho, dadosMes.metaMax),
      mensagem: getMensagem(i + 1),
    }))
}

// Retorna ranking anual acumulado até o mês indicado (inclusive)
export function getRankingAnual(mesAtualIndex: number) {
  const profissionaisBase = DADOS_POR_MES[0].profissionais.map(p => ({
    nome: p.nome,
    primeiroNome: p.primeiroNome,
    acumulado: 0,
  }))

  for (let m = 0; m <= mesAtualIndex; m++) {
    const dados = DADOS_POR_MES[m]
    if (!dados) break
    dados.profissionais.forEach((p, i) => {
      profissionaisBase[i].acumulado += p.realizado
    })
  }

  return profissionaisBase
    .sort((a, b) => b.acumulado - a.acumulado)
    .map((p, i) => ({
      pos: i + 1,
      nome: p.nome,
      primeiroNome: p.primeiroNome,
      acumulado: p.acumulado,
      pctMeta: parseFloat(((p.acumulado / META_INDIVIDUAL_ANUAL) * 100).toFixed(1)),
      falta: Math.max(0, META_INDIVIDUAL_ANUAL - p.acumulado),
      bonusAnual: calcBonus(p.acumulado / (mesAtualIndex + 1), META_GATILHO, META_MAX),
      mensagem: getMensagemAnual(i + 1),
    }))
}

// Retorna dados do mês pelo nome
export function getDadosMes(mesNome: string): { dados: DadosMes; index: number } {
  const index = DADOS_POR_MES.findIndex(d => d.mes === mesNome.toUpperCase())
  if (index === -1) {
    return { dados: DADOS_POR_MES[DADOS_POR_MES.length - 1], index: DADOS_POR_MES.length - 1 }
  }
  return { dados: DADOS_POR_MES[index], index }
}

// Meses disponíveis (com dados)
export function getMesesDisponiveis(): string[] {
  return DADOS_POR_MES.map(d =>
    MESES_LISTA.find(m => m.toUpperCase() === d.mes) ?? d.mes
  )
}

function getMensagem(pos: number): string {
  if (pos === 1) return 'Você lidera o ranking! Sua agenda é a chave — uma consulta a mais por dia pode te levar ao bônus ainda este mês.'
  if (pos === 2) return 'Vice-liderança! Você está perto do 1º lugar — cada atendimento conta. Foco em recompra e conversão hoje.'
  if (pos === 3) return 'Top 3! Você está no pódio — mantenha o ritmo e empurre sua agenda para alcançar o gatilho e entrar no bônus.'
  if (pos === 4) return '4ª posição — você está a um passo do pódio! Reorganize sua agenda e acione seus clientes para virar o jogo.'
  return 'O mês ainda está em curso! Esse é o momento de ligar para clientes antigos e encher a agenda. Vamos juntas!'
}

function getMensagemAnual(pos: number): string {
  if (pos === 1) return 'Líder anual — mantenha a consistência mês a mês.'
  if (pos === 2) return '2ª no ano — a disputa está aberta, cada mês importa.'
  if (pos === 3) return 'Pódio anual garantido — agora é crescer o acumulado.'
  if (pos === 4) return 'Ainda há muito ano pela frente — mês forte agora muda o quadro.'
  return 'Cada atendimento soma no anual — comece agora a virar sua posição.'
}

// --- Utilitários ---

export function formatBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

export function getStatusClass(status: string): string {
  if (status === 'Acima da meta') return 'badge-acima'
  if (status === 'Acima do gatilho') return 'badge-gatilho'
  return 'badge-abaixo'
}

export function getProgressColor(pct: number): string {
  if (pct >= 100) return 'progress-fill-green'
  if (pct >= 83) return 'progress-fill-yellow'
  return 'progress-fill-rose'
}

export function getMedalEmoji(pos: number): string {
  if (pos === 1) return '🥇'
  if (pos === 2) return '🥈'
  if (pos === 3) return '🥉'
  return `${pos}º`
}
