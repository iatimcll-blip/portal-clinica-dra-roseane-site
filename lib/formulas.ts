export const MESES_LISTA = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro',
]

export function calcBonus(realizado: number, metaGatilho: number, metaMax: number): number {
  if (realizado >= metaMax) return 1350
  if (realizado >= metaGatilho) return 1350
  return parseFloat((realizado * 0.075).toFixed(2))
}

export function calcStatus(realizado: number, metaGatilho: number, metaMax: number): string {
  if (realizado >= metaMax) return 'Acima da meta'
  if (realizado >= metaGatilho) return 'Acima do gatilho'
  return 'Abaixo do gatilho'
}

export function calcPctGatilho(realizado: number, metaGatilho: number): number {
  if (!metaGatilho) return 0
  return parseFloat(((realizado / metaGatilho) * 100).toFixed(1))
}

export function calcPctMeta(realizado: number, metaMax: number): number {
  if (!metaMax) return 0
  return parseFloat(((realizado / metaMax) * 100).toFixed(1))
}

export function getMensagem(pos: number): string {
  const m = [
    'Você lidera o ranking! Sua agenda é a chave — uma consulta a mais por dia pode te levar ao bônus ainda este mês.',
    'Vice-liderança! Você está perto do 1º lugar — cada atendimento conta. Foco em recompra e conversão hoje.',
    'Top 3! Você está no pódio — mantenha o ritmo e empurre sua agenda para alcançar o gatilho e entrar no bônus.',
    '4ª posição — você está a um passo do pódio! Reorganize sua agenda e acione seus clientes para virar o jogo.',
    'O mês ainda está em curso! Esse é o momento de ligar para clientes antigos e encher a agenda. Vamos juntas!',
  ]
  return m[Math.min(pos - 1, m.length - 1)]
}

export function getMensagemAnual(pos: number): string {
  const m = [
    'Líder anual — mantenha a consistência mês a mês.',
    '2ª no ano — a disputa está aberta, cada mês importa.',
    'Pódio anual garantido — agora é crescer o acumulado.',
    'Ainda há muito ano pela frente — mês forte agora muda o quadro.',
    'Cada atendimento soma no anual — comece agora a virar sua posição.',
  ]
  return m[Math.min(pos - 1, m.length - 1)]
}

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

export function mesNumero(nomeMes: string): number {
  return MESES_LISTA.findIndex(m => m === nomeMes) + 1
}

export function mesNome(numero: number): string {
  return MESES_LISTA[numero - 1] ?? 'Janeiro'
}
