import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TRINKS_BASE_URL = 'https://api.trinks.com/v1'
const PAGE_SIZE = 50
const FUSO = 'America/Sao_Paulo'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type SincronizarPayload = {
  mes?: number
  ano?: number
}

type TrinksPaginado<T> = {
  page: number
  pageSize: number
  totalPages: number
  totalRecords: number
  data: T[]
}

type TrinksProfissional = {
  id: number
  nome: string
  apelido?: string | null
}

type TrinksAgendamento = {
  id: number
  status?: { id: number; nome: string } | null
  profissional?: { id: number; nome: string } | null
  valor?: number | null
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function normalizarNome(valor?: string | null) {
  return (valor ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

function statusIndicaFinalizado(nomeStatus?: string | null) {
  const normalizado = normalizarNome(nomeStatus)
  return normalizado.includes('finaliz') || normalizado.includes('atendid') || normalizado.includes('conclu')
}

function primeiroEUltimoDiaDoMes(mes: number, ano: number) {
  const inicio = new Date(Date.UTC(ano, mes - 1, 1))
  const fim = new Date(Date.UTC(ano, mes, 0))
  const formatar = (data: Date) => data.toISOString().slice(0, 10)
  return { dataInicio: formatar(inicio), dataFim: formatar(fim) }
}

function mesAnoAtual() {
  const agora = new Date(new Date().toLocaleString('en-US', { timeZone: FUSO }))
  return { mes: agora.getMonth() + 1, ano: agora.getFullYear() }
}

async function trinksFetchPaginado<T>(
  caminho: string,
  apiKey: string,
  estabelecimentoId: string,
  paramsExtra: Record<string, string> = {},
): Promise<T[]> {
  const itens: T[] = []
  let page = 1
  let totalPages = 1

  do {
    const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), ...paramsExtra })
    const resposta = await fetch(`${TRINKS_BASE_URL}${caminho}?${params.toString()}`, {
      headers: {
        'X-Api-Key': apiKey,
        estabelecimentoId,
      },
    })

    if (!resposta.ok) {
      throw new Error(`Trinks respondeu ${resposta.status} em ${caminho}: ${await resposta.text()}`)
    }

    const corpo = await resposta.json() as TrinksPaginado<T>
    itens.push(...corpo.data)
    totalPages = corpo.totalPages || 1
    page += 1
  } while (page <= totalPages)

  return itens
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Metodo nao permitido.' }, 405)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const trinksApiKey = Deno.env.get('TRINKS_API_KEY')
  const trinksEstabelecimentoId = Deno.env.get('TRINKS_ESTABELECIMENTO_ID')

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'Secrets do Supabase nao configurados na Edge Function.' }, 500)
  }

  if (!trinksApiKey || !trinksEstabelecimentoId) {
    return jsonResponse({ error: 'Secrets do Trinks (TRINKS_API_KEY, TRINKS_ESTABELECIMENTO_ID) nao configurados na Edge Function.' }, 500)
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const authorization = req.headers.get('Authorization') ?? ''
  const chamadaDoSistema = authorization === `Bearer ${serviceRoleKey}`

  if (!chamadaDoSistema) {
    if (!authorization.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Sessao admin nao informada.' }, 401)
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    })

    const { data: authData, error: authError } = await authClient.auth.getUser()
    if (authError || !authData.user) {
      return jsonResponse({ error: 'Sessao admin invalida.' }, 401)
    }

    const { data: profileAdmin, error: profileAdminError } = await adminClient
      .from('profiles')
      .select('role')
      .eq('id', authData.user.id)
      .maybeSingle()

    if (profileAdminError || profileAdmin?.role !== 'admin') {
      return jsonResponse({ error: 'Apenas o perfil Admin pode sincronizar com o Trinks.' }, 403)
    }
  }

  let payload: SincronizarPayload
  try {
    payload = await req.json()
  } catch {
    payload = {}
  }

  const { mes: mesPadrao, ano: anoPadrao } = mesAnoAtual()
  const mes = payload.mes && payload.mes >= 1 && payload.mes <= 12 ? payload.mes : mesPadrao
  const ano = payload.ano || anoPadrao

  try {
    const [profissionaisTrinks, profiles] = await Promise.all([
      trinksFetchPaginado<TrinksProfissional>('/profissionais', trinksApiKey, trinksEstabelecimentoId),
      adminClient.from('profiles').select('id,nome,primeiro_nome').eq('ativo', true).eq('role', 'user')
        .then(({ data, error }) => {
          if (error) throw error
          return data ?? []
        }),
    ])

    const profilesPorNome = new Map(profiles.map(p => [normalizarNome(p.nome), p]))
    const profilesPorPrimeiroNome = new Map(profiles.map(p => [normalizarNome(p.primeiro_nome), p]))

    const vinculos = new Map<number, { profileId: string; nome: string }>()
    const naoEncontrados: string[] = []

    for (const profissional of profissionaisTrinks) {
      const porNome = profilesPorNome.get(normalizarNome(profissional.nome))
      const porApelido = profissional.apelido ? profilesPorPrimeiroNome.get(normalizarNome(profissional.apelido)) : undefined
      const profile = porNome ?? porApelido

      if (profile) {
        vinculos.set(profissional.id, { profileId: profile.id, nome: profile.nome })
      } else {
        naoEncontrados.push(profissional.nome)
      }
    }

    const idsVinculados = new Set(Array.from(vinculos.values()).map(v => v.profileId))
    const semVinculoTrinks = profiles.filter(p => !idsVinculados.has(p.id)).map(p => p.nome)

    const { dataInicio, dataFim } = primeiroEUltimoDiaDoMes(mes, ano)
    const agendamentos = await trinksFetchPaginado<TrinksAgendamento>('/agendamentos', trinksApiKey, trinksEstabelecimentoId, {
      dataInicio,
      dataFim,
    })

    const statusEncontrados = Array.from(new Set(agendamentos.map(a => a.status?.nome).filter(Boolean))) as string[]

    const somaPorProfissionalTrinks = new Map<number, number>()
    for (const agendamento of agendamentos) {
      if (!statusIndicaFinalizado(agendamento.status?.nome)) continue
      const profissionalId = agendamento.profissional?.id
      if (profissionalId == null) continue
      const atual = somaPorProfissionalTrinks.get(profissionalId) ?? 0
      somaPorProfissionalTrinks.set(profissionalId, atual + (agendamento.valor ?? 0))
    }

    const agora = new Date().toISOString()
    const linhas = Array.from(vinculos.entries()).map(([trinksId, vinculo]) => ({
      profile_id: vinculo.profileId,
      mes,
      ano,
      realizado: somaPorProfissionalTrinks.get(trinksId) ?? 0,
      updated_at: agora,
    }))

    if (linhas.length > 0) {
      const { error: upsertError } = await adminClient
        .from('resultados')
        .upsert(linhas, { onConflict: 'profile_id,mes,ano' })

      if (upsertError) throw upsertError
    }

    return jsonResponse({
      mes,
      ano,
      atualizados: linhas.map(l => {
        const nome = Array.from(vinculos.values()).find(v => v.profileId === l.profile_id)?.nome ?? ''
        return { nome, realizado: l.realizado }
      }),
      naoEncontrados,
      semVinculoTrinks,
      statusEncontrados,
    })
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : 'Falha ao sincronizar com o Trinks.' }, 500)
  }
})
