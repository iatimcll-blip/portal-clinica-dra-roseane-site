'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import DecoracaoDireita from '@/components/DecoracaoDireita'
import AlterarSenhaCard from '@/components/AlterarSenhaCard'
import { createClient } from '@/lib/supabase/client'
import { assetPath } from '@/lib/asset-path'
import {
  MESES_LISTA, mesNumero, formatBRL, calcBonus, calcStatus, calcPctMeta,
  calcComissaoAvaliacoes, getStatusClass,
} from '@/lib/formulas'
import type { Profile, ConfiguracoesMes, Role } from '@/lib/types'
import {
  DEMO_MODE,
  adicionarDemoProfissional,
  atualizarDemoProfissional,
  excluirDemoProfissional,
  getDemoConfig,
  getDemoProfiles,
  getDemoResultadosMes,
  salvarDemoMes,
} from '@/lib/demo-data'

const ANO = 2025

type ValorProf = { profile_id: string; realizado: number; comissao: number; feedback: number }

const CONFIG_PADRAO: ConfiguracoesMes = {
  id: 0, mes: 1, ano: ANO, meta_clinica: 80000, meta_gatilho: 8000, meta_max: 12000, meta_individual_anual: 120000,
}

function getCriarProfissionalUrl() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) return ''
  return `${supabaseUrl.replace('.supabase.co', '.functions.supabase.co')}/criar-profissional`
}

export default function EditarPage() {
  const router = useRouter()
  const [mesSelecionado, setMesSelecionado] = useState('Janeiro')
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [config, setConfig] = useState<ConfiguracoesMes>(CONFIG_PADRAO)
  const [valores, setValores] = useState<ValorProf[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [salvo, setSalvo] = useState(false)
  const [erroSalvar, setErroSalvar] = useState('')
  const [novoNome, setNovoNome] = useState('')
  const [novoPrimeiroNome, setNovoPrimeiroNome] = useState('')
  const [novoEmail, setNovoEmail] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [novoRole, setNovoRole] = useState<Role>('user')
  const [adicionando, setAdicionando] = useState(false)
  const [mensagemAdicionar, setMensagemAdicionar] = useState('')
  const [editandoProfileId, setEditandoProfileId] = useState<string | null>(null)
  const [editNome, setEditNome] = useState('')
  const [editPrimeiroNome, setEditPrimeiroNome] = useState('')
  const [confirmandoExclusaoId, setConfirmandoExclusaoId] = useState<string | null>(null)

  const carregar = useCallback(async (mes: string) => {
    setLoading(true)
    setErroSalvar('')
    const mesNum = mesNumero(mes)

    if (DEMO_MODE) {
      const profList = getDemoProfiles()
      const cfg = getDemoConfig(mesNum)
      const resultados = getDemoResultadosMes(mesNum)
      setProfiles(profList)
      setConfig(cfg)
      setValores(profList.map(p => {
        const r = resultados.find(x => x.profile_id === p.id)
        return { profile_id: p.id, realizado: r?.realizado ?? 0, comissao: r?.comissao_avaliacoes ?? 0, feedback: r?.nota_feedback ?? 0 }
      }))
      setLoading(false)
      return
    }

    const supabase = createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (currentProfile?.role !== 'admin' || user.email?.toLowerCase() === 'gestao@clinica.com') {
      router.push(currentProfile?.role === 'admin' ? '/admin' : '/painel')
      return
    }

    const [{ data: profs }, { data: cfg }, { data: resultados }] = await Promise.all([
      supabase.from('profiles').select('*').eq('ativo', true).eq('role', 'user').order('nome'),
      supabase.from('configuracoes_mes').select('*').eq('mes', mesNum).eq('ano', ANO).single(),
      supabase.from('resultados').select('*').eq('mes', mesNum).eq('ano', ANO),
    ])

    const profList: Profile[] = profs ?? []
    setProfiles(profList)
    setConfig(cfg ? cfg : { ...CONFIG_PADRAO, mes: mesNum })
    setValores(profList.map(p => {
      const r = resultados?.find(x => x.profile_id === p.id)
      return { profile_id: p.id, realizado: r?.realizado ?? 0, comissao: r?.comissao_avaliacoes ?? 0, feedback: r?.nota_feedback ?? 0 }
    }))
    setLoading(false)
  }, [router])

  useEffect(() => { queueMicrotask(() => { carregar(mesSelecionado) }) }, [mesSelecionado, carregar])

  async function handleSalvar() {
    setSaving(true)
    setErroSalvar('')
    const mesNum = mesNumero(mesSelecionado)

    try {
      if (DEMO_MODE) {
        salvarDemoMes(config, valores, mesNum, ANO)
        await carregar(mesSelecionado)
        setSalvo(true)
        setTimeout(() => setSalvo(false), 3000)
        return
      }

      const supabase = createClient()

      const { error: configError } = await supabase.from('configuracoes_mes').upsert(
        { ...config, mes: mesNum, ano: ANO },
        { onConflict: 'mes,ano' }
      )

      if (configError) throw configError

      const { error: resultadosError } = await supabase.from('resultados').upsert(
        valores.map(v => ({
          profile_id: v.profile_id,
          mes: mesNum,
          ano: ANO,
          realizado: v.realizado,
          comissao_avaliacoes: v.comissao,
          nota_feedback: v.feedback,
        })),
        { onConflict: 'profile_id,mes,ano' }
      )

      if (resultadosError) throw resultadosError

      await carregar(mesSelecionado)
      setSalvo(true)
      setTimeout(() => setSalvo(false), 3000)
    } catch (error) {
      console.error('Erro ao salvar metas', error)
      setErroSalvar('Nao foi possivel salvar as alteracoes. Verifique sua conexao e as permissoes do acesso admin.')
    } finally {
      setSaving(false)
    }
  }

  async function handleAdicionarProfissional(event: React.SyntheticEvent) {
    event.preventDefault()
    setErroSalvar('')
    setMensagemAdicionar('')

    const nome = novoNome.trim().replace(/\s+/g, ' ')
    const primeiroNome = (novoPrimeiroNome.trim() || nome.split(' ')[0] || '').replace(/\s+/g, ' ')

    if (nome.length < 3 || primeiroNome.length < 2) {
      setErroSalvar('Informe o nome completo e o primeiro nome do acesso.')
      return
    }

    setAdicionando(true)

    try {
      if (DEMO_MODE) {
        adicionarDemoProfissional(nome, primeiroNome)
        setNovoNome('')
        setNovoPrimeiroNome('')
        setNovoRole('user')
        setMensagemAdicionar('Profissional adicionada com metas e resultados zerados para todos os meses.')
        await carregar(mesSelecionado)
        return
      }

      const email = novoEmail.trim().toLowerCase()
      const senha = novaSenha.trim()

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setErroSalvar('Informe um e-mail valido para criar o acesso no Supabase Auth.')
        return
      }

      if (senha.length < 6) {
        setErroSalvar('A senha inicial precisa ter pelo menos 6 caracteres.')
        return
      }

      const functionUrl = getCriarProfissionalUrl()
      if (!functionUrl) {
        setErroSalvar('Configure NEXT_PUBLIC_SUPABASE_URL para criar acessos automaticamente.')
        return
      }

      const supabase = createClient()
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (sessionError || !accessToken) {
        setErroSalvar('Sessao admin expirada. Entre novamente para criar o acesso.')
        return
      }

      const response = await fetch(functionUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nome,
          primeiro_nome: primeiroNome,
          email,
          password: senha,
          role: novoRole,
        }),
      })

      const payload = await response.json().catch(() => ({} as { error?: string }))
      if (!response.ok) {
        throw new Error(payload.error || 'Nao foi possivel criar o acesso no Supabase Auth.')
      }

      setNovoNome('')
      setNovoPrimeiroNome('')
      setNovoEmail('')
      setNovaSenha('')
      setNovoRole('user')
      setMensagemAdicionar(novoRole === 'user'
        ? 'Profissional criada no Supabase Auth, vinculada ao painel e liberada nas metas.'
        : 'Acesso Gestão criado com visualização administrativa sem edição.'
      )
      await carregar(mesSelecionado)
    } catch (error) {
      console.error('Erro ao adicionar profissional', error)
      setErroSalvar('Nao foi possivel adicionar a profissional. Verifique as permissoes do admin e se o usuario ja existe no Supabase Auth.')
    } finally {
      setAdicionando(false)
    }
  }

  function iniciarEdicaoProfissional(profile: Profile) {
    setEditandoProfileId(profile.id)
    setEditNome(profile.nome)
    setEditPrimeiroNome(profile.primeiro_nome)
    setErroSalvar('')
    setMensagemAdicionar('')
  }

  async function salvarEdicaoProfissional(profileId: string) {
    const nome = editNome.trim().replace(/\s+/g, ' ')
    const primeiroNome = (editPrimeiroNome.trim() || nome.split(' ')[0] || '').replace(/\s+/g, ' ')

    if (nome.length < 3 || primeiroNome.length < 2) {
      setErroSalvar('Informe o nome completo e o primeiro nome da profissional.')
      return
    }

    setAdicionando(true)
    setErroSalvar('')

    try {
      if (DEMO_MODE) {
        atualizarDemoProfissional(profileId, nome, primeiroNome)
      } else {
        const supabase = createClient()
        const { error } = await supabase
          .from('profiles')
          .update({ nome, primeiro_nome: primeiroNome, ativo: true, role: 'user' })
          .eq('id', profileId)

        if (error) throw error
      }

      setEditandoProfileId(null)
      setMensagemAdicionar('Profissional atualizada com sucesso.')
      await carregar(mesSelecionado)
    } catch (error) {
      console.error('Erro ao editar profissional', error)
      setErroSalvar('Nao foi possivel editar a profissional. Verifique as permissoes do admin.')
    } finally {
      setAdicionando(false)
    }
  }

  async function excluirProfissional(profile: Profile) {
    setAdicionando(true)
    setErroSalvar('')
    setMensagemAdicionar('')

    try {
      if (DEMO_MODE) {
        excluirDemoProfissional(profile.id)
      } else {
        const supabase = createClient()
        const { error } = await supabase
          .from('profiles')
          .update({ ativo: false })
          .eq('id', profile.id)

        if (error) throw error
      }

      setValores(prev => prev.filter(valor => valor.profile_id !== profile.id))
      setConfirmandoExclusaoId(null)
      setMensagemAdicionar('Profissional excluida dos paineis e rankings.')
      await carregar(mesSelecionado)
    } catch (error) {
      console.error('Erro ao excluir profissional', error)
      setErroSalvar('Nao foi possivel excluir a profissional. Verifique as permissoes do admin.')
    } finally {
      setAdicionando(false)
    }
  }

  async function handleSair() {
    if (DEMO_MODE) {
      router.push('/login')
      return
    }

    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const totalRealizado = valores.reduce((s, v) => s + v.realizado, 0)
  const totalBonus = valores.reduce((s, v) => s + calcBonus(v.realizado, config.meta_gatilho, config.meta_max, totalRealizado, config.meta_clinica), 0)
  const totalComissaoAvaliacoes = valores.reduce((s, v) => s + calcComissaoAvaliacoes(v.comissao), 0)
  const notasFeedback = valores.map(v => v.feedback).filter(nota => nota > 0)
  const mediaFeedback = notasFeedback.length > 0 ? notasFeedback.reduce((s, nota) => s + nota, 0) / notasFeedback.length : 0
  const pctClinica = config.meta_clinica > 0 ? ((totalRealizado / config.meta_clinica) * 100).toFixed(1) : '0.0'
  const metaClinicaBatida = totalRealizado >= config.meta_clinica

  return (
    <div className="app-shell" style={{ display: 'flex', minHeight: '100vh' }}>
      <aside className="app-sidebar" style={{
        width: 240, background: 'rgba(0,0,0,0.4)', borderRight: '1px solid rgba(255,255,255,0.06)',
        padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0,
      }}>
        <div className="sidebar-brand" style={{ marginBottom: 24, padding: '0 8px' }}>
          <div style={{ marginBottom: 8 }}>
            <Image src={assetPath('/logo.png')} alt="Roseane Débora Centro Estético" width={130} height={130}
              style={{ objectFit: 'contain', filter: 'invert(1)', mixBlendMode: 'screen' }} />
          </div>
          <div style={{ fontSize: 11, color: 'rgba(240,230,255,0.4)' }}>Painel Administrativo</div>
        </div>

        <Link href="/admin" style={{ textDecoration: 'none' }}>
          <div className="nav-link">📊 Dashboard</div>
        </Link>
        <div className="nav-link active">✏️ Editar Metas</div>

        <div style={{ marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 16 }}>
          <button onClick={handleSair} style={{ background: 'none', border: 'none', width: '100%', cursor: 'pointer', padding: 0 }}>
            <div className="nav-link">🚪 Sair</div>
          </button>
        </div>
      </aside>

      <main className="app-main" style={{ flex: 1, padding: '28px 32px', overflowY: 'auto' }}>
        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
              <span className="gradient-text">✏️ Editar Metas</span>
            </h1>
            <p style={{ color: 'rgba(240,230,255,0.45)', fontSize: 14 }}>Atualize os valores diretamente pelo painel</p>
          </div>
          <div className="header-actions" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <select
              value={mesSelecionado}
              onChange={e => setMesSelecionado(e.target.value)}
              className="input-field"
              style={{ width: 'auto' }}
            >
              {MESES_LISTA.map(m => (
                <option key={m} value={m} style={{ background: '#1a0a2e' }}>{m}</option>
              ))}
            </select>
            <button onClick={handleSalvar} className="btn-primary"
              style={{ width: 'auto', padding: '10px 24px' }} disabled={saving || loading}>
              {salvo ? '✅ Salvo!' : saving ? 'Salvando...' : '💾 Salvar'}
            </button>
          </div>
        </div>

        {erroSalvar && (
          <div className="glass-sm" style={{
            padding: '12px 16px', marginBottom: 18, borderColor: 'rgba(248,113,113,0.35)',
            color: '#fecaca', fontSize: 13,
          }}>
            {erroSalvar}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'rgba(240,230,255,0.4)' }}>Carregando...</div>
        ) : (
          <>
            <form onSubmit={handleAdicionarProfissional} className="glass-sm" style={{ padding: 24, marginBottom: 24 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Adicionar profissional</h3>
              <p style={{ fontSize: 12, color: 'rgba(240,230,255,0.45)', marginBottom: 18 }}>
                Informe nome, e-mail e senha inicial. O acesso no Supabase Auth e o UUID individual serao criados automaticamente.
              </p>
              <div className="responsive-grid edit-config-grid" style={{ display: 'grid', gridTemplateColumns: DEMO_MODE ? '1.5fr 1fr 0.9fr auto' : '1.1fr 0.8fr 0.8fr 1.1fr 0.9fr auto', gap: 12, alignItems: 'end' }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'rgba(240,230,255,0.5)', marginBottom: 8, fontWeight: 500 }}>
                    Nome completo
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    value={novoNome}
                    onChange={e => setNovoNome(e.target.value)}
                    placeholder="Nome da profissional"
                    required
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'rgba(240,230,255,0.5)', marginBottom: 8, fontWeight: 500 }}>
                    Primeiro nome
                  </label>
                  <input
                    type="text"
                    className="input-field"
                    value={novoPrimeiroNome}
                    onChange={e => setNovoPrimeiroNome(e.target.value)}
                    placeholder="Ex.: Ana"
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'rgba(240,230,255,0.5)', marginBottom: 8, fontWeight: 500 }}>
                    Perfil de acesso
                  </label>
                  <select
                    className="input-field"
                    value={novoRole}
                    onChange={e => setNovoRole(e.target.value as Role)}
                  >
                    <option value="user" style={{ background: '#1a0a2e' }}>Esteticista</option>
                    <option value="gestao" style={{ background: '#1a0a2e' }}>Gestão</option>
                  </select>
                </div>
                {!DEMO_MODE && (
                  <>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: 'rgba(240,230,255,0.5)', marginBottom: 8, fontWeight: 500 }}>
                        E-mail de acesso
                      </label>
                      <input
                        type="email"
                        className="input-field"
                        value={novoEmail}
                        onChange={e => setNovoEmail(e.target.value)}
                        placeholder="email@clinica.com"
                        required
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: 'rgba(240,230,255,0.5)', marginBottom: 8, fontWeight: 500 }}>
                        Senha inicial
                      </label>
                      <input
                        type="text"
                        className="input-field"
                        value={novaSenha}
                        onChange={e => setNovaSenha(e.target.value)}
                        placeholder="Minimo 6 caracteres"
                        required
                      />
                    </div>
                  </>
                )}
                <button type="submit" className="btn-primary" style={{ width: 'auto', padding: '10px 18px' }} disabled={adicionando}>
                  {adicionando ? 'Adicionando...' : 'Adicionar'}
                </button>
              </div>
              {mensagemAdicionar && (
                <div style={{ marginTop: 12, color: '#86efac', fontSize: 13 }}>
                  {mensagemAdicionar}
                </div>
              )}
            </form>

            <div className="glass-sm" style={{ padding: 24, marginBottom: 24 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 20 }}>⚙️ Configurações do Mês — {mesSelecionado}</h3>
              <div className="responsive-grid edit-config-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                {([
                  { label: 'Meta Clínica (R$)', key: 'meta_clinica' },
                  { label: 'Meta Gatilho por Prof. (R$)', key: 'meta_gatilho' },
                  { label: 'Meta Mês por Prof. (R$)', key: 'meta_max' },
                ] as { label: string; key: keyof ConfiguracoesMes }[]).map(item => (
                  <div key={item.key}>
                    <label style={{ display: 'block', fontSize: 12, color: 'rgba(240,230,255,0.5)', marginBottom: 8, fontWeight: 500 }}>
                      {item.label}
                    </label>
                    <input
                      type="number"
                      className="input-field"
                      value={config[item.key] as number}
                      onChange={e => setConfig(prev => ({ ...prev, [item.key]: Number(e.target.value) }))}
                      step="1000"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-sm" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                <h3 style={{ fontSize: 15, fontWeight: 600 }}>👩‍⚕️ Resultados por Profissional — {mesSelecionado}</h3>
                <p style={{ fontSize: 12, color: 'rgba(240,230,255,0.4)', marginTop: 4 }}>
                  Edite o realizado e as vendas de avaliações. Bônus, comissão de 7% e status são calculados automaticamente.
                </p>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                      {['Profissional', 'Realizado (R$)', 'Vendas Avaliações (R$)', 'Feedback (1-10)', 'Comissão 7%', '% Meta', 'Status', 'Bônus (calc.)'].map(h => (
                        <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, color: 'rgba(240,230,255,0.4)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {profiles.map((prof) => {
                      const v = valores.find(valor => valor.profile_id === prof.id) ?? { profile_id: prof.id, realizado: 0, comissao: 0, feedback: 0 }
                      const pct = calcPctMeta(v.realizado, config.meta_max)
                      const status = calcStatus(v.realizado, config.meta_gatilho, config.meta_max)
                      const bonus = calcBonus(v.realizado, config.meta_gatilho, config.meta_max, totalRealizado, config.meta_clinica)
                      const comissaoAvaliacoes = calcComissaoAvaliacoes(v.comissao)
                      const statusCls = getStatusClass(status)
                      const editando = editandoProfileId === prof.id

                      return (
                        <tr key={prof.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '14px 16px', fontSize: 13, fontWeight: 500, minWidth: 300 }}>
                            {editando ? (
                              <div style={{ display: 'grid', gap: 8 }}>
                                <input
                                  type="text"
                                  className="input-field"
                                  value={editNome}
                                  onChange={e => setEditNome(e.target.value)}
                                  style={{ padding: '8px 10px', fontSize: 13 }}
                                />
                                <input
                                  type="text"
                                  className="input-field"
                                  value={editPrimeiroNome}
                                  onChange={e => setEditPrimeiroNome(e.target.value)}
                                  style={{ padding: '8px 10px', fontSize: 13 }}
                                />
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                  <button type="button" className="btn-primary" onClick={() => salvarEdicaoProfissional(prof.id)} disabled={adicionando}
                                    style={{ width: 'auto', padding: '7px 10px', fontSize: 12 }}>
                                    Salvar
                                  </button>
                                  <button type="button" onClick={() => setEditandoProfileId(null)}
                                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#f0e6ff', borderRadius: 8, padding: '7px 10px', cursor: 'pointer', fontSize: 12 }}>
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                <span style={{ whiteSpace: 'nowrap' }}>{prof.nome}</span>
                                <button type="button" onClick={() => iniciarEdicaoProfissional(prof)}
                                  style={{ background: 'rgba(192,132,252,0.12)', border: '1px solid rgba(192,132,252,0.22)', color: '#e9d5ff', borderRadius: 8, padding: '6px 9px', cursor: 'pointer', fontSize: 12 }}>
                                  Editar
                                </button>
                                {confirmandoExclusaoId === prof.id ? (
                                  <>
                                    <button type="button" onClick={() => excluirProfissional(prof)} disabled={adicionando}
                                      style={{ background: 'rgba(248,113,113,0.18)', border: '1px solid rgba(248,113,113,0.35)', color: '#fecaca', borderRadius: 8, padding: '6px 9px', cursor: 'pointer', fontSize: 12 }}>
                                      Confirmar
                                    </button>
                                    <button type="button" onClick={() => setConfirmandoExclusaoId(null)}
                                      style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#f0e6ff', borderRadius: 8, padding: '6px 9px', cursor: 'pointer', fontSize: 12 }}>
                                      Cancelar
                                    </button>
                                  </>
                                ) : (
                                  <button type="button" onClick={() => setConfirmandoExclusaoId(prof.id)}
                                    style={{ background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.22)', color: '#fecaca', borderRadius: 8, padding: '6px 9px', cursor: 'pointer', fontSize: 12 }}>
                                    Excluir
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '14px 16px' }}>
                            <input
                              type="number"
                              className="input-field"
                              value={v.realizado}
                              onChange={e => setValores(prev => prev.map(x => x.profile_id === prof.id ? { ...x, realizado: Number(e.target.value) } : x))}
                              style={{ width: 140, padding: '8px 12px', fontSize: 13 }}
                              step="100"
                            />
                          </td>
                          <td style={{ padding: '14px 16px' }}>
                            <input
                              type="number"
                              className="input-field"
                              value={v.comissao}
                              onChange={e => setValores(prev => prev.map(x => x.profile_id === prof.id ? { ...x, comissao: Number(e.target.value) } : x))}
                              style={{ width: 120, padding: '8px 12px', fontSize: 13 }}
                              step="100"
                            />
                          </td>
                          <td style={{ padding: '14px 16px' }}>
                            <input
                              type="number"
                              className="input-field"
                              value={v.feedback}
                              onChange={e => setValores(prev => prev.map(x => x.profile_id === prof.id ? { ...x, feedback: Math.max(0, Math.min(10, Number(e.target.value))) } : x))}
                              style={{ width: 110, padding: '8px 12px', fontSize: 13 }}
                              min="0"
                              max="10"
                              step="0.1"
                            />
                          </td>
                          <td style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600, color: '#facc15', whiteSpace: 'nowrap' }}>{formatBRL(comissaoAvaliacoes)}</td>
                          <td style={{ padding: '14px 16px', fontSize: 13, fontWeight: 600 }}>{pct}%</td>
                          <td style={{ padding: '14px 16px' }}>
                            <span className={statusCls}>{status}</span>
                          </td>
                          <td style={{ padding: '14px 16px', fontSize: 14, fontWeight: 700, color: '#c084fc', whiteSpace: 'nowrap' }}>
                            {formatBRL(bonus)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="glass-sm" style={{ padding: 24, marginTop: 24 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>📋 Resumo Calculado Automaticamente</h3>
              <div className="responsive-grid edit-summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 16 }}>
                {[
                  { label: 'Total Realizado', valor: formatBRL(totalRealizado), cor: '#f472b6' },
                  { label: 'Total Bônus', valor: formatBRL(totalBonus), cor: '#c084fc' },
                  { label: 'Comissão Avaliações', valor: formatBRL(totalComissaoAvaliacoes), cor: '#facc15' },
                  { label: 'Média Feedback', valor: mediaFeedback > 0 ? mediaFeedback.toFixed(1) : 'Sem notas', cor: mediaFeedback >= 8 ? '#4ade80' : mediaFeedback >= 6 ? '#facc15' : '#f87171' },
                  { label: '% Meta Clínica', valor: `${pctClinica}%`, cor: Number(pctClinica) >= 100 ? '#4ade80' : '#facc15' },
                  { label: 'Regra abaixo gatilho', valor: metaClinicaBatida ? 'MGM atingida' : 'MGM não atingida', cor: metaClinicaBatida ? '#4ade80' : '#f87171' },
                ].map((c, i) => (
                  <div key={i} style={{ padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12 }}>
                    <div style={{ fontSize: 11, color: 'rgba(240,230,255,0.4)', marginBottom: 6 }}>{c.label}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: c.cor }}>{c.valor}</div>
                  </div>
                ))}
              </div>
            </div>

            <AlterarSenhaCard />
          </>
        )}
      </main>

      <DecoracaoDireita />
    </div>
  )
}
