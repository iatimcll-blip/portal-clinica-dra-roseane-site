'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import DecoracaoDireita from '@/components/DecoracaoDireita'
import AlterarSenhaCard from '@/components/AlterarSenhaCard'
import { createClient } from '@/lib/supabase/client'
import {
  MESES_LISTA, mesNumero, formatBRL, calcBonus, calcStatus, calcPctMeta,
  calcComissaoAvaliacoes, getStatusClass,
} from '@/lib/formulas'
import type { Profile, ConfiguracoesMes } from '@/lib/types'
import { DEMO_MODE, DEMO_PROFILES, getDemoConfig, getDemoResultadosMes } from '@/lib/demo-data'

const ANO = 2025

type ValorProf = { profile_id: string; realizado: number; comissao: number }

const CONFIG_PADRAO: ConfiguracoesMes = {
  id: 0, mes: 1, ano: ANO, meta_clinica: 80000, meta_gatilho: 8000, meta_max: 12000, meta_individual_anual: 120000,
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

  const carregar = useCallback(async (mes: string) => {
    setLoading(true)
    const mesNum = mesNumero(mes)

    if (DEMO_MODE) {
      const profList = DEMO_PROFILES
      const cfg = getDemoConfig(mesNum)
      const resultados = getDemoResultadosMes(mesNum)
      setProfiles(profList)
      setConfig(cfg)
      setValores(profList.map(p => {
        const r = resultados.find(x => x.profile_id === p.id)
        return { profile_id: p.id, realizado: r?.realizado ?? 0, comissao: r?.comissao_avaliacoes ?? 0 }
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

    if (currentProfile?.role !== 'admin') {
      router.push('/painel')
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
      return { profile_id: p.id, realizado: r?.realizado ?? 0, comissao: r?.comissao_avaliacoes ?? 0 }
    }))
    setLoading(false)
  }, [router])

  useEffect(() => { queueMicrotask(() => { carregar(mesSelecionado) }) }, [mesSelecionado, carregar])

  async function handleSalvar() {
    setSaving(true)

    if (DEMO_MODE) {
      await new Promise(r => setTimeout(r, 600))
      setSaving(false)
      setSalvo(true)
      setTimeout(() => setSalvo(false), 3000)
      return
    }

    const supabase = createClient()
    const mesNum = mesNumero(mesSelecionado)

    await supabase.from('configuracoes_mes').upsert(
      { ...config, mes: mesNum, ano: ANO },
      { onConflict: 'mes,ano' }
    )

    for (const v of valores) {
      await supabase.from('resultados').upsert(
        { profile_id: v.profile_id, mes: mesNum, ano: ANO, realizado: v.realizado, comissao_avaliacoes: v.comissao },
        { onConflict: 'profile_id,mes,ano' }
      )
    }

    setSaving(false)
    setSalvo(true)
    setTimeout(() => setSalvo(false), 3000)
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
  const pctClinica = config.meta_clinica > 0 ? ((totalRealizado / config.meta_clinica) * 100).toFixed(1) : '0.0'
  const metaClinicaBatida = totalRealizado >= config.meta_clinica

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{
        width: 240, background: 'rgba(0,0,0,0.4)', borderRight: '1px solid rgba(255,255,255,0.06)',
        padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0,
      }}>
        <div style={{ marginBottom: 24, padding: '0 8px' }}>
          <div style={{ marginBottom: 8 }}>
            <Image src="/logo.png" alt="Roseane Débora Centro Estético" width={130} height={130}
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

      <main style={{ flex: 1, padding: '28px 32px', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
              <span className="gradient-text">✏️ Editar Metas</span>
            </h1>
            <p style={{ color: 'rgba(240,230,255,0.45)', fontSize: 14 }}>Atualize os valores diretamente pelo painel</p>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
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
              style={{ width: 'auto', padding: '10px 24px' }} disabled={saving}>
              {salvo ? '✅ Salvo!' : saving ? 'Salvando...' : '💾 Salvar'}
            </button>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'rgba(240,230,255,0.4)' }}>Carregando...</div>
        ) : (
          <>
            <div className="glass-sm" style={{ padding: 24, marginBottom: 24 }}>
              <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 20 }}>⚙️ Configurações do Mês — {mesSelecionado}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
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
                      {['Profissional', 'Realizado (R$)', 'Vendas Avaliações (R$)', 'Comissão 7%', '% Meta', 'Status', 'Bônus (calc.)'].map(h => (
                        <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, color: 'rgba(240,230,255,0.4)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {profiles.map((prof, i) => {
                      const v = valores[i] ?? { profile_id: prof.id, realizado: 0, comissao: 0 }
                      const pct = calcPctMeta(v.realizado, config.meta_max)
                      const status = calcStatus(v.realizado, config.meta_gatilho, config.meta_max)
                      const bonus = calcBonus(v.realizado, config.meta_gatilho, config.meta_max, totalRealizado, config.meta_clinica)
                      const comissaoAvaliacoes = calcComissaoAvaliacoes(v.comissao)
                      const statusCls = getStatusClass(status)

                      return (
                        <tr key={prof.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '14px 16px', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>{prof.nome}</td>
                          <td style={{ padding: '14px 16px' }}>
                            <input
                              type="number"
                              className="input-field"
                              value={v.realizado}
                              onChange={e => setValores(prev => prev.map((x, idx) => idx === i ? { ...x, realizado: Number(e.target.value) } : x))}
                              style={{ width: 140, padding: '8px 12px', fontSize: 13 }}
                              step="100"
                            />
                          </td>
                          <td style={{ padding: '14px 16px' }}>
                            <input
                              type="number"
                              className="input-field"
                              value={v.comissao}
                              onChange={e => setValores(prev => prev.map((x, idx) => idx === i ? { ...x, comissao: Number(e.target.value) } : x))}
                              style={{ width: 120, padding: '8px 12px', fontSize: 13 }}
                              step="100"
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
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16 }}>
                {[
                  { label: 'Total Realizado', valor: formatBRL(totalRealizado), cor: '#f472b6' },
                  { label: 'Total Bônus', valor: formatBRL(totalBonus), cor: '#c084fc' },
                  { label: 'Comissão Avaliações', valor: formatBRL(totalComissaoAvaliacoes), cor: '#facc15' },
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
