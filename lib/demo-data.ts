import type { Profile, ConfiguracoesMes, Resultado } from './types'

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

export function getDemoConfig(mes: number): ConfiguracoesMes {
  const config = CONFIG_BY_MONTH[mes] ?? CONFIG_BY_MONTH[1]
  return { id: mes, mes, ano: 2025, ...config }
}

export function getDemoResultadosMes(mes: number): Resultado[] {
  return DEMO_RESULTADOS.filter(r => r.mes === mes)
}

export function getDemoResultadosAnual(ateMes: number): Resultado[] {
  return DEMO_RESULTADOS.filter(r => r.mes <= ateMes)
}

export function getDemoProfile(id: string): Profile {
  return DEMO_PROFILES.find(p => p.id === id) ?? DEMO_PROFILES[0]
}

export function matchDemoProfileByEmail(email: string): Profile {
  const lower = email.toLowerCase()
  return DEMO_PROFILES.find(p => lower.includes(p.primeiro_nome.toLowerCase())) ?? DEMO_PROFILES[0]
}
