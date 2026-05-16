'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile, ConfiguracoesMes, Resultado } from '@/lib/types'
import {
  MESES_LISTA, formatBRL, getStatusClass, getProgressColor,
  getMedalEmoji, calcBonus, calcStatus, calcPctGatilho,
  calcPctMeta, getMensagem, getMensagemAnual, mesNumero,
  calcComissaoAvaliacoes, calcTotalReceber,
} from '@/lib/formulas'
import DecoracaoDireita from '@/components/DecoracaoDireita'
import AlterarSenhaCard from '@/components/AlterarSenhaCard'
import { DEMO_MODE, DEMO_PROFILES, getDemoConfig, getDemoResultadosMes, getDemoResultadosAnual } from '@/lib/demo-data'

type Aba = 'mensal' | 'anual' | 'bonus'

export default function AdminPage() {
  const router = useRouter()
  const [mesSelecionado, setMesSelecionado] = useState(MESES_LISTA[new Date().getMonth()])
  const [aba, setAba] = useState<Aba>('mensal')
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [config, setConfig] = useState<ConfiguracoesMes | null>(null)
  const [resultados, setResultados] = useState<Resultado[]>([])
  const [todosResultados, setTodosResultados] = useState<Resultado[]>([])
  const [loading, setLoading] = useState(true)

  const mesNum = mesNumero(mesSelecionado)

  const carregarDados = useCallback(async () => {
    setLoading(true)

    if (DEMO_MODE) {
      setProfiles(DEMO_PROFILES)
      setConfig(getDemoConfig(mesNum))
      setResultados(getDemoResultadosMes(mesNum))
      setTodosResultados(getDemoResultadosAnual(12))
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

    const [{ data: profs }, { data: cfg }, { data: res }, { data: anuais }] = await Promise.all([
      supabase.from('profiles').select('*').eq('ativo', true).eq('role', 'user').order('nome'),
      supabase.from('configuracoes_mes').select('*').eq('mes', mesNum).eq('ano', 2025).single(),
      supabase.from('resultados').select('*').eq('mes', mesNum).eq('ano', 2025),
      supabase.from('resultados').select('*').eq('ano', 2025),
    ])

    setProfiles(profs ?? [])
    setConfig(cfg ?? null)
    setResultados(res ?? [])
    setTodosResultados(anuais ?? [])
    setLoading(false)
  }, [mesNum, router])

  useEffect(() => { queueMicrotask(() => { carregarDados() }) }, [carregarDados])

  async function handleSair() {
    if (DEMO_MODE) {
      router.push('/login')
      return
    }

    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const cfg = config ?? { meta_clinica: 55000, meta_gatilho: 15000, meta_max: 18000, meta_individual_anual: 187000 }

  function getRes(profileId: string) {
    return resultados.find(r => r.profile_id === profileId) ?? { realizado: 0, comissao_avaliacoes: 0, profile_id: profileId, mes: mesNum, ano: 2025 }
  }

  const totalRealizado = profiles.reduce((s, p) => s + getRes(p.id).realizado, 0)
  const faltaClinica = Math.max(0, cfg.meta_clinica - totalRealizado)
  const ticketMedio = profiles.length > 0 ? totalRealizado / profiles.length : 0
  const metaClinicaBatida = totalRealizado >= cfg.meta_clinica

  // Ranking mensal ordenado
  const rankingMensal = [...profiles]
    .map(p => {
      const r = getRes(p.id)
      const vendasAvaliacoes = r.comissao_avaliacoes ?? 0
      const bonus = calcBonus(r.realizado, cfg.meta_gatilho, cfg.meta_max, totalRealizado, cfg.meta_clinica)
      return {
        ...p,
        realizado: r.realizado,
        vendas_avaliacoes: vendasAvaliacoes,
        comissao_avaliacoes: calcComissaoAvaliacoes(vendasAvaliacoes),
        pctGatilho: calcPctGatilho(r.realizado, cfg.meta_gatilho),
        pctMeta: calcPctMeta(r.realizado, cfg.meta_max),
        status: calcStatus(r.realizado, cfg.meta_gatilho, cfg.meta_max),
        bonus,
        totalReceber: calcTotalReceber(bonus, vendasAvaliacoes),
      }
    })
    .sort((a, b) => b.realizado - a.realizado)
    .map((p, i) => ({ ...p, pos: i + 1, mensagem: getMensagem(i + 1) }))

  // Ranking anual acumulado
  const rankingAnual = [...profiles]
    .map(p => {
      const acumulado = todosResultados
        .filter(r => r.profile_id === p.id)
        .reduce((s, r) => s + r.realizado, 0)
      return { ...p, acumulado, pctMeta: calcPctMeta(acumulado, cfg.meta_individual_anual), falta: Math.max(0, cfg.meta_individual_anual - acumulado) }
    })
    .sort((a, b) => b.acumulado - a.acumulado)
    .map((p, i) => ({ ...p, pos: i + 1, mensagem: getMensagemAnual(i + 1) }))

  const pctClinica = calcPctMeta(totalRealizado, cfg.meta_clinica)
  const totalComissoes = rankingMensal.reduce((s, p) => s + p.comissao_avaliacoes, 0)

  const totalBonus = rankingMensal.reduce((s, p) => s + p.bonus, 0)
  const totalVendasAvaliacao = rankingMensal.reduce((s, p) => s + p.vendas_avaliacoes, 0)
  const totalGeral = totalBonus + totalComissoes

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside style={{ width: 230, background: 'rgba(0,0,0,0.4)', borderRight: '1px solid rgba(255,255,255,0.06)', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
        <div style={{ marginBottom: 20, padding: '0 8px' }}>
          <Image src="/logo.png" alt="Logo" width={130} height={130} style={{ objectFit: 'contain', filter: 'invert(1)', mixBlendMode: 'screen' }} />
          <div style={{ fontSize: 11, color: 'rgba(240,230,255,0.4)', marginTop: 4 }}>Painel Administrativo</div>
        </div>
        <div className="nav-link active">📊 Dashboard</div>
        <Link href="/admin/editar" style={{ textDecoration: 'none' }}><div className="nav-link">✏️ Editar Metas</div></Link>
        <div style={{ marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 16 }}>
          <button onClick={handleSair} style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer' }}>
            <div className="nav-link">🚪 Sair</div>
          </button>
        </div>
      </aside>

      {/* Conteúdo */}
      <main style={{ flex: 1, padding: '28px 32px', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}><span className="gradient-text">Painel de Metas</span></h1>
            <p style={{ color: 'rgba(240,230,255,0.45)', fontSize: 14 }}>Visão geral de todas as profissionais</p>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <select value={mesSelecionado} onChange={e => setMesSelecionado(e.target.value)} className="input-field" style={{ width: 'auto' }}>
              {MESES_LISTA.map(m => <option key={m} value={m} style={{ background: '#1a0a2e' }}>{m}</option>)}
            </select>
            <div style={{ background: 'rgba(244,114,182,0.1)', border: '1px solid rgba(244,114,182,0.2)', borderRadius: 10, padding: '8px 14px', fontSize: 13, color: '#f472b6' }}>👤 Admin</div>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'rgba(240,230,255,0.4)' }}>Carregando dados...</div>
        ) : (
          <>
            {/* Cards resumo */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 24 }}>
              {[
                { label: 'Faturamento do Mês', valor: formatBRL(totalRealizado), icon: '💰', cor: '#f472b6' },
                { label: 'Meta Clínica', valor: formatBRL(cfg.meta_clinica), icon: '🎯', cor: '#c084fc' },
                { label: '% Atingimento', valor: `${pctClinica}%`, icon: '📈', cor: pctClinica >= 100 ? '#4ade80' : '#facc15' },
                { label: 'Falta p/ Meta', valor: formatBRL(faltaClinica), icon: 'R$', cor: faltaClinica === 0 ? '#4ade80' : '#facc15' },
                { label: 'Ticket Médio / Prof.', valor: formatBRL(ticketMedio), icon: 'TM', cor: '#38bdf8' },
                { label: 'Comissão Avaliações (7%)', valor: formatBRL(totalComissoes), icon: '7%', cor: '#facc15' },
              ].map((c, i) => (
                <div key={i} className="glass-sm" style={{ padding: 20 }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>{c.icon}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: c.cor, marginBottom: 4 }}>{c.valor}</div>
                  <div style={{ fontSize: 12, color: 'rgba(240,230,255,0.45)' }}>{c.label}</div>
                </div>
              ))}
            </div>

            {/* Metas */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 24 }}>
              {[
                { label: 'Meta Gatilho por Prof. (mín)', valor: formatBRL(cfg.meta_gatilho) },
                { label: 'Meta Mês por Prof. (máx)', valor: formatBRL(cfg.meta_max) },
                { label: 'Regra abaixo do gatilho', valor: metaClinicaBatida ? 'MGM atingida' : 'MGM não atingida' },
              ].map((c, i) => (
                <div key={i} className="glass-sm" style={{ padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 13, color: 'rgba(240,230,255,0.5)' }}>{c.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 700 }}>{c.valor}</div>
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {([['mensal','📅 Ranking Mensal'],['anual','🏆 Ranking Anual'],['bonus','💰 Bônus e Comissões']] as const).map(([t, label]) => (
                <button key={t} onClick={() => setAba(t)} style={{
                  padding: '8px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
                  background: aba === t ? 'linear-gradient(135deg,#be185d,#7c3aed)' : 'rgba(255,255,255,0.05)',
                  color: aba === t ? 'white' : 'rgba(240,230,255,0.5)',
                  fontWeight: 600, fontSize: 14,
                }}>{label}</button>
              ))}
            </div>

            {/* ABA: Ranking Mensal */}
            {aba === 'mensal' && (
              <div className="glass-sm" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <h2 style={{ fontSize: 16, fontWeight: 600 }}>🏅 Ranking Mensal — {mesSelecionado.toUpperCase()}</h2>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                      {['Pos.','Profissional','Realizado','% Gatilho','% Meta','Status','Bônus','Progresso'].map(h => (
                        <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, color: 'rgba(240,230,255,0.4)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {rankingMensal.map((p, i) => (
                        <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: 16, fontSize: 20 }}>{getMedalEmoji(p.pos)}</td>
                          <td style={{ padding: 16, fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap' }}>{p.nome}</td>
                          <td style={{ padding: 16, fontSize: 14, fontWeight: 700, color: '#f472b6', whiteSpace: 'nowrap' }}>{formatBRL(p.realizado)}</td>
                          <td style={{ padding: 16, fontSize: 14, color: p.pctGatilho >= 100 ? '#4ade80' : '#f87171' }}>{p.pctGatilho}%</td>
                          <td style={{ padding: 16, fontSize: 14, color: p.pctMeta >= 100 ? '#4ade80' : '#f87171' }}>{p.pctMeta}%</td>
                          <td style={{ padding: 16 }}><span className={getStatusClass(p.status)}>{p.status}</span></td>
                          <td style={{ padding: 16, fontSize: 14, fontWeight: 600, color: '#c084fc', whiteSpace: 'nowrap' }}>{formatBRL(p.bonus)}</td>
                          <td style={{ padding: 16, minWidth: 120 }}>
                            <div className="progress-track"><div className={getProgressColor(p.pctMeta)} style={{ width: `${Math.min(p.pctMeta, 100)}%` }} /></div>
                          </td>
                        </tr>
                      ))}
                      {profiles.length === 0 && (
                        <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'rgba(240,230,255,0.3)', fontSize: 14 }}>
                          Nenhum dado encontrado para {mesSelecionado}. Configure no painel de Editar Metas.
                        </td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ABA: Ranking Anual */}
            {aba === 'anual' && (
              <div className="glass-sm" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h2 style={{ fontSize: 16, fontWeight: 600 }}>🏆 Ranking Anual Acumulado</h2>
                  <span style={{ fontSize: 13, color: 'rgba(240,230,255,0.45)' }}>Meta: {formatBRL(cfg.meta_individual_anual)}</span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                      {['Pos.','Profissional','Acumulado','% Meta','Falta','Progresso'].map(h => (
                        <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, color: 'rgba(240,230,255,0.4)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {rankingAnual.map((p, i) => (
                        <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: 16, fontSize: 20 }}>{getMedalEmoji(p.pos)}</td>
                          <td style={{ padding: 16, fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap' }}>{p.nome}</td>
                          <td style={{ padding: 16, fontSize: 14, fontWeight: 700, color: '#f472b6', whiteSpace: 'nowrap' }}>{formatBRL(p.acumulado)}</td>
                          <td style={{ padding: 16, fontSize: 14 }}>{p.pctMeta}%</td>
                          <td style={{ padding: 16, fontSize: 14, color: '#f87171', whiteSpace: 'nowrap' }}>{formatBRL(p.falta)}</td>
                          <td style={{ padding: 16, minWidth: 150 }}>
                            <div className="progress-track"><div className={getProgressColor(p.pctMeta)} style={{ width: `${Math.min(p.pctMeta, 100)}%` }} /></div>
                            <div style={{ fontSize: 11, color: 'rgba(240,230,255,0.4)', marginTop: 4 }}>{p.pctMeta}%</div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ABA: Bônus e Comissões */}
            {aba === 'bonus' && (
              <>
                <div className="glass-sm" style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>
                  <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <h2 style={{ fontSize: 16, fontWeight: 600 }}>💰 Bônus e Comissões — {mesSelecionado.toUpperCase()}</h2>
                    <p style={{ fontSize: 12, color: 'rgba(240,230,255,0.4)', marginTop: 4 }}>Bônus = min(R$ 1.350, R$ 1.350 x realizado / MMmax). Abaixo do gatilho só recebe se a MGM for atingida. Comissão = 7% das vendas de avaliações.</p>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                        {['Pos.','Profissional','Realizado','Bônus de Meta','Vendas Avaliações','Comissão (7%)','Total a Receber'].map(h => (
                          <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, color: 'rgba(240,230,255,0.4)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {rankingMensal.map((p, i) => (
                          <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                            <td style={{ padding: 16, fontSize: 20 }}>{getMedalEmoji(p.pos)}</td>
                            <td style={{ padding: 16, fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap' }}>{p.nome}</td>
                            <td style={{ padding: 16, fontSize: 14, fontWeight: 600, color: '#f472b6', whiteSpace: 'nowrap' }}>{formatBRL(p.realizado)}</td>
                            <td style={{ padding: 16, fontSize: 14, fontWeight: 600, color: '#c084fc', whiteSpace: 'nowrap' }}>{formatBRL(p.bonus)}</td>
                            <td style={{ padding: 16, fontSize: 14, color: p.vendas_avaliacoes > 0 ? '#facc15' : 'rgba(240,230,255,0.3)', whiteSpace: 'nowrap' }}>
                              {formatBRL(p.vendas_avaliacoes)}
                            </td>
                            <td style={{ padding: 16, fontSize: 14, color: p.comissao_avaliacoes > 0 ? '#facc15' : 'rgba(240,230,255,0.3)', whiteSpace: 'nowrap' }}>
                              {formatBRL(p.comissao_avaliacoes)}
                            </td>
                            <td style={{ padding: 16, whiteSpace: 'nowrap' }}>
                              <span style={{ fontSize: 16, fontWeight: 800, color: '#4ade80' }}>{formatBRL(p.totalReceber)}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Cards totais */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
                  {[
                    { label: 'Total Bônus de Meta', valor: formatBRL(totalBonus), icon: '🏆', cor: '#c084fc' },
                    { label: 'Total Vendas Avaliações', valor: formatBRL(totalVendasAvaliacao), icon: '📋', cor: '#38bdf8' },
                    { label: 'Total Com. Avaliações', valor: formatBRL(totalComissoes), icon: '💳', cor: '#facc15' },
                    { label: 'Total Geral a Pagar', valor: formatBRL(totalGeral), icon: '💰', cor: '#4ade80' },
                  ].map((c, i) => (
                    <div key={i} className="glass-sm" style={{ padding: 24, textAlign: 'center' }}>
                      <div style={{ fontSize: 28, marginBottom: 8 }}>{c.icon}</div>
                      <div style={{ fontSize: 24, fontWeight: 800, color: c.cor, marginBottom: 4 }}>{c.valor}</div>
                      <div style={{ fontSize: 13, color: 'rgba(240,230,255,0.45)' }}>{c.label}</div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <AlterarSenhaCard />
          </>
        )}
      </main>

      <DecoracaoDireita />
    </div>
  )
}
