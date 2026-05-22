import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type ResetSenhaPayload = {
  profile_id?: string
  email?: string
  password?: string
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
    return jsonResponse({ error: 'Apenas o perfil Admin pode resetar senhas.' }, 403)
  }

  let payload: ResetSenhaPayload
  try {
    payload = await req.json()
  } catch {
    return jsonResponse({ error: 'Dados enviados em formato invalido.' }, 400)
  }

  const profileId = textoLimpo(payload.profile_id)
  const email = textoLimpo(payload.email).toLowerCase()
  const password = payload.password ?? ''

  if (!profileId) {
    return jsonResponse({ error: 'ID da profissional nao informado.' }, 400)
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({ error: 'Informe um e-mail valido.' }, 400)
  }

  if (password.length < 6) {
    return jsonResponse({ error: 'A senha temporaria precisa ter pelo menos 6 caracteres.' }, 400)
  }

  const { data: profile, error: profileError } = await adminClient
    .from('profiles')
    .select('id,nome,role,ativo')
    .eq('id', profileId)
    .maybeSingle()

  if (profileError || !profile || profile.role !== 'user' || profile.ativo !== true) {
    return jsonResponse({ error: 'Profissional ativa nao localizada.' }, 404)
  }

  const { data: updatedUser, error: updateError } = await adminClient.auth.admin.updateUserById(profileId, {
    email,
    password,
    email_confirm: true,
    user_metadata: { nome: profile.nome, role: profile.role },
  })

  if (updateError || !updatedUser.user) {
    return jsonResponse({ error: updateError?.message ?? 'Nao foi possivel atualizar a senha no Auth.' }, 400)
  }

  return jsonResponse({
    id: profileId,
    email,
    status: 'senha_atualizada',
  })
})

