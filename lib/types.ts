export type Role = 'admin' | 'user'

export type Profile = {
  id: string
  nome: string
  primeiro_nome: string
  role: Role
  ativo: boolean
}

export type ConfiguracoesMes = {
  id: number
  mes: number
  ano: number
  meta_clinica: number
  meta_gatilho: number
  meta_max: number
  meta_individual_anual: number
}

export type Resultado = {
  id?: number
  profile_id: string
  mes: number
  ano: number
  realizado: number
  comissao_avaliacoes: number
  nota_feedback?: number
}

export type ResultadoRanking = {
  pos: number
  profile_id: string
  nome: string
  primeiro_nome: string
  realizado: number
  comissao_avaliacoes: number
  nota_feedback?: number
  pctGatilho: number
  pctMeta: number
  status: string
  bonus: number
  totalReceber: number
  mensagem: string
}

export type RankingAnualItem = {
  pos: number
  profile_id: string
  nome: string
  primeiro_nome: string
  acumulado: number
  pctMeta: number
  falta: number
  mensagem: string
}

export type MaterialInformativo = {
  id: number
  titulo: string
  descricao: string | null
  file_name: string
  file_path: string
  file_type: string | null
  file_size: number | null
  ativo: boolean
  created_at: string
}
