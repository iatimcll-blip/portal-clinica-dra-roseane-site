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
  { id: '11111111-1111-1111-1111-111111111111', nome: 'Erica Peres Ciriaco',               primeiro_nome: 'Erica',   role: 'user', ativo: true },
  { id: '22222222-2222-2222-2222-222222222222', nome: 'Kelly Lavinya Silva Nascimento Sousa', primeiro_nome: 'Kelly',  role: 'user', ativo: true },
  { id: '33333333-3333-3333-3333-333333333333', nome: 'Tayane Borges De Sousa',             primeiro_nome: 'Tayane', role: 'user', ativo: true },
  { id: '44444444-4444-4444-4444-444444444444', nome: 'Maria Williara De Castro Silva',     primeiro_nome: 'Maria',  role: 'user', ativo: true },
  { id: '55555555-5555-5555-5555-555555555555', nome: 'Gilmara Sousa Cavalcante',           primeiro_nome: 'Gilmara',role: 'user', ativo: true },
]

// Resultados mensais: Jan–Mai 2025
// meta_gatilho: 15.000 | meta_max: 18.000
const RAW: { profile_id: string; mes: number; realizado: number; comissao_avaliacoes: number }[] = [
  // Erica — líder consistente
  { profile_id: '11111111-1111-1111-1111-111111111111', mes: 1, realizado: 18500, comissao_avaliacoes: 1050 },
  { profile_id: '11111111-1111-1111-1111-111111111111', mes: 2, realizado: 17900, comissao_avaliacoes: 980  },
  { profile_id: '11111111-1111-1111-1111-111111111111', mes: 3, realizado: 19200, comissao_avaliacoes: 1120 },
  { profile_id: '11111111-1111-1111-1111-111111111111', mes: 4, realizado: 16800, comissao_avaliacoes: 870  },
  { profile_id: '11111111-1111-1111-1111-111111111111', mes: 5, realizado: 18200, comissao_avaliacoes: 1040 },
  // Kelly — acima do gatilho com regularidade
  { profile_id: '22222222-2222-2222-2222-222222222222', mes: 1, realizado: 16800, comissao_avaliacoes: 840  },
  { profile_id: '22222222-2222-2222-2222-222222222222', mes: 2, realizado: 17200, comissao_avaliacoes: 890  },
  { profile_id: '22222222-2222-2222-2222-222222222222', mes: 3, realizado: 15900, comissao_avaliacoes: 760  },
  { profile_id: '22222222-2222-2222-2222-222222222222', mes: 4, realizado: 18100, comissao_avaliacoes: 920  },
  { profile_id: '22222222-2222-2222-2222-222222222222', mes: 5, realizado: 17500, comissao_avaliacoes: 860  },
  // Tayane — oscila entre gatilho e abaixo
  { profile_id: '33333333-3333-3333-3333-333333333333', mes: 1, realizado: 14200, comissao_avaliacoes: 560  },
  { profile_id: '33333333-3333-3333-3333-333333333333', mes: 2, realizado: 15800, comissao_avaliacoes: 680  },
  { profile_id: '33333333-3333-3333-3333-333333333333', mes: 3, realizado: 16400, comissao_avaliacoes: 720  },
  { profile_id: '33333333-3333-3333-3333-333333333333', mes: 4, realizado: 13600, comissao_avaliacoes: 510  },
  { profile_id: '33333333-3333-3333-3333-333333333333', mes: 5, realizado: 15200, comissao_avaliacoes: 620  },
  // Maria — abaixo do gatilho, crescendo
  { profile_id: '44444444-4444-4444-4444-444444444444', mes: 1, realizado: 11500, comissao_avaliacoes: 420  },
  { profile_id: '44444444-4444-4444-4444-444444444444', mes: 2, realizado: 13200, comissao_avaliacoes: 460  },
  { profile_id: '44444444-4444-4444-4444-444444444444', mes: 3, realizado: 14800, comissao_avaliacoes: 500  },
  { profile_id: '44444444-4444-4444-4444-444444444444', mes: 4, realizado: 12300, comissao_avaliacoes: 390  },
  { profile_id: '44444444-4444-4444-4444-444444444444', mes: 5, realizado: 12800, comissao_avaliacoes: 440  },
  // Gilmara — abaixo do gatilho
  { profile_id: '55555555-5555-5555-5555-555555555555', mes: 1, realizado:  8900, comissao_avaliacoes: 280  },
  { profile_id: '55555555-5555-5555-5555-555555555555', mes: 2, realizado: 10200, comissao_avaliacoes: 330  },
  { profile_id: '55555555-5555-5555-5555-555555555555', mes: 3, realizado: 11800, comissao_avaliacoes: 360  },
  { profile_id: '55555555-5555-5555-5555-555555555555', mes: 4, realizado:  9400, comissao_avaliacoes: 290  },
  { profile_id: '55555555-5555-5555-5555-555555555555', mes: 5, realizado:  9500, comissao_avaliacoes: 300  },
]

export const DEMO_RESULTADOS: Resultado[] = RAW.map((r, i) => ({ ...r, id: i + 1, ano: 2025 }))

export function getDemoConfig(mes: number): ConfiguracoesMes {
  return { id: mes, mes, ano: 2025, meta_clinica: 55000, meta_gatilho: 15000, meta_max: 18000, meta_individual_anual: 187000 }
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
