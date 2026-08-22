import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const ANO = 2025

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type NovoAcessoPayload = {
  nome?: string
  primeiro_nome?: string
  email?: string
  password?: string
  role?: 'user' | 'gestao'
  contrato?: 'clt' | 'cnpj'
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function textoLimpo(valor?: string) {
  return (valor ?? '').trim().replace(/\s+/g, ' ')
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

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse({ error: 'Secrets do Supabase nao configurados na Edge Function.' }, 500)
  }

  const authorization = req.headers.get('Authorization') ?? ''
  if (!authorization.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Sessao admin nao informada.' }, 401)
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
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
    return jsonResponse({ error: 'Apenas o perfil Admin pode criar acessos.' }, 403)
  }

  let payload: NovoAcessoPayload
  try {
    payload = await req.json()
  } catch {
    return jsonResponse({ error: 'Dados enviados em formato invalido.' }, 400)
  }

  const nome = textoLimpo(payload.nome)
  const primeiroNome = textoLimpo(payload.primeiro_nome) || nome.split(' ')[0] || ''
  const email = textoLimpo(payload.email).toLowerCase()
  const password = payload.password ?? ''
  const role = payload.role === 'gestao' ? 'gestao' : 'user'
  const contrato = payload.contrato === 'cnpj' ? 'cnpj' : 'clt'

  if (nome.length < 3 || primeiroNome.length < 2) {
    return jsonResponse({ error: 'Informe nome completo e primeiro nome.' }, 400)
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({ error: 'Informe um e-mail valido.' }, 400)
  }

  if (password.length < 6) {
    return jsonResponse({ error: 'A senha inicial precisa ter pelo menos 6 caracteres.' }, 400)
  }

  const { data: createdUser, error: createUserError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nome, primeiro_nome: primeiroNome, role },
  })

  if (createUserError || !createdUser.user) {
    return jsonResponse({ error: createUserError?.message ?? 'Nao foi possivel criar o usuario no Auth.' }, 400)
  }

  const userId = createdUser.user.id

  try {
    const { error: profileError } = await adminClient.from('profiles').upsert(
      { id: userId, nome, primeiro_nome: primeiroNome, role, ativo: true, contrato },
      { onConflict: 'id' },
    )

    if (profileError) throw profileError

    if (role === 'user') {
      const { error: resultadosError } = await adminClient.from('resultados').upsert(
        Array.from({ length: 12 }, (_, index) => ({
          profile_id: userId,
          mes: index + 1,
          ano: ANO,
          realizado: 0,
          comissao_avaliacoes: 0,
          nota_feedback: 0,
        })),
        { onConflict: 'profile_id,mes,ano' },
      )

      if (resultadosError) throw resultadosError
    }
  } catch (error) {
    await adminClient.auth.admin.deleteUser(userId).catch(() => null)
    return jsonResponse({ error: error instanceof Error ? error.message : 'Nao foi possivel sincronizar o perfil.' }, 500)
  }

  return jsonResponse({
    id: userId,
    email,
    nome,
    primeiro_nome: primeiroNome,
    role,
    contrato,
  })
})
