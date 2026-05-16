import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY antes de executar.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const acessos = [
  {
    nome: 'Administrador',
    primeiro_nome: 'Admin',
    email: 'admin@clinica.com',
    senha: 'Admin@2025!',
    role: 'admin',
  },
  {
    nome: 'Erica Peres Ciriaco',
    primeiro_nome: 'Erica',
    email: 'erica@clinica.com',
    senha: 'Erica@2025!',
    role: 'user',
  },
  {
    nome: 'Gilmara Sousa Cavalcante',
    primeiro_nome: 'Gilmara',
    email: 'gilmara@clinica.com',
    senha: 'Gilmara@2025!',
    role: 'user',
  },
  {
    nome: 'Kelly Lavinya Silva Nascimento Sousa',
    primeiro_nome: 'Kelly',
    email: 'kelly@clinica.com',
    senha: 'Kelly@2025!',
    role: 'user',
  },
  {
    nome: 'Maria Williara De Castro Silva',
    primeiro_nome: 'Maria',
    email: 'maria@clinica.com',
    senha: 'Maria@2025!',
    role: 'user',
  },
  {
    nome: 'Tayane Borges De Sousa',
    primeiro_nome: 'Tayane',
    email: 'tayane@clinica.com',
    senha: 'Tayane@2025!',
    role: 'user',
  },
]

async function buscarUsuarioPorEmail(email) {
  let page = 1
  const perPage = 100

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage })
    if (error) throw error

    const usuario = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase())
    if (usuario) return usuario
    if (data.users.length < perPage) return null
    page += 1
  }
}

for (const acesso of acessos) {
  const existente = await buscarUsuarioPorEmail(acesso.email)
  let userId = existente?.id

  if (existente) {
    const { data, error } = await supabase.auth.admin.updateUserById(existente.id, {
      password: acesso.senha,
      email_confirm: true,
      user_metadata: {
        nome: acesso.nome,
        primeiro_nome: acesso.primeiro_nome,
        role: acesso.role,
      },
      app_metadata: {
        role: acesso.role,
      },
    })
    if (error) throw error
    userId = data.user.id
    console.log(`Senha atualizada: ${acesso.email}`)
  } else {
    const { data, error } = await supabase.auth.admin.createUser({
      email: acesso.email,
      password: acesso.senha,
      email_confirm: true,
      user_metadata: {
        nome: acesso.nome,
        primeiro_nome: acesso.primeiro_nome,
        role: acesso.role,
      },
      app_metadata: {
        role: acesso.role,
      },
    })
    if (error) throw error
    userId = data.user.id
    console.log(`Usuario criado: ${acesso.email}`)
  }

  const { error: profileError } = await supabase.from('profiles').upsert({
    id: userId,
    nome: acesso.nome,
    primeiro_nome: acesso.primeiro_nome,
    role: acesso.role,
    ativo: true,
  })

  if (profileError) throw profileError
}

console.log('\nAcessos prontos:')
for (const acesso of acessos) {
  console.log(`${acesso.nome} | ${acesso.email} | ${acesso.senha}`)
}
