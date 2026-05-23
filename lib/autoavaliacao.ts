export type AutoavaliacaoPergunta = {
  id: string
  grupo: string
  texto: string
}

export const AUTOAVALIACAO_PERGUNTAS: AutoavaliacaoPergunta[] = [
  { id: 'q1', grupo: 'Minhas competências técnicas', texto: 'Tenho domínio técnico dos procedimentos que realizo' },
  { id: 'q2', grupo: 'Minhas competências técnicas', texto: 'Executo os serviços com qualidade, capricho e atenção aos detalhes' },
  { id: 'q3', grupo: 'Minhas competências técnicas', texto: 'Busco me atualizar sobre produtos, técnicas e equipamentos' },
  { id: 'q4', grupo: 'Minhas competências técnicas', texto: 'Cumpro as normas de higiene e biossegurança' },
  { id: 'q5', grupo: 'Minhas competências técnicas', texto: 'Mantenho meu espaço de trabalho limpo e organizado' },
  { id: 'q6', grupo: 'Meu atendimento ao cliente', texto: 'Atendo os clientes com simpatia, empatia e cordialidade' },
  { id: 'q7', grupo: 'Meu atendimento ao cliente', texto: 'Ouço e compreendo as necessidades de cada cliente' },
  { id: 'q8', grupo: 'Meu atendimento ao cliente', texto: 'Contribuo para encantar e fidelizar os clientes' },
  { id: 'q9', grupo: 'Meu atendimento ao cliente', texto: 'Cuido da minha apresentação pessoal e postura profissional' },
  { id: 'q10', grupo: 'Meu atendimento ao cliente', texto: 'Lido bem com reclamações e situações difíceis' },
  { id: 'q11', grupo: 'Minha postura e comportamento', texto: 'Sou pontual e assíduo(a)' },
  { id: 'q12', grupo: 'Minha postura e comportamento', texto: 'Sou comprometido(a) e responsável com minhas funções' },
  { id: 'q13', grupo: 'Minha postura e comportamento', texto: 'Tenho iniciativa e proatividade no dia a dia' },
  { id: 'q14', grupo: 'Minha postura e comportamento', texto: 'Colaboro e trabalho bem em equipe' },
  { id: 'q15', grupo: 'Minha postura e comportamento', texto: 'Recebo bem orientações e feedbacks' },
  { id: 'q16', grupo: 'Meus resultados e desenvolvimento', texto: 'Cumpro minhas metas e mantenho boa produtividade' },
  { id: 'q17', grupo: 'Meus resultados e desenvolvimento', texto: 'Contribuo para vendas, indicações e retorno de clientes' },
  { id: 'q18', grupo: 'Meus resultados e desenvolvimento', texto: 'Cuido bem dos materiais, produtos e do patrimônio' },
  { id: 'q19', grupo: 'Meus resultados e desenvolvimento', texto: 'Atuo de acordo com os valores do Centro Estético' },
]

export const AUTOAVALIACAO_CAMPOS_TEXTO = [
  { id: 'ponto_forte', label: 'O que considero meu maior ponto forte' },
  { id: 'desenvolver', label: 'O que preciso desenvolver ou melhorar' },
  { id: 'conquistas', label: 'Conquistas e momentos de orgulho neste período' },
  { id: 'dificuldades', label: 'Dificuldades que enfrentei' },
  { id: 'apoio_gestao', label: 'Apoio ou recursos que preciso da gestão' },
  { id: 'metas_proximo_periodo', label: 'Minhas metas e objetivos para o próximo período' },
]

export function calcularMediaAutoavaliacao(notas: Record<string, number>) {
  const valores = AUTOAVALIACAO_PERGUNTAS
    .map(pergunta => Number(notas[pergunta.id] ?? 0))
    .filter(valor => valor > 0)

  if (valores.length === 0) return 0
  return Number((valores.reduce((soma, valor) => soma + valor, 0) / valores.length).toFixed(1))
}

export function normalizarDataAutoavaliacao(valor?: string | null) {
  if (!valor) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(valor)) return valor

  const data = new Date(valor)
  if (Number.isNaN(data.getTime())) return ''

  const ano = data.getFullYear()
  const mes = String(data.getMonth() + 1).padStart(2, '0')
  const dia = String(data.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

export function formatarDataAutoavaliacao(valor?: string | null) {
  const iso = normalizarDataAutoavaliacao(valor)
  if (!iso) return ''
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}
