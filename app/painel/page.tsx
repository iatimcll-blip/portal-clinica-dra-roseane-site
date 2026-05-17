'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import DecoracaoDireita from '@/components/DecoracaoDireita'
import AlterarSenhaCard from '@/components/AlterarSenhaCard'
import { createClient } from '@/lib/supabase/client'
import { assetPath } from '@/lib/asset-path'
import {
  MESES_LISTA, mesNumero, formatBRL, calcBonus, calcStatus,
  calcPctGatilho, calcPctMeta, getMensagem, getMensagemAnual,
  getMedalEmoji, getStatusClass,
} from '@/lib/formulas'
import type { Profile, ConfiguracoesMes, MaterialInformativo } from '@/lib/types'
import { DEMO_MODE, getDemoConfig, getDemoProfiles, getDemoResultadosMes, getDemoResultadosAnual, getDemoProfile } from '@/lib/demo-data'

const ANO = 2025
const BUCKET_MATERIAIS = 'materiais-informativos'

type DashboardProfissional = {
  realizado: number
  comissao_avaliacoes: number
  nota_feedback: number
  acumulado_anual: number
  media_feedback: number
  posicao_mensal: number
  posicao_anual: number
  total_clinica: number
}

export default function PainelProfissional() {
  const router = useRouter()
  const [mesSelecionado, setMesSelecionado] = useState(MESES_LISTA[new Date().getMonth()])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [config, setConfig] = useState<ConfiguracoesMes | null>(null)
  const [realizado, setRealizado] = useState(0)
  const [notaFeedback, setNotaFeedback] = useState(0)
  const [mediaFeedback, setMediaFeedback] = useState(0)
  const [acumuladoAnual, setAcumuladoAnual] = useState(0)
  const [posicao, setPosicao] = useState(1)
  const [posicaoAnual, setPosicaoAnual] = useState(1)
  const [totalClinicaMes, setTotalClinicaMes] = useState(0)
  const [materiais, setMateriais] = useState<MaterialInformativo[]>([])
  const [erroMateriais, setErroMateriais] = useState('')
  const [visualizadorPdf, setVisualizadorPdf] = useState<{ titulo: string; url: string } | null>(null)
  const [loading, setLoading] = useState(true)

  const carregar = useCallback(async (mes: string, uid: string) => {
    if (DEMO_MODE) {
      const mesNum = mesNumero(mes)
      const cfg = getDemoConfig(mesNum)
      const resMes = getDemoResultadosMes(mesNum)
      const resAnual = getDemoResultadosAnual(mesNum)
      const r = resMes.find(x => x.profile_id === uid)
      const acum = resAnual.filter(x => x.profile_id === uid).reduce((s, x) => s + x.realizado, 0)
      const notas = resAnual
        .filter(x => x.profile_id === uid && (x.nota_feedback ?? 0) > 0)
        .map(x => x.nota_feedback ?? 0)
      const sorted = [...resMes].sort((a, b) => b.realizado - a.realizado)
      const sortedAnual = getDemoProfiles()
        .map(p => ({
          profile_id: p.id,
          acumulado: resAnual.filter(x => x.profile_id === p.id).reduce((s, x) => s + x.realizado, 0),
        }))
        .sort((a, b) => b.acumulado - a.acumulado)
      const idx = sorted.findIndex(x => x.profile_id === uid)
      const idxAnual = sortedAnual.findIndex(x => x.profile_id === uid)
      setConfig(cfg)
      setRealizado(r?.realizado ?? 0)
      setNotaFeedback(r?.nota_feedback ?? 0)
      setMediaFeedback(notas.length > 0 ? notas.reduce((s, nota) => s + nota, 0) / notas.length : 0)
      setAcumuladoAnual(acum)
      setPosicao(idx >= 0 ? idx + 1 : 1)
      setPosicaoAnual(idxAnual >= 0 ? idxAnual + 1 : 1)
      setTotalClinicaMes(resMes.reduce((s, x) => s + x.realizado, 0))
      setMateriais([])
      return
    }

    const supabase = createClient()
    const mesNum = mesNumero(mes)

    const [{ data: cfg }, { data: painelRaw }, { data: materiaisData, error: materiaisError }] = await Promise.all([
      supabase.from('configuracoes_mes').select('*').eq('mes', mesNum).eq('ano', ANO).single(),
      supabase.rpc('get_professional_dashboard', { p_mes: mesNum, p_ano: ANO }).single(),
      supabase.from('materiais_informativos').select('*').eq('ativo', true).order('created_at', { ascending: false }),
    ])
    const painel = painelRaw as DashboardProfissional | null

    setConfig(cfg ?? null)
    setRealizado(painel?.realizado ?? 0)
    setNotaFeedback(painel?.nota_feedback ?? 0)
    setAcumuladoAnual(painel?.acumulado_anual ?? 0)
    setMediaFeedback(painel?.media_feedback ?? 0)
    setPosicao(painel?.posicao_mensal ?? 1)
    setPosicaoAnual(painel?.posicao_anual ?? 1)
    setTotalClinicaMes(painel?.total_clinica ?? 0)
    setMateriais(materiaisData ?? [])
    setErroMateriais(materiaisError ? 'Materiais informativos ainda não configurados no Supabase.' : '')
  }, [])

  useEffect(() => {
    if (DEMO_MODE) {
      queueMicrotask(() => {
        const storedId = localStorage.getItem('demo_user_id')
        const prof = storedId ? getDemoProfile(storedId) : getDemoProfiles()[0]
        setProfile(prof)
        setProfileId(prof.id)
      })
      return
    }

    const supabase = createClient()
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { router.push('/login'); return }
      const { data: prof } = await supabase.from('profiles').select('*').eq('id', user.id).single()
      if (!prof) { router.push('/login'); return }
      setProfile(prof)
      setProfileId(user.id)
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!profileId) return
    queueMicrotask(() => {
      setLoading(true)
      carregar(mesSelecionado, profileId).then(() => setLoading(false))
    })
  }, [mesSelecionado, profileId, carregar])

  async function handleSair() {
    if (DEMO_MODE) {
      localStorage.removeItem('demo_user_id')
      router.push('/login')
      return
    }

    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  function formatFileSize(bytes?: number | null) {
    if (!bytes) return 'Tamanho não informado'
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  function isPdfMaterial(material: MaterialInformativo) {
    return material.file_type === 'application/pdf' || material.file_name.toLowerCase().endsWith('.pdf')
  }

  async function handleAbrirMaterial(material: MaterialInformativo) {
    const supabase = createClient()
    const { data, error } = await supabase.storage.from(BUCKET_MATERIAIS).createSignedUrl(material.file_path, 60 * 10)

    if (error || !data?.signedUrl) {
      setErroMateriais('Não foi possível abrir este material agora.')
      return
    }

    if (isPdfMaterial(material)) {
      setVisualizadorPdf({ titulo: material.titulo, url: `${data.signedUrl}#toolbar=1&navpanes=0&view=FitH` })
      return
    }

    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  const metaGatilho = config?.meta_gatilho ?? 0
  const metaMax = config?.meta_max ?? 0
  const metaAnual = config?.meta_individual_anual ?? 120000
  const bonus = calcBonus(realizado, metaGatilho, metaMax, totalClinicaMes, config?.meta_clinica ?? Number.POSITIVE_INFINITY)
  const status = calcStatus(realizado, metaGatilho, metaMax)
  const pctGatilho = calcPctGatilho(realizado, metaGatilho)
  const pctMeta = calcPctMeta(realizado, metaMax)
  const pctAnual = metaAnual > 0 ? parseFloat(((acumuladoAnual / metaAnual) * 100).toFixed(1)) : 0
  const faltaMensal = Math.max(0, metaMax - realizado)
  const faltaAnual = Math.max(0, metaAnual - acumuladoAnual)

  if (loading || !profile) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'rgba(240,230,255,0.4)', fontSize: 16 }}>Carregando...</div>
      </div>
    )
  }

  return (
    <div className="app-shell" style={{ display: 'flex', minHeight: '100vh' }}>
      <aside className="app-sidebar" style={{
        width: 220, background: 'rgba(0,0,0,0.4)', borderRight: '1px solid rgba(255,255,255,0.06)',
        padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0,
      }}>
        <div className="sidebar-brand" style={{ marginBottom: 24, padding: '0 8px' }}>
          <div style={{ marginBottom: 8 }}>
            <Image src={assetPath('/logo.png')} alt="Roseane Débora Centro Estético" width={130} height={130}
              style={{ objectFit: 'contain', filter: 'invert(1)', mixBlendMode: 'screen' }} />
          </div>
          <div style={{ fontSize: 11, color: 'rgba(240,230,255,0.4)' }}>Meu Painel</div>
        </div>

        <div className="nav-link active">📊 Meu Painel</div>

        <div style={{ marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 16 }}>
          <div style={{ padding: '0 8px', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#f0e6ff' }}>{profile.primeiro_nome}</div>
            <div style={{ fontSize: 11, color: 'rgba(240,230,255,0.4)' }}>Profissional</div>
          </div>
          <button onClick={handleSair} style={{ background: 'none', border: 'none', width: '100%', cursor: 'pointer', padding: 0 }}>
            <div className="nav-link">🚪 Sair</div>
          </button>
        </div>
      </aside>

      <main className="app-main" style={{ flex: 1, padding: '28px 32px', overflowY: 'auto' }}>
        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
              Olá, <span className="gradient-text">{profile.primeiro_nome}! 👋</span>
            </h1>
            <p style={{ color: 'rgba(240,230,255,0.45)', fontSize: 14 }}>Seu desempenho em {mesSelecionado}</p>
          </div>
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
        </div>

        <div className="hero-summary" style={{
          background: 'linear-gradient(135deg, rgba(190,24,93,0.15), rgba(124,58,237,0.1))',
          border: '1px solid rgba(244,114,182,0.2)',
          borderRadius: 20, padding: '28px 32px', marginBottom: 24,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16,
        }}>
          <div>
            <div style={{ fontSize: 48, fontWeight: 800, lineHeight: 1 }}>{getMedalEmoji(posicao)}</div>
            <div style={{ fontSize: 14, color: 'rgba(240,230,255,0.5)', marginTop: 8 }}>Posição no ranking mensal</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, fontWeight: 800, color: '#f472b6' }}>{formatBRL(realizado)}</div>
            <div style={{ fontSize: 13, color: 'rgba(240,230,255,0.5)' }}>Realizado em {mesSelecionado}</div>
          </div>
          <div>
            <span className={getStatusClass(status)}>{status}</span>
          </div>
        </div>

        <div className="responsive-grid professional-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 24 }}>
          {[
            { label: '% Atingimento (Gatilho)', valor: `${pctGatilho}%`, icon: '⚡', cor: pctGatilho >= 100 ? '#4ade80' : '#f87171' },
            { label: '% Atingimento (Meta)', valor: `${pctMeta}%`, icon: '🎯', cor: pctMeta >= 100 ? '#4ade80' : '#facc15' },
            { label: 'Bônus do Mês', valor: formatBRL(bonus), icon: '💰', cor: '#c084fc' },
          ].map((c, i) => (
            <div key={i} className="glass-sm" style={{ padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>{c.icon}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: c.cor, marginBottom: 4 }}>{c.valor}</div>
              <div style={{ fontSize: 12, color: 'rgba(240,230,255,0.45)' }}>{c.label}</div>
            </div>
          ))}
        </div>

        <div className="responsive-grid professional-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 24 }}>
          {[
            { label: `Feedback em ${mesSelecionado}`, valor: notaFeedback > 0 ? `${notaFeedback.toFixed(1)}/10` : 'Sem nota', icon: 'FB', cor: notaFeedback >= 8 ? '#4ade80' : notaFeedback >= 6 ? '#facc15' : '#f87171' },
            { label: `Média Feedback até ${mesSelecionado}`, valor: mediaFeedback > 0 ? `${mediaFeedback.toFixed(1)}/10` : 'Sem média', icon: 'MF', cor: mediaFeedback >= 8 ? '#4ade80' : mediaFeedback >= 6 ? '#facc15' : '#f87171' },
          ].map((c, i) => (
            <div key={i} className="glass-sm" style={{ padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 24, marginBottom: 8, fontWeight: 800, color: c.cor }}>{c.icon}</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: c.cor, marginBottom: 4 }}>{c.valor}</div>
              <div style={{ fontSize: 12, color: 'rgba(240,230,255,0.45)' }}>{c.label}</div>
            </div>
          ))}
        </div>

        <div className="glass-sm" style={{ padding: 24, marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 20 }}>📊 Progresso Mensal</h3>

          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
              <span style={{ color: 'rgba(240,230,255,0.6)' }}>Meta Gatilho ({formatBRL(metaGatilho)})</span>
              <span style={{ color: pctGatilho >= 100 ? '#4ade80' : '#f87171', fontWeight: 600 }}>{pctGatilho}%</span>
            </div>
            <div className="progress-track">
              <div className={pctGatilho >= 100 ? 'progress-fill-green' : 'progress-fill-rose'}
                style={{ width: `${Math.min(pctGatilho, 100)}%` }} />
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
              <span style={{ color: 'rgba(240,230,255,0.6)' }}>Meta Mês ({formatBRL(metaMax)})</span>
              <span style={{ color: pctMeta >= 100 ? '#4ade80' : '#facc15', fontWeight: 600 }}>{pctMeta}%</span>
            </div>
            <div className="progress-track">
              <div className={pctMeta >= 100 ? 'progress-fill-green' : 'progress-fill-yellow'}
                style={{ width: `${Math.min(pctMeta, 100)}%` }} />
            </div>
          </div>

          {faltaMensal > 0 && (
            <div style={{
              marginTop: 16, padding: '10px 14px',
              background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.15)',
              borderRadius: 10, fontSize: 13, color: '#facc15',
            }}>
              💡 Falta <strong>{formatBRL(faltaMensal)}</strong> para atingir a meta do mês
            </div>
          )}
        </div>

        <div className="glass-sm" style={{ padding: 24, marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 20 }}>🏆 Minha Meta Anual</h3>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#f472b6' }}>{formatBRL(acumuladoAnual)}</div>
              <div style={{ fontSize: 13, color: 'rgba(240,230,255,0.45)' }}>Acumulado até {mesSelecionado}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#f87171' }}>{formatBRL(faltaAnual)}</div>
              <div style={{ fontSize: 13, color: 'rgba(240,230,255,0.45)' }}>Falta para {formatBRL(metaAnual)}</div>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontSize: 13 }}>
              <span style={{ color: 'rgba(240,230,255,0.6)' }}>Progresso Anual</span>
              <span style={{ fontWeight: 600 }}>{pctAnual}%</span>
            </div>
            <div className="progress-track">
              <div className="progress-fill-rose" style={{ width: `${Math.min(pctAnual, 100)}%` }} />
            </div>
          </div>

          <div style={{ fontSize: 13, color: 'rgba(240,230,255,0.45)', marginTop: 12 }}>
            Posição anual: <strong style={{ color: '#c084fc' }}>{posicaoAnual}º</strong>
          </div>

          <div style={{ fontSize: 14, color: '#c084fc', fontStyle: 'italic', marginTop: 12 }}>
            ✨ {getMensagemAnual(posicaoAnual)}
          </div>
        </div>

        <div style={{
          background: 'linear-gradient(135deg, rgba(124,58,237,0.1), rgba(190,24,93,0.08))',
          border: '1px solid rgba(192,132,252,0.15)',
          borderRadius: 16, padding: 24,
        }}>
          <div style={{ fontSize: 13, color: 'rgba(240,230,255,0.5)', marginBottom: 8 }}>💬 Mensagem do mês</div>
          <div style={{ fontSize: 15, color: '#f0e6ff', lineHeight: 1.6 }}>{getMensagem(posicao)}</div>
        </div>
        <div className="glass-sm" style={{ padding: 24, marginTop: 24, marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>📎 Materiais informativos</h3>
          <p style={{ fontSize: 12, color: 'rgba(240,230,255,0.45)', marginBottom: 18 }}>
            Arquivos liberados pela administração para consulta.
          </p>

          {erroMateriais && (
            <div style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.16)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#facc15', marginBottom: 14 }}>
              {erroMateriais}
            </div>
          )}

          <div style={{ display: 'grid', gap: 12 }}>
            {materiais.map(material => (
              <div key={material.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: 14, borderRadius: 12, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
                <div style={{ minWidth: 220 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#f0e6ff' }}>{material.titulo}</div>
                  {material.descricao && <div style={{ fontSize: 12, color: 'rgba(240,230,255,0.45)', marginTop: 4 }}>{material.descricao}</div>}
                  <div style={{ fontSize: 11, color: 'rgba(240,230,255,0.35)', marginTop: 6 }}>{material.file_name} · {formatFileSize(material.file_size)}</div>
                </div>
                <button type="button" onClick={() => handleAbrirMaterial(material)} style={{ background: 'linear-gradient(135deg,#be185d,#7c3aed)', border: 0, color: 'white', borderRadius: 10, padding: '10px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  Abrir arquivo
                </button>
              </div>
            ))}
            {materiais.length === 0 && !erroMateriais && (
              <div style={{ textAlign: 'center', color: 'rgba(240,230,255,0.35)', fontSize: 14, padding: '22px 10px' }}>
                Nenhum material informativo disponível no momento.
              </div>
            )}
          </div>
        </div>
        <AlterarSenhaCard />
      </main>

      {visualizadorPdf && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Visualização de ${visualizadorPdf.titulo}`}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            background: 'rgba(5,0,12,0.86)',
            backdropFilter: 'blur(10px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              width: 'min(1100px, 100%)',
              height: 'min(860px, 92vh)',
              background: '#12071d',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 16,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
            }}
          >
            <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#f0e6ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {visualizadorPdf.titulo}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(240,230,255,0.45)', marginTop: 2 }}>
                  Use a barra de rolagem para passar página por página.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setVisualizadorPdf(null)}
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: '#f0e6ff', borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}
              >
                Fechar
              </button>
            </div>
            <iframe
              src={visualizadorPdf.url}
              title={visualizadorPdf.titulo}
              style={{ width: '100%', height: '100%', border: 0, background: '#1f1f1f' }}
            />
          </div>
        </div>
      )}

      <DecoracaoDireita />
    </div>
  )
}
