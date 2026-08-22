import type { Profile, ConfiguracoesMes, Resultado, Venda } from './types'

export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true'

export const DEMO_ADMIN: Profile = {
  id: '00000000-0000-0000-0000-000000000000',
  nome: 'Administrador',
  primeiro_nome: 'Admin',
  role: 'admin',
  ativo: true,
}

export const DEMO_PROFILES: Profile[] = [
  { id: '11111111-1111-1111-1111-111111111111', nome: 'Erica Peres Ciriaco', primeiro_nome: 'Erica', role: 'user', ativo: true },
  { id: '22222222-2222-2222-2222-222222222222', nome: 'Gilmara Sousa Cavalcante', primeiro_nome: 'Gilmara', role: 'user', ativo: true },
  { id: '33333333-3333-3333-3333-333333333333', nome: 'Kelly Lavinya Silva Nascimento Sousa', primeiro_nome: 'Kelly', role: 'user', ativo: true },
  { id: '44444444-4444-4444-4444-444444444444', nome: 'Maria Williara De Castro Silva', primeiro_nome: 'Maria', role: 'user', ativo: true },
  { id: '55555555-5555-5555-5555-555555555555', nome: 'Tayane Borges De Sousa', primeiro_nome: 'Tayane', role: 'user', ativo: true },
]

const DEMO_PROFILES_STORAGE_KEY = 'clinica_roseane_demo_profiles_v1'
const CONFIG_BY_MONTH: Record<number, Omit<ConfiguracoesMes, 'id' | 'mes' | 'ano'>> = {
  1: { meta_clinica: 55000, meta_gatilho: 15000, meta_max: 18000, meta_individual_anual: 187000 },
  2: { meta_clinica: 45900, meta_gatilho: 13250, meta_max: 15900, meta_individual_anual: 187000 },
  3: { meta_clinica: 55000, meta_gatilho: 15000, meta_max: 18000, meta_individual_anual: 187000 },
  4: { meta_clinica: 55000, meta_gatilho: 15000, meta_max: 18000, meta_individual_anual: 187000 },
  5: { meta_clinica: 55000, meta_gatilho: 15000, meta_max: 18000, meta_individual_anual: 187000 },
  6: { meta_clinica: 70000, meta_gatilho: 24500, meta_max: 35000, meta_individual_anual: 187000 },
  7: { meta_clinica: 70000, meta_gatilho: 24500, meta_max: 35000, meta_individual_anual: 187000 },
  8: { meta_clinica: 70000, meta_gatilho: 24500, meta_max: 35000, meta_individual_anual: 187000 },
  9: { meta_clinica: 70000, meta_gatilho: 24500, meta_max: 35000, meta_individual_anual: 187000 },
  10: { meta_clinica: 80000, meta_gatilho: 24500, meta_max: 35000, meta_individual_anual: 187000 },
  11: { meta_clinica: 90000, meta_gatilho: 28000, meta_max: 40000, meta_individual_anual: 187000 },
  12: { meta_clinica: 90000, meta_gatilho: 28000, meta_max: 40000, meta_individual_anual: 187000 },
}

// Dados extraidos de D:\Metas_Clinica\painel_clinica_dra_roseane_v6.xlsx
const RAW: { profile_id: string; mes: number; realizado: number; comissao_avaliacoes: number }[] = [
  { profile_id: '11111111-1111-1111-1111-111111111111', mes: 1, realizado: 1304, comissao_avaliacoes: 0 },
  { profile_id: '11111111-1111-1111-1111-111111111111', mes: 2, realizado: 1240, comissao_avaliacoes: 0 },
  { profile_id: '11111111-1111-1111-1111-111111111111', mes: 3, realizado: 180, comissao_avaliacoes: 0 },
  { profile_id: '11111111-1111-1111-1111-111111111111', mes: 4, realizado: 2690.9, comissao_avaliacoes: 0 },
  { profile_id: '11111111-1111-1111-1111-111111111111', mes: 5, realizado: 0, comissao_avaliacoes: 0 },

  { profile_id: '22222222-2222-2222-2222-222222222222', mes: 1, realizado: 1400, comissao_avaliacoes: 0 },
  { profile_id: '22222222-2222-2222-2222-222222222222', mes: 2, realizado: 415, comissao_avaliacoes: 0 },
  { profile_id: '22222222-2222-2222-2222-222222222222', mes: 3, realizado: 120, comissao_avaliacoes: 0 },
  { profile_id: '22222222-2222-2222-2222-222222222222', mes: 4, realizado: 2546.9, comissao_avaliacoes: 0 },
  { profile_id: '22222222-2222-2222-2222-222222222222', mes: 5, realizado: 1062.9, comissao_avaliacoes: 0 },

  { profile_id: '33333333-3333-3333-3333-333333333333', mes: 1, realizado: 18415.6, comissao_avaliacoes: 0 },
  { profile_id: '33333333-3333-3333-3333-333333333333', mes: 2, realizado: 23073.9, comissao_avaliacoes: 0 },
  { profile_id: '33333333-3333-3333-3333-333333333333', mes: 3, realizado: 23781.5, comissao_avaliacoes: 0 },
  { profile_id: '33333333-3333-3333-3333-333333333333', mes: 4, realizado: 35615.7, comissao_avaliacoes: 0 },
  { profile_id: '33333333-3333-3333-3333-333333333333', mes: 5, realizado: 21245.69, comissao_avaliacoes: 0 },

  { profile_id: '44444444-4444-4444-4444-444444444444', mes: 1, realizado: 6168, comissao_avaliacoes: 0 },
  { profile_id: '44444444-4444-4444-4444-444444444444', mes: 2, realizado: 6488.89, comissao_avaliacoes: 0 },
  { profile_id: '44444444-4444-4444-4444-444444444444', mes: 3, realizado: 3479.5, comissao_avaliacoes: 0 },
  { profile_id: '44444444-4444-4444-4444-444444444444', mes: 4, realizado: 12909.19, comissao_avaliacoes: 0 },
  { profile_id: '44444444-4444-4444-4444-444444444444', mes: 5, realizado: 8247.99, comissao_avaliacoes: 0 },

  { profile_id: '55555555-5555-5555-5555-555555555555', mes: 1, realizado: 15387.77, comissao_avaliacoes: 0 },
  { profile_id: '55555555-5555-5555-5555-555555555555', mes: 2, realizado: 15648.1, comissao_avaliacoes: 0 },
  { profile_id: '55555555-5555-5555-5555-555555555555', mes: 3, realizado: 18402.18, comissao_avaliacoes: 0 },
  { profile_id: '55555555-5555-5555-5555-555555555555', mes: 4, realizado: 20824.19, comissao_avaliacoes: 0 },
  { profile_id: '55555555-5555-5555-5555-555555555555', mes: 5, realizado: 4609.79, comissao_avaliacoes: 0 },
]

export const DEMO_RESULTADOS: Resultado[] = RAW.map((r, i) => ({ ...r, id: i + 1, ano: 2025 }))

const DEMO_CONFIG_STORAGE_KEY = 'clinica_roseane_demo_configuracoes_v1'
const DEMO_RESULTADOS_STORAGE_KEY = 'clinica_roseane_demo_resultados_v1'

type ValorDemo = { profile_id: string; realizado: number; comissao: number; feedback: number }

function storageDisponivel(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function lerStorage<T>(chave: string, fallback: T): T {
  if (!storageDisponivel()) return fallback

  try {
    const valor = window.localStorage.getItem(chave)
    return valor ? JSON.parse(valor) as T : fallback
  } catch {
    return fallback
  }
}

function salvarStorage<T>(chave: string, valor: T) {
  if (!storageDisponivel()) return
  window.localStorage.setItem(chave, JSON.stringify(valor))
}

function chaveResultado(resultado: Pick<Resultado, 'profile_id' | 'mes' | 'ano'>) {
  return `${resultado.profile_id}:${resultado.ano}:${resultado.mes}`
}

function getConfigSalva(): Record<string, ConfiguracoesMes> {
  return lerStorage<Record<string, ConfiguracoesMes>>(DEMO_CONFIG_STORAGE_KEY, {})
}

export function getDemoProfiles(): Profile[] {
  const salvos = lerStorage<Profile[]>(DEMO_PROFILES_STORAGE_KEY, [])
  const mapa = new Map(DEMO_PROFILES.map(profile => [profile.id, profile]))

  salvos.forEach(profile => {
    mapa.set(profile.id, { ...profile, role: 'user' })
  })

  return Array.from(mapa.values()).filter(profile => profile.ativo).sort((a, b) => a.nome.localeCompare(b.nome))
}

function getResultadosAtualizados(): Resultado[] {
  const mapa = new Map(DEMO_RESULTADOS.map(resultado => [chaveResultado(resultado), resultado]))
  const salvos = lerStorage<Resultado[]>(DEMO_RESULTADOS_STORAGE_KEY, [])

  salvos.forEach(resultado => {
    const chave = chaveResultado(resultado)
    mapa.set(chave, { ...mapa.get(chave), ...resultado })
  })

  getDemoProfiles().forEach(profile => {
    for (let mes = 1; mes <= 12; mes += 1) {
      const resultado = { profile_id: profile.id, ano: 2025, mes }
      const chave = chaveResultado(resultado)

      if (!mapa.has(chave)) {
        mapa.set(chave, {
          ...resultado,
          id: 100000 + mapa.size,
          realizado: 0,
          comissao_avaliacoes: 0,
          nota_feedback: 0,
        })
      }
    }
  })

  return Array.from(mapa.values())
}

export function getDemoConfig(mes: number): ConfiguracoesMes {
  const config = CONFIG_BY_MONTH[mes] ?? CONFIG_BY_MONTH[1]
  const configPadrao = { id: mes, mes, ano: 2025, ...config }
  return { ...configPadrao, ...getConfigSalva()[String(mes)] }
}

export function getDemoResultadosMes(mes: number): Resultado[] {
  return getResultadosAtualizados().filter(r => r.mes === mes)
}

export function getDemoResultadosAnual(ateMes: number): Resultado[] {
  return getResultadosAtualizados().filter(r => r.mes <= ateMes)
}

export function getDemoVendasMes(mes: number): Venda[] {
  const ano = new Date().getFullYear()
  return [
    { profile_id: DEMO_ADMIN.id, mes, ano, data_venda: `${ano}-${String(mes).padStart(2, '0')}-05`, cliente_nome: 'Cliente Exemplo', servico: 'Protocolo Facial', categoria: 'Facial', valor: 350, valor_comissao: null },
    { profile_id: DEMO_ADMIN.id, mes, ano, data_venda: `${ano}-${String(mes).padStart(2, '0')}-12`, cliente_nome: 'Cliente Demonstração', servico: 'Limpeza de Pele', categoria: 'Facial', valor: 180, valor_comissao: null },
  ]
}

export function salvarDemoMes(config: ConfiguracoesMes, valores: ValorDemo[], mes: number, ano = 2025) {
  const configs = getConfigSalva()
  configs[String(mes)] = {
    ...config,
    id: config.id || mes,
    mes,
    ano,
  }
  salvarStorage(DEMO_CONFIG_STORAGE_KEY, configs)

  const resultados = getResultadosAtualizados()
  const mapa = new Map(resultados.map(resultado => [chaveResultado(resultado), resultado]))
  const proximoId = Math.max(0, ...resultados.map(resultado => resultado.id ?? 0)) + 1

  valores.forEach((valor, index) => {
    const chave = `${valor.profile_id}:${ano}:${mes}`
    const existente = mapa.get(chave)
    mapa.set(chave, {
      id: existente?.id ?? proximoId + index,
      profile_id: valor.profile_id,
      mes,
      ano,
      realizado: Number.isFinite(valor.realizado) ? valor.realizado : 0,
      comissao_avaliacoes: Number.isFinite(valor.comissao) ? valor.comissao : 0,
      nota_feedback: Number.isFinite(valor.feedback) ? Math.max(0, Math.min(10, valor.feedback)) : 0,
    })
  })

  salvarStorage(DEMO_RESULTADOS_STORAGE_KEY, Array.from(mapa.values()))
}

export function adicionarDemoProfissional(nome: string, primeiroNome?: string): Profile {
  const nomeLimpo = nome.trim().replace(/\s+/g, ' ')
  const primeiroNomeLimpo = (primeiroNome?.trim() || nomeLimpo.split(' ')[0] || 'Profissional').replace(/\s+/g, ' ')
  const profile: Profile = {
    id: `demo-${Date.now()}`,
    nome: nomeLimpo,
    primeiro_nome: primeiroNomeLimpo,
    role: 'user',
    ativo: true,
  }

  const salvos = lerStorage<Profile[]>(DEMO_PROFILES_STORAGE_KEY, [])
  salvarStorage(DEMO_PROFILES_STORAGE_KEY, [...salvos, profile])

  salvarStorage(DEMO_RESULTADOS_STORAGE_KEY, getResultadosAtualizados())
  return profile
}

export function atualizarDemoProfissional(id: string, nome: string, primeiroNome: string): Profile | null {
  const todosProfiles = [...DEMO_PROFILES, ...lerStorage<Profile[]>(DEMO_PROFILES_STORAGE_KEY, [])]
  const atual = todosProfiles.find(profile => profile.id === id)
  if (!atual) return null

  const atualizado: Profile = {
    ...atual,
    nome: nome.trim().replace(/\s+/g, ' '),
    primeiro_nome: primeiroNome.trim().replace(/\s+/g, ' '),
    role: 'user',
    ativo: true,
  }
  const salvos = lerStorage<Profile[]>(DEMO_PROFILES_STORAGE_KEY, []).filter(profile => profile.id !== id)
  salvarStorage(DEMO_PROFILES_STORAGE_KEY, [...salvos, atualizado])
  return atualizado
}

export function excluirDemoProfissional(id: string): Profile | null {
  const todosProfiles = [...DEMO_PROFILES, ...lerStorage<Profile[]>(DEMO_PROFILES_STORAGE_KEY, [])]
  const atual = todosProfiles.find(profile => profile.id === id)
  if (!atual) return null

  const desativado: Profile = { ...atual, role: 'user', ativo: false }
  const salvos = lerStorage<Profile[]>(DEMO_PROFILES_STORAGE_KEY, []).filter(profile => profile.id !== id)
  salvarStorage(DEMO_PROFILES_STORAGE_KEY, [...salvos, desativado])
  return desativado
}

export function getDemoProfile(id: string): Profile {
  return getDemoProfiles().find(p => p.id === id) ?? getDemoProfiles()[0]
}

export function matchDemoProfileByEmail(email: string): Profile {
  const lower = email.toLowerCase()
  return getDemoProfiles().find(p => lower.includes(p.primeiro_nome.toLowerCase())) ?? getDemoProfiles()[0]
}
