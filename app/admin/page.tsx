'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { Profile, ConfiguracoesMes, MaterialInformativo, Resultado, MaterialLeitura, AuditoriaEvento } from '@/lib/types'
import {
  MESES_LISTA, formatBRL, getStatusClass, getProgressColor,
  getMedalEmoji, calcPctMeta, mesNumero,
} from '@/lib/formulas'
import DecoracaoDireita from '@/components/DecoracaoDireita'
import AlterarSenhaCard from '@/components/AlterarSenhaCard'
import PdfPageViewer from '@/components/PdfPageViewer'
import { DEMO_MODE, getDemoConfig, getDemoProfiles, getDemoResultadosMes, getDemoResultadosAnual } from '@/lib/demo-data'
import { assetPath } from '@/lib/asset-path'
import { calcularRankingAnual, calcularRankingMensal, resultadoDoMes } from '@/lib/dashboard-metrics'
import { buscarLeiturasMateriaisGoogleSheets, buscarMensagensGoogleSheets, enviarMensagemGoogleSheets, registrarEventoGoogleSheets, type GoogleSheetsMessageRow } from '@/lib/google-sheets-sync'
import { compatibilizarLeiturasGoogleSheets, type CompatibilizacaoLeituras } from '@/lib/material-read-compat'

type Aba = 'mensal' | 'anual' | 'bonus' | 'materiais'
type PerfilAdmin = 'admin' | 'gestao'

const BUCKET_MATERIAIS = 'materiais-informativos'
const YOUTUBE_CANAL_URL = 'https://www.youtube.com/@DraRoseaneDebora/videos'
const YOUTUBE_VIDEO_IDS = ['gK8WPJ6WsOQ', '6fptiuW0ck0', 'lswlKf-q_bU', 'Zj1PE4m9wPQ']
const LIMITE_MATERIAL_BYTES = 50 * 1024 * 1024
const EXTENSOES_MATERIAIS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'png', 'jpg', 'jpeg', 'webp', 'txt', 'csv', 'mp4', 'mov', 'zip']
const CATEGORIAS_MATERIAIS = ['Comunicados', 'Treinamentos', 'Metas', 'Protocolos']

function chaveLeiturasLocais(profileId: string) {
  return `leituras_materiais_${profileId}`
}

function carregarLeiturasLocais(profileId: string) {
  if (typeof window === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem(chaveLeiturasLocais(profileId)) ?? '{}') as Record<number, string>
  } catch {
    return {}
  }
}

function salvarLeituraLocal(profileId: string, materialId: number, readAt: string) {
  if (typeof window === 'undefined') return
  const leituras = carregarLeiturasLocais(profileId)
  localStorage.setItem(chaveLeiturasLocais(profileId), JSON.stringify({ ...leituras, [materialId]: leituras[materialId] ?? readAt }))
}

export default function AdminPage() {
  const router = useRouter()
  const [mesSelecionado, setMesSelecionado] = useState(MESES_LISTA[new Date().getMonth()])
  const [aba, setAba] = useState<Aba>('mensal')
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [config, setConfig] = useState<ConfiguracoesMes | null>(null)
  const [resultados, setResultados] = useState<Resultado[]>([])
  const [todosResultados, setTodosResultados] = useState<Resultado[]>([])
  const [materiais, setMateriais] = useState<MaterialInformativo[]>([])
  const [leiturasMateriais, setLeiturasMateriais] = useState<MaterialLeitura[]>([])
  const [resumoLeiturasGoogle, setResumoLeiturasGoogle] = useState<CompatibilizacaoLeituras | null>(null)
  const [eventosAuditoria, setEventosAuditoria] = useState<AuditoriaEvento[]>([])
  const [tituloMaterial, setTituloMaterial] = useState('')
  const [descricaoMaterial, setDescricaoMaterial] = useState('')
  const [categoriaMaterial, setCategoriaMaterial] = useState(CATEGORIAS_MATERIAIS[0])
  const [arquivoMaterial, setArquivoMaterial] = useState<File | null>(null)
  const [salvandoMaterial, setSalvandoMaterial] = useState(false)
  const [mensagemMaterial, setMensagemMaterial] = useState('')
  const [erroMaterial, setErroMaterial] = useState('')
  const [perfilAdmin, setPerfilAdmin] = useState<PerfilAdmin>('admin')
  const [profileIdAtual, setProfileIdAtual] = useState('')
  const [emailAtual, setEmailAtual] = useState('')
  const [nomeAtual, setNomeAtual] = useState('')
  const [visualizadorPdf, setVisualizadorPdf] = useState<{ materialId: number; titulo: string; baseUrl: string; pagina: number } | null>(null)
  const [totalPaginasPdf, setTotalPaginasPdf] = useState(0)
  const [carregandoPdf, setCarregandoPdf] = useState(false)
  const [youtubeVideoIndex, setYoutubeVideoIndex] = useState(0)
  const [youtubeMuted, setYoutubeMuted] = useState(true)
  const [mensagensRecebidas, setMensagensRecebidas] = useState<GoogleSheetsMessageRow[]>([])
  const [mensagemGestaoAdmin, setMensagemGestaoAdmin] = useState('')
  const [statusMensagemGestao, setStatusMensagemGestao] = useState('')
  const [enviandoMensagemGestao, setEnviandoMensagemGestao] = useState(false)
  const [erroMensagensAdmin, setErroMensagensAdmin] = useState('')
  const [loading, setLoading] = useState(true)

  const mesNum = mesNumero(mesSelecionado)

  const carregarDados = useCallback(async () => {
    setLoading(true)

    if (DEMO_MODE) {
      setProfiles(getDemoProfiles())
      setConfig(getDemoConfig(mesNum))
      setResultados(getDemoResultadosMes(mesNum))
      setTodosResultados(getDemoResultadosAnual(12))
      setMateriais([])
      setLeiturasMateriais([])
      setResumoLeiturasGoogle(null)
      setEventosAuditoria([])
      setPerfilAdmin('admin')
      setProfileIdAtual('')
      setEmailAtual('')
      setNomeAtual('')
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
      .select('role,nome')
      .eq('id', user.id)
      .single()

    if (currentProfile?.role !== 'admin' && currentProfile?.role !== 'gestao') {
      router.push('/painel')
      return
    }
    setProfileIdAtual(user.id)
    setEmailAtual(user.email ?? '')
    setNomeAtual(currentProfile.nome ?? '')
    setPerfilAdmin(user.email?.toLowerCase() === 'gestao@clinica.com' ? 'gestao' : currentProfile.role)

    const [{ data: profs }, { data: cfg }, { data: res }, { data: anuais }, { data: mats, error: matsError }] = await Promise.all([
      supabase.from('profiles').select('*').eq('ativo', true).eq('role', 'user').order('nome'),
      supabase.from('configuracoes_mes').select('*').eq('mes', mesNum).eq('ano', 2025).single(),
      supabase.from('resultados').select('*').eq('mes', mesNum).eq('ano', 2025),
      supabase.from('resultados').select('*').eq('ano', 2025),
      supabase.from('materiais_informativos').select('*').order('created_at', { ascending: false }),
    ])

    setProfiles(profs ?? [])
    setConfig(cfg ?? null)
    setResultados(res ?? [])
    setTodosResultados(anuais ?? [])
    setMateriais(mats ?? [])
    setErroMaterial(matsError ? mensagemErroMateriais(matsError.message, matsError.code) : '')

    const [leiturasResult, auditoriaResult] = await Promise.allSettled([
      supabase.from('materiais_leituras').select('material_id, profile_id, read_at'),
      supabase.from('auditoria_eventos').select('*').order('created_at', { ascending: false }).limit(5),
    ])

    const leiturasBanco = leiturasResult.status === 'fulfilled' ? ((leiturasResult.value.data ?? []) as MaterialLeitura[]) : []
    if (leiturasResult.status === 'fulfilled' && leiturasResult.value.error) {
      setErroMaterial(mensagemErroLeituras(leiturasResult.value.error.message, leiturasResult.value.error.code))
    }
    const leiturasLocais = Object.entries(carregarLeiturasLocais(user.id)).map(([materialId, readAt]) => ({
      material_id: Number(materialId),
      profile_id: user.id,
      read_at: readAt,
    }))
    const leiturasUnicas = new Map<string, MaterialLeitura>()
    ;[...leiturasBanco, ...leiturasLocais].forEach(leitura => {
      leiturasUnicas.set(`${leitura.profile_id}:${leitura.material_id}`, leitura)
    })
    setLeiturasMateriais(Array.from(leiturasUnicas.values()))
    setEventosAuditoria(auditoriaResult.status === 'fulfilled' ? (auditoriaResult.value.data ?? []) : [])
    setLoading(false)

    buscarMensagensGoogleSheets()
      .then(mensagens => {
        setMensagensRecebidas(mensagens)
        setErroMensagensAdmin('')
      })
      .catch(() => {
        setMensagensRecebidas([])
        setErroMensagensAdmin('Atualize o Apps Script para habilitar a leitura da aba Mensagens.')
      })

    buscarLeiturasMateriaisGoogleSheets()
      .then(linhasGoogle => {
        const resumoGoogle = compatibilizarLeiturasGoogleSheets(profs ?? [], mats ?? [], linhasGoogle)
        setResumoLeiturasGoogle(resumoGoogle)
        setErroMaterial(erroAtual =>
          erroAtual.includes('contagem de aceites') ? '' : erroAtual,
        )
        setLeiturasMateriais(prev => {
          const leiturasAtualizadas = new Map<string, MaterialLeitura>()
          ;[...prev, ...resumoGoogle.leituras].forEach(leitura => {
            leiturasAtualizadas.set(`${leitura.profile_id}:${leitura.material_id}`, leitura)
          })
          return Array.from(leiturasAtualizadas.values())
        })
      })
      .catch(() => {
        setResumoLeiturasGoogle(null)
      })
  }, [mesNum, router])

  useEffect(() => { queueMicrotask(() => { carregarDados() }) }, [carregarDados])

  useEffect(() => {
    const indiceVideo = Math.floor(Math.random() * YOUTUBE_VIDEO_IDS.length)
    queueMicrotask(() => setYoutubeVideoIndex(indiceVideo))
  }, [])

  useEffect(() => {
    if (perfilAdmin !== 'gestao') return

    const primeiroPdf = materiais.filter(material => material.ativo).find(isPdfMaterial)
    if (!primeiroPdf) {
      queueMicrotask(() => setVisualizadorPdf(null))
      return
    }

    if (!visualizadorPdf || !materiais.some(material => material.ativo && material.id === visualizadorPdf.materialId)) {
      queueMicrotask(() => carregarVisualizacaoPdf(primeiroPdf))
    }
  }, [materiais, perfilAdmin, visualizadorPdf]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSair() {
    if (DEMO_MODE) {
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

  function mensagemErroMateriais(message?: string, code?: string) {
    if (code === 'PGRST205' || message?.toLowerCase().includes('materiais_informativos')) {
      return 'A área de materiais ainda não foi criada no Supabase. Execute o arquivo supabase/fix_materiais_informativos.sql no SQL Editor.'
    }
    if (message?.toLowerCase().includes('bucket not found')) {
      return 'O armazenamento de materiais ainda não foi criado no Supabase. Execute o arquivo supabase/fix_materiais_informativos.sql no SQL Editor.'
    }
    if (message?.toLowerCase().includes('row-level security')) {
      return 'O Supabase bloqueou a ação pelas regras de acesso. Reaplique o arquivo supabase/fix_materiais_informativos.sql no SQL Editor.'
    }
    return 'Não foi possível acessar os materiais informativos agora.'
  }

  function mensagemErroLeituras(message?: string, code?: string) {
    if (code === 'PGRST205' || message?.toLowerCase().includes('materiais_leituras')) {
      return 'A contagem de aceites ainda nao esta ativa no Supabase. Execute o arquivo supabase/fix_materiais_leituras_persistencia.sql no SQL Editor.'
    }
    if (message?.toLowerCase().includes('row-level security')) {
      return 'O Supabase bloqueou a leitura dos aceites pelas regras de acesso. Reaplique o arquivo supabase/fix_materiais_leituras_persistencia.sql no SQL Editor.'
    }
    return 'Nao foi possivel carregar a contagem de aceites agora.'
  }

  function validarArquivoMaterial(arquivo: File) {
    const extensao = arquivo.name.split('.').pop()?.toLowerCase() ?? ''
    if (!EXTENSOES_MATERIAIS.includes(extensao)) {
      return 'Formato não permitido. Use PDF, Word, Excel, PowerPoint, imagem, texto, CSV, vídeo ou ZIP.'
    }
    if (arquivo.size > LIMITE_MATERIAL_BYTES) {
      return 'Arquivo muito grande. O limite por anexo é de 50 MB.'
    }
    if (extensao === 'pdf' && arquivo.type && arquivo.type !== 'application/pdf') {
      return 'O arquivo selecionado tem extensão PDF, mas o navegador não identificou como PDF válido.'
    }
    return ''
  }

  async function handleUploadMaterial(e: React.SyntheticEvent) {
    e.preventDefault()
    setMensagemMaterial('')
    setErroMaterial('')

    if (DEMO_MODE) {
      setErroMaterial('Upload real indisponível no modo demonstração.')
      return
    }

    if (!arquivoMaterial) {
      setErroMaterial('Selecione um arquivo para anexar.')
      return
    }

    const erroValidacao = validarArquivoMaterial(arquivoMaterial)
    if (erroValidacao) {
      setErroMaterial(erroValidacao)
      return
    }

    setSalvandoMaterial(true)
    const supabase = createClient()
    const titulo = tituloMaterial.trim() || arquivoMaterial.name
    const nomeSeguro = arquivoMaterial.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]/g, '-')
    const filePath = `${Date.now()}-${crypto.randomUUID()}-${nomeSeguro}`

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_MATERIAIS)
      .upload(filePath, arquivoMaterial, {
        contentType: arquivoMaterial.type || 'application/octet-stream',
        upsert: false,
      })

    if (uploadError) {
      setErroMaterial(mensagemErroMateriais(uploadError.message))
      setSalvandoMaterial(false)
      return
    }

    const { error: insertError } = await supabase.from('materiais_informativos').insert({
      titulo,
      descricao: descricaoMaterial.trim() || null,
      categoria: categoriaMaterial,
      file_name: arquivoMaterial.name,
      file_path: filePath,
      file_type: arquivoMaterial.type || null,
      file_size: arquivoMaterial.size,
      ativo: true,
    })

    if (insertError) {
      await supabase.storage.from(BUCKET_MATERIAIS).remove([filePath])
      setErroMaterial(mensagemErroMateriais(insertError.message, insertError.code))
      setSalvandoMaterial(false)
      return
    }

    setTituloMaterial('')
    setDescricaoMaterial('')
    setCategoriaMaterial(CATEGORIAS_MATERIAIS[0])
    setArquivoMaterial(null)
    setMensagemMaterial('Material anexado e liberado para as profissionais.')
    setSalvandoMaterial(false)
    await carregarDados()
  }

  async function handleRemoverMaterial(material: MaterialInformativo) {
    if (!confirm(`Remover o material "${material.titulo}"?`)) return

    const supabase = createClient()
    const { error: registroError } = await supabase.from('materiais_informativos').delete().eq('id', material.id)
    if (registroError) {
      setErroMaterial('Não foi possível remover o material.')
      return
    }

    await supabase.storage.from(BUCKET_MATERIAIS).remove([material.file_path])
    setMensagemMaterial('Material removido.')
    await carregarDados()
  }

  async function handleAbrirMaterial(material: MaterialInformativo) {
    const supabase = createClient()
    const { data, error } = await supabase.storage.from(BUCKET_MATERIAIS).createSignedUrl(material.file_path, 60 * 10)

    if (error || !data?.signedUrl) {
      setErroMaterial('Não foi possível abrir o arquivo agora.')
      return
    }

    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  function isPdfMaterial(material: MaterialInformativo) {
    return material.file_type === 'application/pdf' || material.file_name.toLowerCase().endsWith('.pdf')
  }

  async function carregarVisualizacaoPdf(material: MaterialInformativo) {
    if (!isPdfMaterial(material)) {
      setErroMaterial('A visualizacao dentro do painel esta disponivel para arquivos PDF.')
      return
    }

    setCarregandoPdf(true)
    const supabase = createClient()
    const { data, error } = await supabase.storage.from(BUCKET_MATERIAIS).createSignedUrl(material.file_path, 60 * 60)

    if (error || !data?.signedUrl) {
      setErroMaterial('Nao foi possivel abrir este material agora.')
      setCarregandoPdf(false)
      return
    }

    setErroMaterial('')
    setVisualizadorPdf({ materialId: material.id, titulo: material.titulo, baseUrl: data.signedUrl, pagina: 1 })
    setTotalPaginasPdf(0)
    setCarregandoPdf(false)
  }

  function mudarPaginaPdf(delta: number) {
    setVisualizadorPdf(atual => {
      if (!atual) return atual
      const proxima = Math.max(1, atual.pagina + delta)
      return { ...atual, pagina: totalPaginasPdf > 0 ? Math.min(proxima, totalPaginasPdf) : proxima }
    })
  }

  async function confirmarLeituraGestao(material: MaterialInformativo) {
    if (!profileIdAtual) return
    if (leiturasGestao[material.id]) {
      setErroMaterial(`Termo já assinado para "${material.titulo}". Não é necessário assinar novamente.`)
      return
    }

    const agora = new Date().toISOString()
    const supabase = createClient()
    salvarLeituraLocal(profileIdAtual, material.id, agora)
    setLeiturasMateriais(prev => {
      const outrasLeituras = prev.filter(leitura => !(leitura.material_id === material.id && leitura.profile_id === profileIdAtual))
      return [...outrasLeituras, { material_id: material.id, profile_id: profileIdAtual, read_at: agora }]
    })
    registrarEventoGoogleSheets({
      tipo: 'leitura_material',
      email: emailAtual,
      nome: nomeAtual,
      perfil: perfilAdmin,
      profile_id: profileIdAtual,
      material_id: material.id,
      material_titulo: material.titulo,
      material_arquivo: material.file_name,
      material_categoria: material.categoria,
    })

    const { error } = await supabase
      .from('materiais_leituras')
      .upsert({ material_id: material.id, profile_id: profileIdAtual, read_at: agora }, { onConflict: 'material_id,profile_id' })

    if (error) {
      setErroMaterial('Confirmação enviada para o Google Sheets. O registro no Supabase ainda precisa do script de materiais.')
      return
    }

    setErroMaterial('')
  }

  async function enviarMensagemGestaoAdmin(event: React.SyntheticEvent) {
    event.preventDefault()
    if (!profileIdAtual) return

    const texto = mensagemGestaoAdmin.trim()
    if (texto.length < 5) {
      setStatusMensagemGestao('Escreva uma mensagem com pelo menos 5 caracteres.')
      return
    }

    setEnviandoMensagemGestao(true)
    setStatusMensagemGestao('')

    try {
      await enviarMensagemGoogleSheets({
        email: emailAtual,
        nome: nomeAtual,
        perfil: perfilAdmin,
        profile_id: profileIdAtual,
        mensagem: texto,
        destino: 'admin',
      })

      setMensagemGestaoAdmin('')
      setStatusMensagemGestao('Mensagem enviada para o Admin e registrada no Google Sheets.')
    } catch {
      setStatusMensagemGestao('Não foi possível registrar no Google Sheets. Atualize o Apps Script e tente novamente.')
    } finally {
      setEnviandoMensagemGestao(false)
    }
  }

  function trocarVideoYoutube(delta: number) {
    setYoutubeVideoIndex(atual => (atual + delta + YOUTUBE_VIDEO_IDS.length) % YOUTUBE_VIDEO_IDS.length)
  }

  const cfg = config ?? { meta_clinica: 55000, meta_gatilho: 15000, meta_max: 18000, meta_individual_anual: 187000 }

  function getRes(profileId: string) {
    return resultadoDoMes(resultados, profileId, mesNum, 2025)
  }

  const totalRealizado = profiles.reduce((s, p) => s + getRes(p.id).realizado, 0)
  const faltaClinica = Math.max(0, cfg.meta_clinica - totalRealizado)
  const ticketMedio = profiles.length > 0 ? totalRealizado / profiles.length : 0
  const metaClinicaBatida = totalRealizado >= cfg.meta_clinica

  const rankingMensal = calcularRankingMensal(profiles, resultados, cfg, mesNum, 2025)
  const rankingAnual = calcularRankingAnual(profiles, todosResultados, cfg.meta_individual_anual, 2025)

  const pctClinica = calcPctMeta(totalRealizado, cfg.meta_clinica)
  const totalComissoes = rankingMensal.reduce((s, p) => s + p.comissao_avaliacoes, 0)

  const totalBonus = rankingMensal.reduce((s, p) => s + p.bonus, 0)
  const totalVendasAvaliacao = rankingMensal.reduce((s, p) => s + p.vendas_avaliacoes, 0)
  const totalGeral = totalBonus + totalComissoes
  const notasFeedback = rankingMensal.map(p => p.nota_feedback ?? 0).filter(nota => nota > 0)
  const mediaFeedback = notasFeedback.length > 0 ? notasFeedback.reduce((s, nota) => s + nota, 0) / notasFeedback.length : 0
  const abaixoDoGatilho = rankingMensal.filter(p => p.realizado < cfg.meta_gatilho).length
  const pertoDaMeta = rankingMensal.filter(p => p.pctMeta >= 80 && p.pctMeta < 100).length
  const materiaisObrigatorios = materiais.filter(material => material.ativo && isPdfMaterial(material))
  const idsProfissionais = new Set(profiles.map(profile => profile.id))
  const idsMateriaisObrigatorios = new Set(materiaisObrigatorios.map(material => material.id))
  const leiturasContagemSheets = resumoLeiturasGoogle?.leituras ?? []
  const contagemSheetsDisponivel = Boolean(resumoLeiturasGoogle)
  const assinaturasUnicas = new Set(
    leiturasContagemSheets
      .filter(leitura => idsProfissionais.has(leitura.profile_id) && idsMateriaisObrigatorios.has(leitura.material_id))
      .map(leitura => `${leitura.profile_id}:${leitura.material_id}`),
  )
  const totalLeituras = assinaturasUnicas.size
  const totalLeiturasPossiveis = materiaisObrigatorios.length * profiles.length
  const profissionaisComCienciaCompletaLista = profiles.filter(profile =>
    materiaisObrigatorios.length > 0 && materiaisObrigatorios.every(material => assinaturasUnicas.has(`${profile.id}:${material.id}`)),
  )
  const profissionaisPendentesCienciaLista = profiles.filter(profile =>
    materiaisObrigatorios.length > 0 && !materiaisObrigatorios.every(material => assinaturasUnicas.has(`${profile.id}:${material.id}`)),
  )
  const profissionaisComCienciaCompleta = profissionaisComCienciaCompletaLista.length
  const totalMensagensRecebidas = mensagensRecebidas.length
  const ultimaMensagemRecebida = mensagensRecebidas[0]
  const podeEditar = perfilAdmin === 'admin'
  const materiaisVisiveisGestao = materiais.filter(material => material.ativo)
  const leiturasGestao = leiturasMateriais.reduce<Record<number, string>>((acc, leitura) => {
    if (leitura.profile_id === profileIdAtual) acc[leitura.material_id] = leitura.read_at
    return acc
  }, {})
  const materiaisAgrupados = materiaisVisiveisGestao.reduce<Record<string, MaterialInformativo[]>>((acc, material) => {
    const categoria = categoriaDoMaterial(material)
    acc[categoria] = [...(acc[categoria] ?? []), material]
    return acc
  }, {})
  const youtubeVideoId = YOUTUBE_VIDEO_IDS[youtubeVideoIndex] ?? YOUTUBE_VIDEO_IDS[0]
  const youtubeEmbedUrl = `https://www.youtube-nocookie.com/embed/${youtubeVideoId}?autoplay=1&mute=${youtubeMuted ? '1' : '0'}&playsinline=1&rel=0&controls=1`

  function categoriaDoMaterial(material: MaterialInformativo) {
    return material.categoria || 'Comunicados'
  }

  function totalLeiturasMaterial(materialId: number) {
    return new Set(
      leiturasContagemSheets
        .filter(leitura => leitura.material_id === materialId && idsProfissionais.has(leitura.profile_id))
        .map(leitura => leitura.profile_id),
    ).size
  }

  return (
    <div className="app-shell" style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside className="app-sidebar" style={{ width: 230, background: 'rgba(0,0,0,0.4)', borderRight: '1px solid rgba(255,255,255,0.06)', padding: '24px 16px', display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
        <div className="sidebar-brand" style={{ marginBottom: 20, padding: '0 8px' }}>
          <Image src={assetPath('/logo.png')} alt="Logo" width={130} height={130} className="sidebar-logo" style={{ objectFit: 'contain', filter: 'invert(1)', mixBlendMode: 'screen' }} />
          <div style={{ fontSize: 11, color: 'rgba(240,230,255,0.4)', marginTop: 4 }}>Painel Administrativo</div>
        </div>
        <div className="nav-link active">📊 Dashboard</div>
        {podeEditar && (
          <Link href="/admin/editar" style={{ textDecoration: 'none' }}><div className="nav-link">✏️ Editar Metas</div></Link>
        )}
        <div style={{ marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 16 }}>
          <button onClick={handleSair} style={{ background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer' }}>
            <div className="nav-link">🚪 Sair</div>
          </button>
        </div>
      </aside>

      {/* Conteúdo */}
      <main className="app-main" style={{ flex: 1, padding: '28px 32px', overflowY: 'auto' }}>
        {/* Header */}
        <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}><span className="gradient-text">Painel de Metas</span></h1>
            <p style={{ color: 'rgba(240,230,255,0.45)', fontSize: 14 }}>Visão geral de todas as profissionais</p>
          </div>
          <div className="header-actions" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <select value={mesSelecionado} onChange={e => setMesSelecionado(e.target.value)} className="input-field" style={{ width: 'auto' }}>
              {MESES_LISTA.map(m => <option key={m} value={m} style={{ background: '#1a0a2e' }}>{m}</option>)}
            </select>
            <div style={{ background: 'rgba(244,114,182,0.1)', border: '1px solid rgba(244,114,182,0.2)', borderRadius: 10, padding: '8px 14px', fontSize: 13, color: '#f472b6' }}>
              👤 {podeEditar ? 'Admin' : 'Gestão'}
            </div>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: 'rgba(240,230,255,0.4)' }}>Carregando dados...</div>
        ) : (
          <>
            {/* Cards resumo */}
            <div className="responsive-grid summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 24 }}>
              {[
                { label: 'Faturamento do Mês', valor: formatBRL(totalRealizado), icon: '💰', cor: '#f472b6' },
                { label: 'Meta Clínica', valor: formatBRL(cfg.meta_clinica), icon: '🎯', cor: '#c084fc' },
                { label: '% Atingimento', valor: `${pctClinica}%`, icon: '📈', cor: pctClinica >= 100 ? '#4ade80' : '#facc15' },
                { label: 'Falta p/ Meta', valor: formatBRL(faltaClinica), icon: 'R$', cor: faltaClinica === 0 ? '#4ade80' : '#facc15' },
                { label: 'Ticket Médio / Prof.', valor: formatBRL(ticketMedio), icon: 'TM', cor: '#38bdf8' },
                { label: 'Comissão Avaliações (7%)', valor: formatBRL(totalComissoes), icon: '7%', cor: '#facc15' },
                { label: 'Média Feedback do Mês', valor: mediaFeedback > 0 ? `${mediaFeedback.toFixed(1)}/10` : 'Sem notas', icon: 'FB', cor: mediaFeedback >= 8 ? '#4ade80' : mediaFeedback >= 6 ? '#facc15' : '#f87171' },
              ].map((c, i) => (
                <div key={i} className="glass-sm" style={{ padding: 20 }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>{c.icon}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: c.cor, marginBottom: 4 }}>{c.valor}</div>
                  <div style={{ fontSize: 12, color: 'rgba(240,230,255,0.45)' }}>{c.label}</div>
                </div>
              ))}
            </div>

            {/* Metas */}
            <div className="responsive-grid meta-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 16, marginBottom: 24 }}>
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

            <div className="responsive-grid executive-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 16, marginBottom: 24 }}>
              {[
                { label: 'Abaixo do gatilho', valor: `${abaixoDoGatilho}`, apoio: 'profissionais', cor: abaixoDoGatilho === 0 ? '#4ade80' : '#f87171' },
                { label: 'Perto da meta', valor: `${pertoDaMeta}`, apoio: 'acima de 80%', cor: '#facc15' },
                { label: 'Feedback medio', valor: mediaFeedback > 0 ? `${mediaFeedback.toFixed(1)}/10` : 'Sem notas', apoio: 'mes selecionado', cor: mediaFeedback >= 8 ? '#4ade80' : mediaFeedback >= 6 ? '#facc15' : '#f87171' },
                { label: 'Profissionais cientes', valor: contagemSheetsDisponivel && totalLeiturasPossiveis > 0 ? `${profissionaisComCienciaCompleta}/${profiles.length}` : 'Verificar', apoio: contagemSheetsDisponivel ? `${totalLeituras}/${totalLeiturasPossiveis} assinaturas · Google Sheets ${resumoLeiturasGoogle?.totalCompatibilizado ?? 0}` : 'contagem depende do Google Sheets', cor: contagemSheetsDisponivel ? '#38bdf8' : '#facc15' },
                { label: 'Mensagens recebidas', valor: erroMensagensAdmin ? 'Verificar' : `${totalMensagensRecebidas}`, apoio: erroMensagensAdmin || (ultimaMensagemRecebida?.nome ? `ultima: ${ultimaMensagemRecebida.nome}` : 'aba Mensagens'), cor: erroMensagensAdmin ? '#facc15' : totalMensagensRecebidas > 0 ? '#f472b6' : 'rgba(240,230,255,0.45)' },
              ].map((c, i) => (
                <div key={i} className="glass-sm executive-card" style={{ padding: 18 }}>
                  <div style={{ fontSize: 12, color: 'rgba(240,230,255,0.45)', marginBottom: 8 }}>{c.label}</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: c.cor, marginBottom: 2 }}>{c.valor}</div>
                  <div style={{ fontSize: 11, color: 'rgba(240,230,255,0.35)' }}>{c.apoio}</div>
                  {c.label === 'Profissionais cientes' && (
                    <div className="awareness-popover-trigger" tabIndex={0} aria-label="Ver profissionais cientes e pendentes">
                      Ver nomes
                      <div className="awareness-popover">
                        {contagemSheetsDisponivel ? (
                          <>
                            <div>
                              <div className="awareness-popover-title">Assinaram</div>
                              {profissionaisComCienciaCompletaLista.length > 0 ? (
                                <ul>
                                  {profissionaisComCienciaCompletaLista.map(profile => <li key={profile.id}>{profile.nome}</li>)}
                                </ul>
                              ) : (
                                <p>Nenhuma profissional assinou ainda.</p>
                              )}
                            </div>
                            <div>
                              <div className="awareness-popover-title pending">Faltam assinar</div>
                              {profissionaisPendentesCienciaLista.length > 0 ? (
                                <ul>
                                  {profissionaisPendentesCienciaLista.map(profile => <li key={profile.id}>{profile.nome}</li>)}
                                </ul>
                              ) : (
                                <p>Todas as profissionais assinaram.</p>
                              )}
                            </div>
                          </>
                        ) : (
                          <p>A contagem de ciência será exibida somente após resposta do Google Sheets.</p>
                        )}
                      </div>
                    </div>
                  )}
                  {c.label === 'Mensagens recebidas' && (
                    <div className="message-popover-trigger" tabIndex={0} aria-label="Ver indicador de mensagens recebidas">
                      Ver indicação
                      <div className="message-popover">
                        <div className="awareness-popover-title">Mensagens</div>
                        <p>
                          {erroMensagensAdmin || (totalMensagensRecebidas > 0
                            ? `${totalMensagensRecebidas} mensagem(ns) registradas na aba Mensagens do Google Sheets.`
                            : 'Nenhuma mensagem registrada no Google Sheets até agora.')}
                        </p>
                        {ultimaMensagemRecebida?.nome && (
                          <p>Último envio: {ultimaMensagemRecebida.nome}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {eventosAuditoria.length > 0 && (
              <div className="glass-sm audit-strip" style={{ padding: 16, marginBottom: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                  <h2 style={{ fontSize: 14, fontWeight: 700 }}>Historico recente</h2>
                  <span style={{ fontSize: 11, color: 'rgba(240,230,255,0.4)' }}>Ultimas alteracoes salvas no banco</span>
                </div>
                <div className="audit-list" style={{ display: 'grid', gap: 8 }}>
                  {eventosAuditoria.map(evento => (
                    <div key={evento.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 8, fontSize: 12 }}>
                      <span style={{ color: '#f0e6ff' }}>{evento.acao} em {evento.tabela}</span>
                      <span style={{ color: 'rgba(240,230,255,0.45)' }}>{new Date(evento.created_at).toLocaleString('pt-BR')}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {perfilAdmin === 'gestao' && (
              <>
                <div className="professional-content-row">
                  <div style={{
                    background: 'linear-gradient(135deg, rgba(124,58,237,0.1), rgba(190,24,93,0.08))',
                    border: '1px solid rgba(192,132,252,0.15)',
                    borderRadius: 16, padding: 24,
                  }}>
                    <div style={{ fontSize: 13, color: 'rgba(240,230,255,0.5)', marginBottom: 8 }}>Mensagem do mês</div>
                    <div style={{ fontSize: 15, color: '#f0e6ff', lineHeight: 1.6 }}>
                      Acompanhe os materiais e conteúdos liberados para manter a equipe alinhada.
                    </div>
                  </div>

                  <div className="youtube-window">
                    <div className="youtube-window-header">
                      <div>
                        <div style={{ fontSize: 13, color: 'rgba(240,230,255,0.5)', marginBottom: 4 }}>Conteúdos da Dra. Roseane</div>
                        <div style={{ fontSize: 15, fontWeight: 700, color: '#f0e6ff' }}>Vídeos para assistir no painel</div>
                      </div>
                      <a href={YOUTUBE_CANAL_URL} target="_blank" rel="noreferrer" className="youtube-channel-link">
                        Canal
                      </a>
                    </div>
                    <div className="youtube-controls">
                      <button type="button" onClick={() => trocarVideoYoutube(-1)}>Anterior</button>
                      <span>Vídeo {youtubeVideoIndex + 1} de {YOUTUBE_VIDEO_IDS.length}</span>
                      <button type="button" onClick={() => trocarVideoYoutube(1)}>Próximo</button>
                      <button type="button" onClick={() => setYoutubeMuted(atual => !atual)}>
                        {youtubeMuted ? 'Ativar som' : 'Desativar som'}
                      </button>
                    </div>
                    <div className="youtube-frame-shell">
                      <iframe
                        key={youtubeVideoId}
                        src={youtubeEmbedUrl}
                        title="Vídeos do canal Dra. Roseane Débora"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                      />
                    </div>
                  </div>
                </div>

                <div id="painel-mensagem-admin" className="glass-sm message-panel" style={{ padding: 24, marginTop: 24, marginBottom: 24 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 14 }}>
                    <div>
                      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Mensagem para o Admin</h3>
                      <p style={{ fontSize: 12, color: 'rgba(240,230,255,0.45)' }}>
                        Envie uma observação da gestão. A mensagem ficará registrada na aba Mensagens do Google Sheets.
                      </p>
                    </div>
                    <span className="message-panel-badge">Registro no Sheets</span>
                  </div>
                  <form onSubmit={enviarMensagemGestaoAdmin} className="message-form">
                    <textarea
                      className="input-field message-textarea"
                      value={mensagemGestaoAdmin}
                      onChange={event => setMensagemGestaoAdmin(event.target.value)}
                      maxLength={600}
                      placeholder="Escreva sua mensagem para o Admin..."
                    />
                    <div className="message-form-footer">
                      <span>{mensagemGestaoAdmin.length}/600</span>
                      <button type="submit" className="btn-primary" disabled={enviandoMensagemGestao || mensagemGestaoAdmin.trim().length < 5}>
                        {enviandoMensagemGestao ? 'Enviando...' : 'Enviar mensagem'}
                      </button>
                    </div>
                  </form>
                  {statusMensagemGestao && (
                    <div className="message-panel-status">
                      {statusMensagemGestao}
                    </div>
                  )}
                </div>

                <div id="painel-materiais" className="glass-sm" style={{ padding: 24, marginTop: 24, marginBottom: 24 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Materiais informativos</h3>
                  <p style={{ fontSize: 12, color: 'rgba(240,230,255,0.45)', marginBottom: 18 }}>
                    Arquivos liberados pela administração para consulta.
                  </p>

                  {erroMaterial && (
                    <div style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.16)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#facc15', marginBottom: 14 }}>
                      {erroMaterial}
                    </div>
                  )}

                  <div style={{ display: 'grid', gap: 18 }}>
                    {Object.entries(materiaisAgrupados).map(([categoria, itens]) => (
                      <section key={categoria} style={{ display: 'grid', gap: 10 }}>
                        <div className="material-category-title">{categoria}</div>
                        {itens.map(material => {
                          const lidoEm = leiturasGestao[material.id]
                          return (
                          <div key={material.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: 14, borderRadius: 12, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
                            <div style={{ minWidth: 220, flex: '1 1 260px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: '#f0e6ff' }}>{material.titulo}</div>
                                {lidoEm && <span className="material-read-badge">Ciente</span>}
                              </div>
                              {material.descricao && <div style={{ fontSize: 12, color: 'rgba(240,230,255,0.45)', marginTop: 4 }}>{material.descricao}</div>}
                              <div style={{ fontSize: 11, color: 'rgba(240,230,255,0.35)', marginTop: 6 }}>{material.file_name} · {formatFileSize(material.file_size)}</div>
                            </div>
                            <div className="material-actions">
                              <button
                                type="button"
                                onClick={() => carregarVisualizacaoPdf(material)}
                                disabled={!isPdfMaterial(material) || carregandoPdf}
                                style={{
                                  background: visualizadorPdf?.materialId === material.id ? 'rgba(74,222,128,0.16)' : 'linear-gradient(135deg,#be185d,#7c3aed)',
                                  border: visualizadorPdf?.materialId === material.id ? '1px solid rgba(74,222,128,0.28)' : 0,
                                  color: visualizadorPdf?.materialId === material.id ? '#86efac' : 'white',
                                  borderRadius: 10,
                                  padding: '10px 14px',
                                  fontSize: 12,
                                  fontWeight: 700,
                                  cursor: isPdfMaterial(material) ? 'pointer' : 'not-allowed',
                                  opacity: isPdfMaterial(material) ? 1 : 0.55,
                                }}
                              >
                                {isPdfMaterial(material) ? (visualizadorPdf?.materialId === material.id ? 'Aberto no painel' : 'Visualizar no painel') : 'PDF indisponível'}
                              </button>
                              {lidoEm ? (
                                <div className="material-read-confirmed">
                                  Termo já assinado em {new Date(lidoEm).toLocaleDateString('pt-BR')}
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => confirmarLeituraGestao(material)}
                                  className="material-read-button"
                                >
                                  Li e estou ciente
                                </button>
                              )}
                            </div>
                          </div>
                          )
                        })}
                      </section>
                    ))}
                    {materiaisVisiveisGestao.length === 0 && !erroMaterial && (
                      <div style={{ textAlign: 'center', color: 'rgba(240,230,255,0.35)', fontSize: 14, padding: '22px 10px' }}>
                        Nenhum material informativo disponível no momento.
                      </div>
                    )}
                  </div>

                  {(visualizadorPdf || carregandoPdf) && (
                    <div className="material-viewer-panel">
                      <div className="material-viewer-header">
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#f0e6ff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {visualizadorPdf?.titulo ?? 'Carregando documento...'}
                          </div>
                          <div style={{ fontSize: 11, color: 'rgba(240,230,255,0.45)', marginTop: 3 }}>
                            O documento fica aberto aqui no painel. Use os botões para seguir ou voltar páginas.
                          </div>
                        </div>
                        {visualizadorPdf && (
                          <div className="material-page-controls">
                            <button type="button" onClick={() => mudarPaginaPdf(-1)} disabled={visualizadorPdf.pagina <= 1} className="material-page-button">
                              Voltar página
                            </button>
                            <div className="material-page-counter">Página {visualizadorPdf.pagina}{totalPaginasPdf > 0 ? ` de ${totalPaginasPdf}` : ''}</div>
                            <button type="button" onClick={() => mudarPaginaPdf(1)} disabled={totalPaginasPdf > 0 && visualizadorPdf.pagina >= totalPaginasPdf} className="material-page-button">
                              Próxima página
                            </button>
                          </div>
                        )}
                      </div>
                      {visualizadorPdf ? (
                        <PdfPageViewer
                          key={visualizadorPdf.materialId}
                          page={visualizadorPdf.pagina}
                          title={visualizadorPdf.titulo}
                          url={visualizadorPdf.baseUrl}
                          onPageCount={setTotalPaginasPdf}
                        />
                      ) : (
                        <div style={{ minHeight: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(240,230,255,0.45)', fontSize: 14 }}>
                          Preparando visualização...
                        </div>
                      )}
                    </div>
                  )}
                </div>

              </>
            )}

            {/* Tabs */}
            <div className="tabs-scroll" style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
              {([['mensal','📅 Ranking Mensal'],['anual','🏆 Ranking Anual'],['bonus','💰 Bônus e Comissões'],['materiais','📎 Materiais']] as const).map(([t, label]) => (
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
                <div className="responsive-grid bonus-total-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
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

            {aba === 'materiais' && (
              <div className="glass-sm" style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>
                <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <h2 style={{ fontSize: 16, fontWeight: 600 }}>📎 Materiais informativos</h2>
                  <p style={{ fontSize: 12, color: 'rgba(240,230,255,0.4)', marginTop: 4 }}>
                    Anexe arquivos para consulta das profissionais no painel individual.
                  </p>
                </div>

                {podeEditar ? (
                  <div style={{ padding: 24, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <form onSubmit={handleUploadMaterial} className="responsive-grid" style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.2fr 0.9fr 1.2fr auto', gap: 12, alignItems: 'end' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: 'rgba(240,230,255,0.5)', marginBottom: 6 }}>Título</label>
                      <input className="input-field" value={tituloMaterial} onChange={e => setTituloMaterial(e.target.value)} placeholder="Ex.: Protocolo de atendimento" />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: 'rgba(240,230,255,0.5)', marginBottom: 6 }}>Resumo</label>
                      <input className="input-field" value={descricaoMaterial} onChange={e => setDescricaoMaterial(e.target.value)} placeholder="Descrição breve para as profissionais" />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: 'rgba(240,230,255,0.5)', marginBottom: 6 }}>Categoria</label>
                      <select className="input-field" value={categoriaMaterial} onChange={e => setCategoriaMaterial(e.target.value)}>
                        {CATEGORIAS_MATERIAIS.map(categoria => (
                          <option key={categoria} value={categoria} style={{ background: '#1a0a2e' }}>{categoria}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: 12, color: 'rgba(240,230,255,0.5)', marginBottom: 6 }}>Arquivo</label>
                      <input
                        type="file"
                        className="input-field"
                        onChange={e => setArquivoMaterial(e.target.files?.[0] ?? null)}
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.txt,.csv,.mp4,.mov,.zip"
                      />
                    </div>
                    <button type="submit" className="btn-primary" disabled={salvandoMaterial} style={{ minWidth: 150 }}>
                      {salvandoMaterial ? 'Enviando...' : 'Anexar'}
                    </button>
                    </form>

                    {erroMaterial && (
                      <div style={{ marginTop: 14, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#f87171' }}>
                        {erroMaterial}
                      </div>
                    )}
                    {mensagemMaterial && (
                      <div style={{ marginTop: 14, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#86efac' }}>
                        {mensagemMaterial}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ padding: 24, borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 13, color: 'rgba(240,230,255,0.55)' }}>
                    Perfil Gestão: visualização liberada sem permissão para anexar, editar ou excluir materiais.
                  </div>
                )}

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                        {['Material','Categoria','Arquivo','Tamanho','Leituras','Status','Ações'].map(h => (
                          <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, color: 'rgba(240,230,255,0.4)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {materiais.map(material => (
                        <tr key={material.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: 16, minWidth: 260 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#f0e6ff' }}>{material.titulo}</div>
                            {material.descricao && <div style={{ fontSize: 12, color: 'rgba(240,230,255,0.45)', marginTop: 4 }}>{material.descricao}</div>}
                          </td>
                          <td style={{ padding: 16 }}><span className="material-category-badge">{categoriaDoMaterial(material)}</span></td>
                          <td style={{ padding: 16, fontSize: 13, color: 'rgba(240,230,255,0.65)', whiteSpace: 'nowrap' }}>{material.file_name}</td>
                          <td style={{ padding: 16, fontSize: 13, color: 'rgba(240,230,255,0.5)', whiteSpace: 'nowrap' }}>{formatFileSize(material.file_size)}</td>
                          <td style={{ padding: 16, fontSize: 13, color: 'rgba(240,230,255,0.65)', whiteSpace: 'nowrap' }}>{totalLeiturasMaterial(material.id)}/{profiles.length} cientes</td>
                          <td style={{ padding: 16 }}><span className={material.ativo ? 'badge-acima' : 'badge-abaixo'}>{material.ativo ? 'Visível' : 'Oculto'}</span></td>
                          <td style={{ padding: 16, whiteSpace: 'nowrap' }}>
                            <button type="button" onClick={() => handleAbrirMaterial(material)} style={{ background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.24)', color: '#7dd3fc', borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', marginRight: 8 }}>
                              Abrir
                            </button>
                            {podeEditar && (
                              <button type="button" onClick={() => handleRemoverMaterial(material)} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.22)', color: '#f87171', borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                                Excluir
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {materiais.length === 0 && (
                        <tr>
                          <td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'rgba(240,230,255,0.35)', fontSize: 14 }}>
                            Nenhum material anexado ainda.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <AlterarSenhaCard />
          </>
        )}
      </main>

      <DecoracaoDireita />
    </div>
  )
}
