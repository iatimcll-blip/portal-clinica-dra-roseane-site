'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import DecoracaoDireita from '@/components/DecoracaoDireita'
import AlterarSenhaCard from '@/components/AlterarSenhaCard'
import PdfPageViewer from '@/components/PdfPageViewer'
import { createClient } from '@/lib/supabase/client'
import { assetPath } from '@/lib/asset-path'
import {
  MESES_LISTA, mesNumero, formatBRL, calcBonus, calcStatus,
  calcPctGatilho, calcPctMeta, getMensagem, getMensagemAnual,
  getMedalEmoji, getStatusClass,
} from '@/lib/formulas'
import type { Profile, ConfiguracoesMes, MaterialInformativo, MaterialLeitura, Venda } from '@/lib/types'
import { DEMO_MODE, getDemoConfig, getDemoProfiles, getDemoResultadosMes, getDemoResultadosAnual, getDemoProfile, getDemoVendasMes } from '@/lib/demo-data'
import {
  buscarAutoavaliacaoConfigGoogleSheets,
  buscarAutoavaliacaoRespostasGoogleSheets,
  buscarLeiturasMateriaisGoogleSheets,
  enviarAutoavaliacaoGoogleSheets,
  enviarMensagemGoogleSheets,
  registrarEventoGoogleSheets,
  type AutoavaliacaoConfig,
  type AutoavaliacaoResposta,
} from '@/lib/google-sheets-sync'
import {
  AUTOAVALIACAO_CAMPOS_TEXTO,
  AUTOAVALIACAO_PERGUNTAS,
  calcularMediaAutoavaliacao,
  formatarDataAutoavaliacao,
  normalizarDataAutoavaliacao,
} from '@/lib/autoavaliacao'
import { compatibilizarLeiturasGoogleSheets } from '@/lib/material-read-compat'
import { mesclarResultadosAnualComReferencia } from '@/lib/dashboard-metrics'
import { listarMateriaisDoStorage } from '@/lib/materiais-storage'
import { exigeCienciaMaterial } from '@/lib/material-obligation'
import { listarLinksManifest } from '@/lib/link-manifest'
import {
  criarFolhasPontoD1Fallback,
  encontrarFolhaDoProfissional,
  extrairFolhasPontoD1DePdf,
  isFolhaPontoD1,
  type FolhaPontoD1,
} from '@/lib/ponto-d1'

const ANO_METAS = 2025
const ANO_RESULTADOS = new Date().getFullYear()
const BUCKET_MATERIAIS = 'materiais-informativos'
const PASTA_FOTOS_PROFISSIONAIS = 'fotos-profissionais'
const YOUTUBE_CANAL_URL = 'https://www.youtube.com/@DraRoseaneDebora/videos'
const YOUTUBE_UPLOADS_PLAYLIST_ID = 'UUomJ8VZUli9JIv2Cgpzf_DQ'
const YOUTUBE_PLAYLIST_LIMIT = 50
const PREFIXO_DESTINOS_MATERIAL = 'targets__'
const FOTOS_PROFISSIONAIS: Record<string, string> = {
  erica: '/erica.png',
  gilmara: '/Gilmara.png',
  kelly: '/Kelly.png',
  maria: '/Maria.png',
  tayane: '/Tayane.png',
}

const FRASES_MOTIVACIONAIS = [
  'O cuidado que você entrega hoje deixa marcas positivas muito além do atendimento.',
  'Cada cliente atendida com presença é uma oportunidade de transformar confiança em resultado.',
  'A excelência aparece nos detalhes que você escolhe repetir todos os dias.',
  'Quando você reconhece seu próprio progresso, fica mais forte para conquistar o próximo passo.',
  'Metas importantes são construídas com constância, atenção e carinho pelo que se faz.',
  'Seu trabalho tem valor porque une técnica, sensibilidade e compromisso com cada pessoa.',
  'Crescer também é perceber o quanto suas pequenas evoluções já mudaram o caminho.',
  'A dedicação silenciosa de hoje prepara os resultados que serão celebrados amanhã.',
  'Você não precisa fazer tudo de uma vez; precisa seguir fazendo o melhor com presença.',
  'Cada escolha feita com cuidado fortalece sua jornada profissional e inspira a equipe.',
  'O resultado nasce quando propósito, disciplina e acolhimento caminham juntos.',
  'Confie no processo: a evolução aparece quando você mantém o foco mesmo nos dias comuns.',
]

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
  localStorage.setItem(chaveLeiturasLocais(profileId), JSON.stringify({ ...leituras, [materialId]: readAt }))
}

function extrairDestinosDoCaminho(filePath?: string | null) {
  if (!filePath?.startsWith(PREFIXO_DESTINOS_MATERIAL)) return []
  const fim = filePath.indexOf('__', PREFIXO_DESTINOS_MATERIAL.length)
  if (fim < 0) return []
  return filePath
    .slice(PREFIXO_DESTINOS_MATERIAL.length, fim)
    .split(',')
    .map(id => id.trim())
    .filter(Boolean)
}

function hojeISO() {
  const agora = new Date()
  const ano = agora.getFullYear()
  const mes = String(agora.getMonth() + 1).padStart(2, '0')
  const dia = String(agora.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

function configAutoavaliacaoEstaLiberada(config: AutoavaliacaoConfig | null) {
  if (!config?.liberado || !config.periodo) return false
  const hoje = hojeISO()
  const dataInicio = normalizarDataAutoavaliacao(config.data_inicio)
  const dataFim = normalizarDataAutoavaliacao(config.data_fim)
  const inicioOk = !dataInicio || dataInicio <= hoje
  const fimOk = !dataFim || dataFim >= hoje
  return inicioOk && fimOk
}

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

type StorageFoto = {
  name: string
  created_at?: string | null
  updated_at?: string | null
}

export default function PainelProfissional() {
  const router = useRouter()
  const [mesSelecionado, setMesSelecionado] = useState(MESES_LISTA[new Date().getMonth()])
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileId, setProfileId] = useState<string | null>(null)
  const [profileEmail, setProfileEmail] = useState('')
  const [fotoPerfilSrc, setFotoPerfilSrc] = useState('')
  const [fotoSelecionada, setFotoSelecionada] = useState<File | null>(null)
  const [fotoPreview, setFotoPreview] = useState('')
  const [statusFoto, setStatusFoto] = useState('')
  const [salvandoFoto, setSalvandoFoto] = useState(false)
  const [config, setConfig] = useState<ConfiguracoesMes | null>(null)
  const [realizado, setRealizado] = useState(0)
  const [notaFeedback, setNotaFeedback] = useState(0)
  const [mediaFeedback, setMediaFeedback] = useState(0)
  const [acumuladoAnual, setAcumuladoAnual] = useState(0)
  const [posicao, setPosicao] = useState(1)
  const [posicaoAnual, setPosicaoAnual] = useState(1)
  const [rankingDisponivel, setRankingDisponivel] = useState(true)
  const [totalClinicaMes, setTotalClinicaMes] = useState(0)
  const [materiais, setMateriais] = useState<MaterialInformativo[]>([])
  const [leiturasMateriais, setLeiturasMateriais] = useState<Record<number, string>>({})
  const [erroMateriais, setErroMateriais] = useState('')
  const [visualizadorPdf, setVisualizadorPdf] = useState<{ materialId: number; titulo: string; baseUrl: string; pagina: number; paginaMin?: number; paginaMax?: number } | null>(null)
  const [totalPaginasPdf, setTotalPaginasPdf] = useState(0)
  const [carregandoPdf, setCarregandoPdf] = useState(false)
  const [fraseMotivacional, setFraseMotivacional] = useState('')
  const [youtubeVideoIndex, setYoutubeVideoIndex] = useState(0)
  const [youtubeMuted, setYoutubeMuted] = useState(true)
  const [folhasPontoD1, setFolhasPontoD1] = useState<FolhaPontoD1[]>([])
  const [erroFolhaPontoD1, setErroFolhaPontoD1] = useState('')
  const [mensagemAdmin, setMensagemAdmin] = useState('')
  const [statusMensagemAdmin, setStatusMensagemAdmin] = useState('')
  const [enviandoMensagemAdmin, setEnviandoMensagemAdmin] = useState(false)
  const [autoavaliacaoConfig, setAutoavaliacaoConfig] = useState<AutoavaliacaoConfig | null>(null)
  const [autoavaliacaoResposta, setAutoavaliacaoResposta] = useState<AutoavaliacaoResposta | null>(null)
  const [notasAutoavaliacao, setNotasAutoavaliacao] = useState<Record<string, number>>({})
  const [textosAutoavaliacao, setTextosAutoavaliacao] = useState<Record<string, string>>({})
  const [desempenhoGeral, setDesempenhoGeral] = useState(0)
  const [statusAutoavaliacao, setStatusAutoavaliacao] = useState('')
  const [enviandoAutoavaliacao, setEnviandoAutoavaliacao] = useState(false)
  const [linksAbertos, setLinksAbertos] = useState<Set<number>>(new Set())
  const [loading, setLoading] = useState(true)
  const [vendasMes, setVendasMes] = useState<Venda[]>([])
  const [carregandoVendas, setCarregandoVendas] = useState(false)
  const [erroVendas, setErroVendas] = useState('')
  const [usandoReferencia2025, setUsandoReferencia2025] = useState(false)

  const carregar = useCallback(async (mes: string, uid: string, currentProfile: Profile) => {
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
      setRankingDisponivel(true)
      setTotalClinicaMes(resMes.reduce((s, x) => s + x.realizado, 0))
      setMateriais([])
      setLeiturasMateriais({})
      return
    }

    const supabase = createClient()
    const mesNum = mesNumero(mes)

    const [{ data: cfg }, { data: painelRaw, error: painelError }, { data: materiaisData, error: materiaisError }, { data: leiturasData }] = await Promise.all([
      supabase.from('configuracoes_mes').select('*').eq('mes', mesNum).eq('ano', ANO_METAS).single(),
      supabase.rpc('get_professional_dashboard', { p_mes: mesNum, p_ano: ANO_RESULTADOS }).single(),
      supabase.from('materiais_informativos').select('*').eq('ativo', true).order('created_at', { ascending: false }),
      supabase.from('materiais_leituras').select('material_id, profile_id, read_at').eq('profile_id', uid),
    ])

    let painel = painelRaw as DashboardProfissional | null

    if (painelError) {
      const [{ data: resultadoMes }, { data: resultadosAno }, { data: resultadosAnoReferencia }] = await Promise.all([
        supabase
          .from('resultados')
          .select('realizado,comissao_avaliacoes,nota_feedback')
          .eq('profile_id', uid)
          .eq('mes', mesNum)
          .eq('ano', ANO_RESULTADOS)
          .maybeSingle(),
        supabase
          .from('resultados')
          .select('profile_id,mes,ano,realizado,comissao_avaliacoes,nota_feedback')
          .eq('profile_id', uid)
          .eq('ano', ANO_RESULTADOS),
        supabase
          .from('resultados')
          .select('profile_id,mes,ano,realizado,comissao_avaliacoes,nota_feedback')
          .eq('profile_id', uid)
          .eq('ano', ANO_METAS),
      ])

      const anoMesclado = mesclarResultadosAnualComReferencia(resultadosAno ?? [], resultadosAnoReferencia ?? [], ANO_RESULTADOS)
      const notas = anoMesclado.map(r => r.nota_feedback ?? 0).filter(nota => nota > 0)

      painel = {
        realizado: resultadoMes?.realizado ?? 0,
        comissao_avaliacoes: resultadoMes?.comissao_avaliacoes ?? 0,
        nota_feedback: resultadoMes?.nota_feedback ?? 0,
        acumulado_anual: anoMesclado.reduce((s, r) => s + (r.realizado ?? 0), 0),
        media_feedback: notas.length > 0 ? notas.reduce((s, nota) => s + nota, 0) / notas.length : 0,
        posicao_mensal: 1,
        posicao_anual: 1,
        total_clinica: resultadoMes?.realizado ?? 0,
      }
      setRankingDisponivel(false)
    } else {
      setRankingDisponivel(true)
    }

    let referencia2025 = false
    if (!painel?.realizado) {
      const { data: resultadoReferencia } = await supabase
        .from('resultados')
        .select('realizado,comissao_avaliacoes,nota_feedback')
        .eq('profile_id', uid)
        .eq('mes', mesNum)
        .eq('ano', ANO_METAS)
        .maybeSingle()

      if (resultadoReferencia && resultadoReferencia.realizado > 0) {
        referencia2025 = true
        painel = {
          ...(painel as DashboardProfissional),
          realizado: resultadoReferencia.realizado,
          comissao_avaliacoes: resultadoReferencia.comissao_avaliacoes,
          nota_feedback: resultadoReferencia.nota_feedback ?? 0,
        }
      }
    }
    setUsandoReferencia2025(referencia2025)

    setConfig(cfg ?? null)
    setRealizado(painel?.realizado ?? 0)
    setNotaFeedback(painel?.nota_feedback ?? 0)
    setAcumuladoAnual(painel?.acumulado_anual ?? 0)
    setMediaFeedback(painel?.media_feedback ?? 0)
    setPosicao(painel?.posicao_mensal ?? 1)
    setPosicaoAnual(painel?.posicao_anual ?? 1)
    setTotalClinicaMes(painel?.total_clinica ?? 0)
    let materiaisCarregados = materiaisData ?? []
    let erroMateriaisAtual = materiaisError ? 'Materiais informativos ainda não configurados no Supabase.' : ''
    try {
      const [materiaisStorage, linksManifest] = await Promise.all([
        listarMateriaisDoStorage(supabase, BUCKET_MATERIAIS),
        listarLinksManifest(supabase, BUCKET_MATERIAIS),
      ])
      const extras = [...materiaisStorage, ...linksManifest]
      if (extras.length > 0) {
        const materiaisPorCaminho = new Map<string, MaterialInformativo>()
        ;[...materiaisCarregados, ...extras].forEach(material => {
          materiaisPorCaminho.set(material.file_path, material)
        })
        materiaisCarregados = Array.from(materiaisPorCaminho.values())
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        erroMateriaisAtual = ''
      }
    } catch {
      if (materiaisError) materiaisCarregados = []
    }

    const materiaisDaProfissional = materiaisCarregados.filter(material => materialLiberadoParaProfile(material, uid))
    setMateriais(materiaisDaProfissional)
    const leiturasDoBanco = ((leiturasData ?? []) as MaterialLeitura[]).reduce<Record<number, string>>((acc, leitura) => {
      acc[leitura.material_id] = leitura.read_at
      return acc
    }, {})
    let leiturasCombinadas = { ...leiturasDoBanco, ...carregarLeiturasLocais(uid) }

    try {
      const leiturasGoogle = await buscarLeiturasMateriaisGoogleSheets()
      if (leiturasGoogle.length > 0) {
        const resumo = compatibilizarLeiturasGoogleSheets([currentProfile], materiaisDaProfissional, leiturasGoogle)
        const leiturasDoSheets = resumo.leituras.reduce<Record<number, string>>((acc, leitura) => {
          if (leitura.profile_id === uid) {
            acc[leitura.material_id] = leitura.read_at
          }
          return acc
        }, {})

        leiturasCombinadas = { ...leiturasCombinadas, ...leiturasDoSheets }
      }
    } catch {
      // Se o espelho do Sheets estiver indisponivel, mantemos Supabase/localStorage.
    }

    setLeiturasMateriais(leiturasCombinadas)
    setErroMateriais(erroMateriaisAtual)

    try {
      const [configAuto, respostasAuto] = await Promise.all([
        buscarAutoavaliacaoConfigGoogleSheets(),
        buscarAutoavaliacaoRespostasGoogleSheets(),
      ])
      const respostaAtual = respostasAuto.find(resposta =>
        resposta.profile_id === uid && resposta.periodo === configAuto.periodo,
      ) ?? null

      setAutoavaliacaoConfig(configAuto)
      setAutoavaliacaoResposta(respostaAtual)
      setNotasAutoavaliacao(respostaAtual?.notas ?? {})
      setTextosAutoavaliacao(respostaAtual?.textos ?? {})
      setDesempenhoGeral(respostaAtual?.desempenho_geral ?? 0)
      setStatusAutoavaliacao('')
    } catch {
      setAutoavaliacaoConfig(null)
      setAutoavaliacaoResposta(null)
      setStatusAutoavaliacao('Autoavaliação indisponível no momento. Atualize o Apps Script para habilitar o formulário digital.')
    }
  }, [])

  useEffect(() => {
    if (DEMO_MODE) {
      queueMicrotask(() => {
        const storedId = localStorage.getItem('demo_user_id')
        const prof = storedId ? getDemoProfile(storedId) : getDemoProfiles()[0]
        setProfile(prof)
        setProfileId(prof.id)
        setProfileEmail('')
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
      setProfileEmail(user.email ?? '')
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!profileId || !profile) return
    queueMicrotask(() => {
      setLoading(true)
      carregar(mesSelecionado, profileId, profile).then(() => setLoading(false))
    })
  }, [mesSelecionado, profileId, profile, carregar])

  useEffect(() => {
    if (!profileId || !profile) return

    if (DEMO_MODE) {
      setVendasMes(getDemoVendasMes(mesNumero(mesSelecionado)))
      setErroVendas('')
      return
    }

    let cancelado = false
    setCarregandoVendas(true)
    setErroVendas('')

    const supabase = createClient()
    supabase
      .from('vendas')
      .select('data_venda,cliente_nome,servico,valor')
      .eq('profile_id', profileId)
      .eq('mes', mesNumero(mesSelecionado))
      .eq('ano', new Date().getFullYear())
      .order('data_venda')
      .then(({ data, error }) => {
        if (cancelado) return
        if (error) {
          setVendasMes([])
          setErroVendas('Detalhe de vendas ainda não disponível para este mês.')
        } else {
          setVendasMes((data ?? []) as Venda[])
        }
        setCarregandoVendas(false)
      })

    return () => { cancelado = true }
  }, [mesSelecionado, profileId, profile])

  useEffect(() => {
    if (!profileId || !profile) return
    carregarFotoSalva(profileId)
  }, [profileId, profile]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      if (fotoPreview.startsWith('blob:')) URL.revokeObjectURL(fotoPreview)
    }
  }, [fotoPreview])

  useEffect(() => {
    const indice = Math.floor(Math.random() * FRASES_MOTIVACIONAIS.length)
    queueMicrotask(() => {
      setFraseMotivacional(FRASES_MOTIVACIONAIS[indice])
      setYoutubeVideoIndex(0)
    })
  }, [])

  useEffect(() => {
    if (DEMO_MODE || !profile || materiais.length === 0) {
      queueMicrotask(() => {
        setFolhasPontoD1([])
        setErroFolhaPontoD1('')
      })
      return
    }

    const materiaisFolha = materiais.filter(material => isFolhaPontoD1(material) && isPdfMaterial(material))
    if (materiaisFolha.length === 0) {
      queueMicrotask(() => {
        setFolhasPontoD1([])
        setErroFolhaPontoD1('')
      })
      return
    }

    let cancelado = false
    async function carregarFolhasPonto() {
      try {
        const supabase = createClient()
        const folhasExtraidas = await Promise.all(materiaisFolha.map(async material => {
          const { data, error } = await supabase.storage.from(BUCKET_MATERIAIS).createSignedUrl(material.file_path, 60 * 10)
          if (error || !data?.signedUrl) return []
          return extrairFolhasPontoD1DePdf(data.signedUrl, material)
        }))

        const folhas = folhasExtraidas.flat()
        if (!cancelado) {
          setFolhasPontoD1(folhas.length > 0 ? folhas : criarFolhasPontoD1Fallback(materiaisFolha, [profile].filter(Boolean) as Profile[]))
          setErroFolhaPontoD1('')
        }
      } catch (error) {
        console.error('Erro ao analisar folha de ponto D-1', error)
        if (!cancelado) {
          const folhasFallback = criarFolhasPontoD1Fallback(materiaisFolha, [profile].filter(Boolean) as Profile[])
          setFolhasPontoD1(folhasFallback)
          setErroFolhaPontoD1('Não foi possível analisar sua Folha de Ponto D-1 agora.')
        }
      }
    }

    carregarFolhasPonto()
    return () => { cancelado = true }
  }, [materiais, profile])

  useEffect(() => {
    const materiaisPermitidos = materiais.filter(material => !isFolhaPontoD1(material) || encontrarFolhaDoProfissional(folhasPontoD1, profile)?.material_id === material.id)
    const primeiroPdfPendente = materiaisPermitidos.find(material => isPdfMaterial(material) && !leiturasMateriais[material.id])
    const primeiroPdf = primeiroPdfPendente ?? materiaisPermitidos.find(isPdfMaterial)
    if (!primeiroPdf) {
      queueMicrotask(() => setVisualizadorPdf(null))
      return
    }

    if (!visualizadorPdf || !materiaisPermitidos.some(material => material.id === visualizadorPdf.materialId)) {
      queueMicrotask(() => carregarVisualizacaoPdf(primeiroPdf))
    }
  }, [materiais, leiturasMateriais, visualizadorPdf, folhasPontoD1, profile]) // eslint-disable-line react-hooks/exhaustive-deps

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

  function isLinkMaterial(material: MaterialInformativo) {
    return (material.categoria ?? '').toLowerCase() === 'links' || (material.categoria ?? '').toLowerCase() === 'link'
  }

  function urlDoMaterialLink(material: MaterialInformativo) {
    const url = material.link_url || material.file_name
    return /^https?:\/\/.+/.test(url) ? url : ''
  }

  function materialLiberadoParaProfile(material: MaterialInformativo, uid: string) {
    const destinosNoCaminho = extrairDestinosDoCaminho(material.file_path)
    if (destinosNoCaminho.length > 0) {
      return destinosNoCaminho.includes(uid)
    }
    if (Array.isArray(material.target_profile_ids) && material.target_profile_ids.length > 0) {
      return material.target_profile_ids.includes(uid)
    }
    return !material.profile_id || material.profile_id === uid
  }

  function fotoProfissional() {
    return FOTOS_PROFISSIONAIS[profile?.primeiro_nome?.toLowerCase() ?? '']
  }

  function fotoPadraoProfissional() {
    const foto = fotoProfissional()
    return foto ? assetPath(foto) : ''
  }

  async function carregarFotoSalva(uid: string) {
    const fotoPadrao = fotoPadraoProfissional()

    if (DEMO_MODE) {
      setFotoPerfilSrc(localStorage.getItem(`foto_profissional_${uid}`) ?? fotoPadrao)
      return
    }

    try {
      const supabase = createClient()
      const pasta = `${PASTA_FOTOS_PROFISSIONAIS}/${uid}`
      const { data, error } = await supabase.storage.from(BUCKET_MATERIAIS).list(pasta, {
        limit: 20,
        sortBy: { column: 'updated_at', order: 'desc' },
      })

      if (error) throw error

      const arquivo = ((data ?? []) as StorageFoto[])
        .filter(item => item.name && !item.name.endsWith('/'))
        .sort((a, b) => new Date(b.updated_at ?? b.created_at ?? 0).getTime() - new Date(a.updated_at ?? a.created_at ?? 0).getTime())[0]

      if (!arquivo) {
        setFotoPerfilSrc(fotoPadrao)
        return
      }

      const caminho = `${pasta}/${arquivo.name}`
      const { data: signedData, error: signedError } = await supabase.storage.from(BUCKET_MATERIAIS).createSignedUrl(caminho, 60 * 60)
      setFotoPerfilSrc(signedError || !signedData?.signedUrl ? fotoPadrao : signedData.signedUrl)
    } catch {
      setFotoPerfilSrc(fotoPadrao)
    }
  }

  function selecionarFoto(event: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = event.target.files?.[0] ?? null
    setStatusFoto('')

    if (!arquivo) {
      setFotoSelecionada(null)
      setFotoPreview('')
      return
    }

    if (!arquivo.type.startsWith('image/')) {
      setStatusFoto('Escolha uma imagem nos formatos JPG, PNG ou WEBP.')
      event.target.value = ''
      return
    }

    if (arquivo.size > 5 * 1024 * 1024) {
      setStatusFoto('A imagem deve ter no máximo 5 MB.')
      event.target.value = ''
      return
    }

    setFotoSelecionada(arquivo)
    setFotoPreview(URL.createObjectURL(arquivo))
  }

  async function salvarFotoProfissional() {
    if (!profileId || !fotoSelecionada) return

    setSalvandoFoto(true)
    setStatusFoto('')

    try {
      if (DEMO_MODE) {
        const reader = new FileReader()
        reader.onload = () => {
          const dataUrl = String(reader.result ?? '')
          localStorage.setItem(`foto_profissional_${profileId}`, dataUrl)
          setFotoPerfilSrc(dataUrl)
          setFotoPreview('')
          setFotoSelecionada(null)
          setStatusFoto('Foto salva para este acesso de teste.')
          setSalvandoFoto(false)
        }
        reader.onerror = () => {
          setStatusFoto('Não foi possível ler a imagem selecionada.')
          setSalvandoFoto(false)
        }
        reader.readAsDataURL(fotoSelecionada)
        return
      }

      const supabase = createClient()
      const pasta = `${PASTA_FOTOS_PROFISSIONAIS}/${profileId}`
      const extensao = fotoSelecionada.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg'
      const caminho = `${pasta}/perfil-${Date.now()}.${extensao}`

      const { data: fotosAntigas } = await supabase.storage.from(BUCKET_MATERIAIS).list(pasta, { limit: 20 })
      const caminhosAntigos = (fotosAntigas ?? [])
        .filter(item => item.name && !item.name.endsWith('/'))
        .map(item => `${pasta}/${item.name}`)
      if (caminhosAntigos.length > 0) {
        await supabase.storage.from(BUCKET_MATERIAIS).remove(caminhosAntigos)
      }

      const { error: uploadError } = await supabase.storage
        .from(BUCKET_MATERIAIS)
        .upload(caminho, fotoSelecionada, {
          cacheControl: '3600',
          contentType: fotoSelecionada.type,
          upsert: true,
        })

      if (uploadError) throw uploadError

      const { data: signedData, error: signedError } = await supabase.storage.from(BUCKET_MATERIAIS).createSignedUrl(caminho, 60 * 60)
      if (signedError || !signedData?.signedUrl) throw signedError

      setFotoPerfilSrc(signedData.signedUrl)
      setFotoPreview('')
      setFotoSelecionada(null)
      setStatusFoto('Foto salva com sucesso.')
    } catch {
      setStatusFoto('Não foi possível salvar a foto. Verifique as permissões do Storage no Supabase.')
    } finally {
      setSalvandoFoto(false)
    }
  }

  async function carregarVisualizacaoPdf(material: MaterialInformativo) {
    if (!isPdfMaterial(material)) {
      setErroMateriais('A visualização dentro do painel está disponível para arquivos PDF.')
      return
    }

    setCarregandoPdf(true)
    const supabase = createClient()
    const { data, error } = await supabase.storage.from(BUCKET_MATERIAIS).createSignedUrl(material.file_path, 60 * 60)

    if (error || !data?.signedUrl) {
      setErroMateriais('Não foi possível abrir este material agora.')
      setCarregandoPdf(false)
      return
    }

    const folha = isFolhaPontoD1(material) ? encontrarFolhaDoProfissional(folhasPontoD1, profile) : null
    const paginaInicial = folha?.pagina ?? 1
    setErroMateriais('')
    setVisualizadorPdf({
      materialId: material.id,
      titulo: folha ? `${material.titulo} - ${folha.nome}` : material.titulo,
      baseUrl: data.signedUrl,
      pagina: paginaInicial,
      paginaMin: folha?.pagina,
      paginaMax: folha?.pagina,
    })
    setTotalPaginasPdf(0)
    setCarregandoPdf(false)
  }

  function mudarPaginaPdf(delta: number) {
    setVisualizadorPdf(atual => {
      if (!atual) return atual
      const minimo = atual.paginaMin ?? 1
      const maximo = atual.paginaMax ?? totalPaginasPdf
      const proxima = Math.max(minimo, atual.pagina + delta)
      return { ...atual, pagina: maximo > 0 ? Math.min(proxima, maximo) : proxima }
    })
  }

  async function confirmarLeitura(material: MaterialInformativo) {
    if (!profileId || !profile) return
    if (leiturasMateriais[material.id]) {
      setErroMateriais(`Termo já assinado para "${material.titulo}". Não é necessário assinar novamente.`)
      return
    }

    const folhaCiencia = isFolhaPontoD1(material) ? encontrarFolhaDoProfissional(folhasPontoD1, profile) : null
    if (isFolhaPontoD1(material) && !folhaCiencia) {
      setErroMateriais('Não foi possível identificar sua página da Folha de Ponto D-1 para registrar a ciência.')
      return
    }

    const tituloCiencia = folhaCiencia
      ? `${material.titulo} - ${folhaCiencia.nome} - página ${folhaCiencia.pagina}`
      : material.titulo
    const arquivoCiencia = folhaCiencia
      ? `${material.file_name} | página ${folhaCiencia.pagina}`
      : material.file_name

    if (DEMO_MODE) {
      const agoraDemo = new Date().toISOString()
      salvarLeituraLocal(profileId, material.id, agoraDemo)
      setLeiturasMateriais(prev => ({ ...prev, [material.id]: agoraDemo }))
      setErroMateriais('')
      return
    }

    const supabase = createClient()
    const agora = new Date().toISOString()
    salvarLeituraLocal(profileId, material.id, agora)
    setLeiturasMateriais(prev => ({ ...prev, [material.id]: agora }))
    registrarEventoGoogleSheets({
      tipo: 'leitura_material',
      email: profileEmail,
      nome: profile.nome,
      perfil: profile.role,
      profile_id: profileId,
      material_id: material.id,
      material_titulo: tituloCiencia,
      material_arquivo: arquivoCiencia,
      material_categoria: material.categoria,
    })

    const { error } = await supabase
      .from('materiais_leituras')
      .upsert({ material_id: material.id, profile_id: profileId, read_at: agora }, { onConflict: 'material_id,profile_id' })

    if (error) {
      setErroMateriais('Confirmação enviada para o Google Sheets. O registro no Supabase ainda precisa do script de materiais.')
      return
    }

    setErroMateriais('')
  }

  async function enviarMensagemAdmin(event: React.SyntheticEvent) {
    event.preventDefault()
    if (!profileId || !profile) return

    const texto = mensagemAdmin.trim()
    if (texto.length < 5) {
      setStatusMensagemAdmin('Escreva uma mensagem com pelo menos 5 caracteres.')
      return
    }

    setEnviandoMensagemAdmin(true)
    setStatusMensagemAdmin('')

    try {
      await enviarMensagemGoogleSheets({
        email: profileEmail,
        nome: profile.nome,
        perfil: profile.role,
        profile_id: profileId,
        mensagem: texto,
        destino: 'admin',
      })

      setMensagemAdmin('')
      setStatusMensagemAdmin('Mensagem enviada para o Admin e registrada no Google Sheets.')
    } catch {
      setStatusMensagemAdmin('Não foi possível registrar no Google Sheets. Atualize o Apps Script e tente novamente.')
    } finally {
      setEnviandoMensagemAdmin(false)
    }
  }

  async function enviarAutoavaliacao(event: React.SyntheticEvent) {
    event.preventDefault()
    if (!profileId || !profile || !autoavaliacaoConfig?.liberado) return

    const perguntasSemNota = AUTOAVALIACAO_PERGUNTAS.filter(pergunta => !notasAutoavaliacao[pergunta.id])
    if (perguntasSemNota.length > 0 || !desempenhoGeral) {
      setStatusAutoavaliacao('Selecione uma nota de 1 a 10 para todos os critérios e para o desempenho geral.')
      return
    }

    setEnviandoAutoavaliacao(true)
    setStatusAutoavaliacao('')

    const payload = {
      periodo: autoavaliacaoConfig.periodo,
      email: profileEmail,
      nome: profile.nome,
      perfil: profile.role,
      profile_id: profileId,
      media: calcularMediaAutoavaliacao(notasAutoavaliacao),
      desempenho_geral: desempenhoGeral,
      notas: notasAutoavaliacao,
      textos: textosAutoavaliacao,
    }

    try {
      await enviarAutoavaliacaoGoogleSheets(payload)
      setAutoavaliacaoResposta({ ...payload, registrado_em: new Date().toISOString() })
      setStatusAutoavaliacao('Autoavaliação enviada e registrada no Google Sheets.')
    } catch {
      setStatusAutoavaliacao('Não foi possível registrar a autoavaliação no Google Sheets. Verifique o Apps Script e tente novamente.')
    } finally {
      setEnviandoAutoavaliacao(false)
    }
  }

  function categoriaDoMaterial(material: MaterialInformativo) {
    return material.categoria || 'Comunicados'
  }

  function trocarVideoYoutube(delta: number) {
    setYoutubeVideoIndex(atual => Math.min(Math.max(atual + delta, 0), YOUTUBE_PLAYLIST_LIMIT - 1))
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
  const folhaPontoProfissional = encontrarFolhaDoProfissional(folhasPontoD1, profile)
  const temMaterialFolhaPontoD1 = materiais.some(isFolhaPontoD1)
  const materiaisIndividuais = materiais.filter(material =>
    !isFolhaPontoD1(material)
    || folhaPontoProfissional?.material_id === material.id
    || Boolean(erroFolhaPontoD1),
  )
  const materiaisComCiencia = materiaisIndividuais.filter(material =>
    (isPdfMaterial(material) || isLinkMaterial(material)) && exigeCienciaMaterial(material),
  )
  const materiaisPendentesCiencia = materiaisComCiencia.filter(material => !leiturasMateriais[material.id])
  const precisaLiberarMateriais = materiaisPendentesCiencia.length > 0
  const materiaisAgrupados = materiaisIndividuais.reduce<Record<string, MaterialInformativo[]>>((acc, material) => {
    const categoria = categoriaDoMaterial(material)
    acc[categoria] = [...(acc[categoria] ?? []), material]
    return acc
  }, {})
  const autoavaliacaoLiberada = configAutoavaliacaoEstaLiberada(autoavaliacaoConfig)
  const precisaResponderAutoavaliacao = autoavaliacaoLiberada && !autoavaliacaoResposta
  const podeVisualizarDados = !precisaLiberarMateriais && !precisaResponderAutoavaliacao
  const fotoParaExibir = fotoPreview || fotoPerfilSrc
  const youtubeEmbedUrl = `https://www.youtube-nocookie.com/embed/videoseries?list=${YOUTUBE_UPLOADS_PLAYLIST_ID}&index=${youtubeVideoIndex}&autoplay=1&mute=${youtubeMuted ? '1' : '0'}&playsinline=1&rel=0&controls=1`
  const gruposAutoavaliacao = AUTOAVALIACAO_PERGUNTAS.reduce<Record<string, typeof AUTOAVALIACAO_PERGUNTAS>>((acc, pergunta) => {
    acc[pergunta.grupo] = [...(acc[pergunta.grupo] ?? []), pergunta]
    return acc
  }, {})
  const autoavaliacaoMedia = calcularMediaAutoavaliacao(notasAutoavaliacao)

  if (loading || !profile) {
    return (
      <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'rgba(240,230,255,0.4)', fontSize: 16 }}>Carregando...</div>
      </div>
    )
  }

  if (profile.contrato === 'cnpj') {
    const comunicados = materiaisAgrupados['Comunicados'] ?? []
    const aReceberCnpj = realizado * 0.30

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
              <div style={{ fontSize: 11, color: 'rgba(240,230,255,0.4)' }}>Profissional (CNPJ)</div>
            </div>
            <button onClick={handleSair} style={{ background: 'none', border: 'none', width: '100%', cursor: 'pointer', padding: 0 }}>
              <div className="nav-link">🚪 Sair</div>
            </button>
          </div>
        </aside>

        <main className="app-main professional-main" style={{ flex: 1, padding: '28px 32px', overflowY: 'auto' }}>
          <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
                Olá, <span className="gradient-text">{profile.primeiro_nome}! 👋</span>
              </h1>
              <p style={{ color: 'rgba(240,230,255,0.45)', fontSize: 14 }}>Seu resumo em {mesSelecionado}</p>
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

          <div className="responsive-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16, marginBottom: 24 }}>
            <div className="glass-sm" style={{ padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 32, fontWeight: 800, color: '#f472b6' }}>{formatBRL(realizado)}</div>
              <div style={{ fontSize: 13, color: 'rgba(240,230,255,0.5)' }}>
                Valor Realizado em {mesSelecionado}
                {usandoReferencia2025 && <span style={{ marginLeft: 6, color: '#facc15' }}>≈ valor de 2025 (referência)</span>}
              </div>
            </div>
            <div className="glass-sm" style={{ padding: 24, textAlign: 'center' }}>
              <div style={{ fontSize: 32, fontWeight: 800, color: '#4ade80' }}>{formatBRL(aReceberCnpj)}</div>
              <div style={{ fontSize: 13, color: 'rgba(240,230,255,0.5)' }}>Valor a Receber (30% do realizado)</div>
            </div>
          </div>

          <div className="glass-sm" style={{ padding: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>📢 Comunicados</h3>
            <p style={{ fontSize: 12, color: 'rgba(240,230,255,0.45)', marginBottom: 18 }}>
              Comunicados anexados pela administração.
            </p>
            {comunicados.length === 0 ? (
              <div style={{ fontSize: 13, color: 'rgba(240,230,255,0.4)' }}>Nenhum comunicado no momento.</div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {comunicados.map(material => (
                  <div key={material.id} style={{ padding: 14, borderRadius: 12, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#f0e6ff' }}>{material.titulo}</div>
                    {material.descricao && <div style={{ fontSize: 12, color: 'rgba(240,230,255,0.45)', marginTop: 4 }}>{material.descricao}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
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

        <div className="professional-photo-panel" style={{ padding: '6px 8px 0', width: '100%' }}>
          <div style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '4 / 5',
            borderRadius: 18,
            overflow: 'hidden',
            border: '1px solid rgba(244,114,182,0.22)',
            background: 'rgba(255,255,255,0.04)',
            boxShadow: '0 18px 48px rgba(0,0,0,0.35)',
          }}>
            {fotoParaExibir ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={fotoParaExibir}
                alt={`Foto de ${profile.primeiro_nome}`}
                style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', display: 'block' }}
              />
            ) : (
              <div className="photo-placeholder">
                {profile.primeiro_nome.slice(0, 1).toUpperCase()}
              </div>
            )}
            <div style={{
              position: 'absolute',
              inset: 0,
              background: 'linear-gradient(180deg, rgba(8,2,16,0.02) 44%, rgba(8,2,16,0.72) 100%)',
            }} />
            <div style={{
              position: 'absolute',
              left: 12,
              right: 12,
              bottom: 12,
            }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', textShadow: '0 2px 12px rgba(0,0,0,0.45)' }}>
                {profile.primeiro_nome}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0 }}>
                Profissional
              </div>
            </div>
          </div>
          <div className="photo-upload-actions">
            <label className="photo-upload-label" htmlFor="foto-profissional-input">
              Trocar foto
            </label>
            <input
              id="foto-profissional-input"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={selecionarFoto}
              style={{ display: 'none' }}
            />
            <button
              type="button"
              className="photo-save-button"
              onClick={salvarFotoProfissional}
              disabled={!fotoSelecionada || salvandoFoto}
            >
              {salvandoFoto ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
          {statusFoto && (
            <div className="photo-upload-status">
              {statusFoto}
            </div>
          )}
        </div>

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

      <main className="app-main professional-main" style={{ flex: 1, padding: '28px 32px', overflowY: 'auto' }}>
        <div id="painel-resumo" className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
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

        {!podeVisualizarDados && (
          <div className="glass-sm" style={{ padding: 24, marginBottom: 24, border: '1px solid rgba(250,204,21,0.22)', background: 'rgba(250,204,21,0.06)' }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 8, color: '#facc15' }}>
              Atenção: pendência prioritária
            </h2>
            <p style={{ color: 'rgba(240,230,255,0.72)', fontSize: 14, lineHeight: 1.6 }}>
              Seus dados, valores, metas e indicadores serão liberados após concluir as pendências obrigatórias.
              {precisaResponderAutoavaliacao && (
                <>
                  {' '}Responda a <strong>Autoavaliação de Desempenho</strong> liberada pela administração.
                </>
              )}
              {precisaLiberarMateriais && (
                <>
                  {' '}Acesse e conclua todos os materiais e links informativos pendentes e clique em <strong>Li e estou ciente</strong>.
                </>
              )}
            </p>
            <div style={{ color: 'rgba(240,230,255,0.5)', fontSize: 12, marginTop: 10 }}>
              {precisaResponderAutoavaliacao && (
                <div>Autoavaliação pendente: {autoavaliacaoConfig?.periodo}</div>
              )}
              {precisaLiberarMateriais && (
                <div>Materiais/links pendentes: {materiaisPendentesCiencia.length} de {materiaisComCiencia.length}</div>
              )}
            </div>
            {precisaResponderAutoavaliacao && (
              <a href="#painel-autoavaliacao" style={{ display: 'inline-flex', marginTop: 14, color: '#f0e6ff', fontSize: 13, fontWeight: 800, textDecoration: 'none', background: 'linear-gradient(135deg,#be185d,#7c3aed)', borderRadius: 10, padding: '10px 14px' }}>
                Responder autoavaliação
              </a>
            )}
          </div>
        )}

        {(folhaPontoProfissional || erroFolhaPontoD1 || temMaterialFolhaPontoD1) && (
          <div id="painel-folha-ponto" className="glass-sm ponto-d1-panel" style={{ padding: 24, marginBottom: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Folha de Ponto D-1</h3>
            {folhaPontoProfissional ? (
              <>
                <p style={{ fontSize: 12, color: 'rgba(240,230,255,0.45)', marginBottom: 16 }}>
                  Período {folhaPontoProfissional!.periodo}. Visualização individual liberada na página {folhaPontoProfissional!.pagina} do documento.
                </p>
                {folhaPontoProfissional!.marcacao_impar && (
                  <div className="ponto-d1-alert">
                    <div className="ponto-d1-alert-icon">!</div>
                    <div>
                      <div className="ponto-d1-alert-title">
                        Procure seu gestor para ajustar seus pontos com erro de marcação
                      </div>
                      <div className="ponto-d1-alert-text">
                        Dias com marcação ímpar: {folhaPontoProfissional!.dias_marcacao_impar.join(', ')}
                      </div>
                    </div>
                  </div>
                )}
                <div className="responsive-grid professional-kpi-grid ponto-d1-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                  {[
                    { label: 'Horas batidas', valor: folhaPontoProfissional!.horas_batidas, cor: '#38bdf8' },
                    { label: 'Escala prevista', valor: folhaPontoProfissional!.horas_previstas, cor: 'rgba(240,230,255,0.85)' },
                    { label: 'Trabalhadas + abono', valor: folhaPontoProfissional!.horas_com_abono, cor: '#c084fc' },
                    { label: 'Saldo do período', valor: folhaPontoProfissional!.saldo_periodo, cor: folhaPontoProfissional!.saldo_minutos >= 0 ? '#4ade80' : '#f87171' },
                  ].map(item => (
                    <div key={item.label} className="ponto-d1-card">
                      <div style={{ fontSize: 20, fontWeight: 800, color: item.cor }}>{item.valor}</div>
                      <div style={{ fontSize: 11, color: 'rgba(240,230,255,0.45)', marginTop: 4 }}>{item.label}</div>
                    </div>
                  ))}
                </div>
              </>
            ) : erroFolhaPontoD1 ? (
              <div style={{ color: '#facc15', fontSize: 13 }}>{erroFolhaPontoD1}</div>
            ) : (
              <div style={{ color: '#7dd3fc', fontSize: 13 }}>
                A Folha de Ponto D-1 foi anexada. A visualização individual será exibida assim que o documento for compatibilizado com seu nome.
              </div>
            )}
          </div>
        )}

        {podeVisualizarDados && (
          <>
        <div className="hero-summary" style={{
          background: 'linear-gradient(135deg, rgba(190,24,93,0.15), rgba(124,58,237,0.1))',
          border: '1px solid rgba(244,114,182,0.2)',
          borderRadius: 20, padding: '28px 32px', marginBottom: 24,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16,
        }}>
          <div>
            <div style={{ fontSize: 48, fontWeight: 800, lineHeight: 1 }}>{rankingDisponivel ? getMedalEmoji(posicao) : '—'}</div>
            <div style={{ fontSize: 14, color: 'rgba(240,230,255,0.5)', marginTop: 8 }}>
              {rankingDisponivel ? 'Posição no ranking mensal' : 'Ranking mensal aguardando atualização'}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 32, fontWeight: 800, color: '#f472b6' }}>{formatBRL(realizado)}</div>
            <div style={{ fontSize: 13, color: 'rgba(240,230,255,0.5)' }}>
              Realizado em {mesSelecionado}
              {usandoReferencia2025 && <span style={{ marginLeft: 6, color: '#facc15' }}>≈ valor de 2025 (referência)</span>}
            </div>
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

        {false && (folhaPontoProfissional || erroFolhaPontoD1) && (
          <div className="glass-sm" style={{ padding: 24, marginBottom: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Folha de Ponto D-1</h3>
            {erroFolhaPontoD1 ? (
              <div style={{ color: '#facc15', fontSize: 13 }}>{erroFolhaPontoD1}</div>
            ) : folhaPontoProfissional && (
              <>
                <p style={{ fontSize: 12, color: 'rgba(240,230,255,0.45)', marginBottom: 16 }}>
                  Período {folhaPontoProfissional!.periodo}. Visualização individual liberada na página {folhaPontoProfissional!.pagina} do documento.
                </p>
                {folhaPontoProfissional!.marcacao_impar && (
                  <div style={{
                    display: 'flex',
                    gap: 14,
                    alignItems: 'center',
                    marginBottom: 16,
                    padding: '18px 20px',
                    borderRadius: 14,
                    background: 'rgba(239,68,68,0.14)',
                    border: '1px solid rgba(239,68,68,0.34)',
                    color: '#fecaca',
                  }}>
                    <div style={{ width: 42, height: 42, borderRadius: 999, display: 'grid', placeItems: 'center', background: '#ef4444', color: '#fff', fontSize: 30, fontWeight: 900, flexShrink: 0 }}>
                      !
                    </div>
                    <div>
                      <div style={{ fontSize: 20, fontWeight: 900, color: '#fff', marginBottom: 4 }}>
                        Procure seu gestor para ajustar seus pontos com erro de marcação
                      </div>
                      <div style={{ fontSize: 12, color: '#fecaca' }}>
                        Dias com marcação ímpar: {folhaPontoProfissional!.dias_marcacao_impar.join(', ')}
                      </div>
                    </div>
                  </div>
                )}
                <div className="responsive-grid professional-kpi-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                  {[
                    { label: 'Horas batidas', valor: folhaPontoProfissional!.horas_batidas, cor: '#38bdf8' },
                    { label: 'Escala prevista', valor: folhaPontoProfissional!.horas_previstas, cor: 'rgba(240,230,255,0.85)' },
                    { label: 'Trabalhadas + abono', valor: folhaPontoProfissional!.horas_com_abono, cor: '#c084fc' },
                    { label: 'Saldo do período', valor: folhaPontoProfissional!.saldo_periodo, cor: folhaPontoProfissional!.saldo_minutos >= 0 ? '#4ade80' : '#f87171' },
                  ].map(item => (
                    <div key={item.label} style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 14, background: 'rgba(255,255,255,0.03)' }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: item.cor }}>{item.valor}</div>
                      <div style={{ fontSize: 11, color: 'rgba(240,230,255,0.45)', marginTop: 4 }}>{item.label}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        <div id="painel-metas" className="glass-sm" style={{ padding: 24, marginBottom: 24 }}>
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
            Posição anual: <strong style={{ color: '#c084fc' }}>{rankingDisponivel ? `${posicaoAnual}º` : 'aguardando atualização'}</strong>
          </div>

          <div style={{ fontSize: 14, color: '#c084fc', fontStyle: 'italic', marginTop: 12 }}>
            ✨ {rankingDisponivel ? getMensagemAnual(posicaoAnual) : 'Seu acumulado anual já está atualizado; a posição geral será exibida após atualizar a função de ranking.'}
          </div>
        </div>

        <div className="professional-content-row">
          <div style={{
            background: 'linear-gradient(135deg, rgba(124,58,237,0.1), rgba(190,24,93,0.08))',
            border: '1px solid rgba(192,132,252,0.15)',
            borderRadius: 16, padding: 24,
          }}>
            <div style={{ fontSize: 13, color: 'rgba(240,230,255,0.5)', marginBottom: 8 }}>💬 Mensagem do mês</div>
            <div style={{ fontSize: 15, color: '#f0e6ff', lineHeight: 1.6 }}>
              {fraseMotivacional || getMensagem(posicao)}
            </div>
          </div>

          <div className="youtube-window">
            <div className="youtube-window-header">
              <div>
                <div style={{ fontSize: 13, color: 'rgba(240,230,255,0.5)', marginBottom: 4 }}>▶ Conteúdos da Dra. Roseane</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#f0e6ff' }}>Vídeos para assistir no painel</div>
              </div>
              <a href={YOUTUBE_CANAL_URL} target="_blank" rel="noreferrer" className="youtube-channel-link">
                Canal
              </a>
            </div>
            <div className="youtube-controls">
              <button type="button" onClick={() => trocarVideoYoutube(-1)} disabled={youtubeVideoIndex === 0}>Anterior</button>
              <span>Vídeo {youtubeVideoIndex + 1}</span>
              <button type="button" onClick={() => trocarVideoYoutube(1)}>Próximo</button>
              <button type="button" onClick={() => setYoutubeMuted(atual => !atual)}>
                {youtubeMuted ? 'Ativar som' : 'Desativar som'}
              </button>
            </div>
            <div className="youtube-frame-shell">
              <iframe
                key={`${YOUTUBE_UPLOADS_PLAYLIST_ID}-${youtubeVideoIndex}-${youtubeMuted ? 'muted' : 'sound'}`}
                src={youtubeEmbedUrl}
                title="Vídeos do canal Dra. Roseane Débora"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
              />
            </div>
          </div>
        </div>
          </>
        )}

        <div className="glass-sm" style={{ padding: 24, marginTop: 24, marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>🧾 Minhas vendas em {mesSelecionado}</h3>
          <p style={{ fontSize: 12, color: 'rgba(240,230,255,0.45)', marginBottom: 18 }}>
            Detalhe das suas vendas do mês. Visível apenas para você.
          </p>

          {carregandoVendas ? (
            <div style={{ textAlign: 'center', padding: 24, color: 'rgba(240,230,255,0.4)', fontSize: 13 }}>Carregando...</div>
          ) : erroVendas ? (
            <div style={{ fontSize: 13, color: 'rgba(240,230,255,0.45)' }}>{erroVendas}</div>
          ) : vendasMes.length === 0 ? (
            <div style={{ fontSize: 13, color: 'rgba(240,230,255,0.45)' }}>Nenhuma venda registrada para este mês ainda.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                    {['Data', 'Cliente', 'Serviço', 'Valor'].map(h => (
                      <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 12, color: 'rgba(240,230,255,0.4)', fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {vendasMes.map((venda, index) => (
                    <tr key={index} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding: '10px 14px', fontSize: 13 }}>{new Date(`${venda.data_venda}T00:00:00`).toLocaleDateString('pt-BR')}</td>
                      <td style={{ padding: '10px 14px', fontSize: 13 }}>{venda.cliente_nome ?? '—'}</td>
                      <td style={{ padding: '10px 14px', fontSize: 13 }}>{venda.servico ?? '—'}</td>
                      <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 600 }}>{formatBRL(venda.valor)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                    <td colSpan={3} style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700 }}>Total</td>
                    <td style={{ padding: '10px 14px', fontSize: 14, fontWeight: 700, color: '#c084fc' }}>
                      {formatBRL(vendasMes.reduce((soma, venda) => soma + venda.valor, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        <div id="painel-materiais" className="glass-sm" style={{ padding: 24, marginTop: 24, marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>📎 Materiais informativos</h3>
          <p style={{ fontSize: 12, color: 'rgba(240,230,255,0.45)', marginBottom: 18 }}>
            Arquivos liberados pela administração para consulta.
          </p>

          {erroMateriais && (
            <div style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.16)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#facc15', marginBottom: 14 }}>
              {erroMateriais}
            </div>
          )}

          {temMaterialFolhaPontoD1 && !folhaPontoProfissional && !erroFolhaPontoD1 && (
            <div style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.16)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#7dd3fc', marginBottom: 14 }}>
              A Folha de Ponto D-1 é liberada de forma individual. Quando o documento for analisado e houver correspondência com seu nome, somente a sua página aparecerá aqui.
            </div>
          )}

          <div style={{ display: 'grid', gap: 18 }}>
            {Object.entries(materiaisAgrupados).map(([categoria, itens]) => (
              <section key={categoria} style={{ display: 'grid', gap: 10 }}>
                <div className="material-category-title">{categoria}</div>
                {itens.map(material => {
                  const lidoEm = leiturasMateriais[material.id]
                  const dispensaCiencia = !exigeCienciaMaterial(material)
                  const folhaSemCorrespondencia = isFolhaPontoD1(material) && !folhaPontoProfissional
                  const materialAberto = visualizadorPdf?.materialId === material.id
                  const chegouAoFinal = Boolean(materialAberto && totalPaginasPdf > 0 && visualizadorPdf && visualizadorPdf.pagina >= totalPaginasPdf)
                  const linkAberto = isLinkMaterial(material) && linksAbertos.has(material.id)
                  const linkMaterial = urlDoMaterialLink(material)
                  const podeConfirmarCiencia = Boolean(lidoEm) || chegouAoFinal || linkAberto
                  return (
                    <div key={material.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: 14, borderRadius: 12, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
                      <div style={{ minWidth: 220, flex: '1 1 260px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#f0e6ff' }}>{material.titulo}</div>
                          {dispensaCiencia ? <span className="material-read-badge">Consulta</span> : lidoEm && <span className="material-read-badge">Ciente</span>}
                        </div>
                        {material.descricao && <div style={{ fontSize: 12, color: 'rgba(240,230,255,0.45)', marginTop: 4 }}>{material.descricao}</div>}
                        {!isLinkMaterial(material) && (
                          <div style={{ fontSize: 11, color: 'rgba(240,230,255,0.35)', marginTop: 6 }}>{material.file_name} · {formatFileSize(material.file_size)}</div>
                        )}
                      </div>
                      <div className="material-actions">
                        {isLinkMaterial(material) ? (
                          linkMaterial ? (
                            <a
                              href={linkMaterial}
                              target="_blank"
                              rel="noreferrer"
                              onClick={() => setLinksAbertos(prev => new Set([...prev, material.id]))}
                              style={{
                                display: 'inline-block',
                                background: linkAberto ? 'rgba(74,222,128,0.16)' : 'linear-gradient(135deg,#be185d,#7c3aed)',
                                border: linkAberto ? '1px solid rgba(74,222,128,0.28)' : '0',
                                color: linkAberto ? '#86efac' : 'white',
                                borderRadius: 10,
                                padding: '10px 14px',
                                fontSize: 12,
                                fontWeight: 700,
                                textDecoration: 'none',
                              }}
                            >
                              {linkAberto ? 'Link acessado' : 'Acessar link'}
                            </a>
                          ) : (
                            <span style={{ fontSize: 12, color: 'rgba(240,230,255,0.35)' }}>Link não configurado</span>
                          )
                        ) : (
                          <button
                            type="button"
                            onClick={() => carregarVisualizacaoPdf(material)}
                            disabled={!isPdfMaterial(material) || carregandoPdf || folhaSemCorrespondencia}
                            style={{
                              background: visualizadorPdf?.materialId === material.id ? 'rgba(74,222,128,0.16)' : 'linear-gradient(135deg,#be185d,#7c3aed)',
                              border: visualizadorPdf?.materialId === material.id ? '1px solid rgba(74,222,128,0.28)' : 0,
                              color: visualizadorPdf?.materialId === material.id ? '#86efac' : 'white',
                              borderRadius: 10,
                              padding: '10px 14px',
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: isPdfMaterial(material) && !folhaSemCorrespondencia ? 'pointer' : 'not-allowed',
                              opacity: isPdfMaterial(material) && !folhaSemCorrespondencia ? 1 : 0.55,
                            }}
                          >
                            {folhaSemCorrespondencia ? 'Aguardando compatibilização' : isPdfMaterial(material) ? (visualizadorPdf?.materialId === material.id ? 'Aberto no painel' : 'Visualizar no painel') : 'PDF indisponível'}
                          </button>
                        )}
                        {dispensaCiencia ? (
                          <div className="material-read-confirmed">
                            Sem ciência obrigatória
                          </div>
                        ) : lidoEm ? (
                          <div className="material-read-confirmed">
                            Termo já assinado em {new Date(lidoEm).toLocaleDateString('pt-BR')}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => confirmarLeitura(material)}
                            disabled={!podeConfirmarCiencia}
                            className="material-read-button"
                            title={!podeConfirmarCiencia ? (isLinkMaterial(material) ? 'Acesse o link para habilitar a ciência.' : 'Leia o material até a última página para habilitar a ciência.') : undefined}
                          >
                            Li e estou ciente
                          </button>
                        )}
                        {!lidoEm && !podeConfirmarCiencia && (isPdfMaterial(material) || isLinkMaterial(material)) && (
                          <div style={{ flexBasis: '100%', fontSize: 11, color: 'rgba(240,230,255,0.45)' }}>
                            {isLinkMaterial(material) ? 'O botão será liberado ao acessar o link.' : 'O botão será liberado ao chegar na última página.'}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </section>
            ))}
            {materiaisIndividuais.length === 0 && !erroMateriais && (
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
                    <button
                      type="button"
                      onClick={() => mudarPaginaPdf(-1)}
                      disabled={visualizadorPdf.pagina <= (visualizadorPdf.paginaMin ?? 1)}
                      className="material-page-button"
                    >
                      Voltar página
                    </button>
                    <div className="material-page-counter">Página {visualizadorPdf.pagina}{totalPaginasPdf > 0 ? ` de ${totalPaginasPdf}` : ''}</div>
                    <button
                      type="button"
                      onClick={() => mudarPaginaPdf(1)}
                      disabled={totalPaginasPdf > 0 && visualizadorPdf.pagina >= (visualizadorPdf.paginaMax ?? totalPaginasPdf)}
                      className="material-page-button"
                    >
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
        {autoavaliacaoLiberada && (
          <div id="painel-autoavaliacao" className="glass-sm" style={{ padding: 24, marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 18 }}>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>Autoavaliação de Desempenho</h3>
                <p style={{ fontSize: 12, color: 'rgba(240,230,255,0.45)' }}>
                  Formulário liberado para {autoavaliacaoConfig?.periodo}
                  {autoavaliacaoConfig?.data_inicio && autoavaliacaoConfig?.data_fim
                    ? `, de ${formatarDataAutoavaliacao(autoavaliacaoConfig.data_inicio)} até ${formatarDataAutoavaliacao(autoavaliacaoConfig.data_fim)}`
                    : ''}.
                  {' '}Responda de forma reflexiva e registre seus pontos de evolução.
                </p>
              </div>
              <span className="message-panel-badge">
                {autoavaliacaoResposta ? 'Enviada' : 'Pendente'}
              </span>
            </div>

            <div className="responsive-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 18 }}>
              {[
                ['Nome', profile.nome],
                ['Função', profile.role === 'user' ? 'Esteticista' : profile.role],
                ['Período avaliado', autoavaliacaoConfig?.periodo ?? '-'],
              ].map(([label, valor]) => (
                <div key={label} style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 14, background: 'rgba(255,255,255,0.03)' }}>
                  <div style={{ fontSize: 11, color: 'rgba(240,230,255,0.45)', marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#f0e6ff' }}>{valor}</div>
                </div>
              ))}
            </div>

            {autoavaliacaoResposta ? (
              <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.18)', borderRadius: 12, padding: 14, color: '#86efac', fontSize: 13, marginBottom: 18 }}>
                Autoavaliação já registrada para este período. Média dos critérios: <strong>{autoavaliacaoResposta.media.toFixed(1)}/10</strong>.
              </div>
            ) : (
              <form onSubmit={enviarAutoavaliacao} style={{ display: 'grid', gap: 18 }}>
                {Object.entries(gruposAutoavaliacao).map(([grupo, perguntas]) => (
                  <section key={grupo} style={{ display: 'grid', gap: 10 }}>
                    <div className="material-category-title">{grupo}</div>
                    {perguntas.map(pergunta => (
                      <div key={pergunta.id} className="responsive-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 130px', gap: 12, alignItems: 'center', padding: 12, borderRadius: 12, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)' }}>
                        <div style={{ fontSize: 13, color: '#f0e6ff', lineHeight: 1.5 }}>{pergunta.texto}</div>
                        <select
                          className="input-field"
                          value={notasAutoavaliacao[pergunta.id] ?? ''}
                          onChange={event => setNotasAutoavaliacao(prev => ({ ...prev, [pergunta.id]: Number(event.target.value) }))}
                        >
                          <option value="" style={{ background: '#1a0a2e' }}>Nota</option>
                          {Array.from({ length: 10 }, (_, index) => index + 1).map(nota => (
                            <option key={nota} value={nota} style={{ background: '#1a0a2e' }}>{nota}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </section>
                ))}

                <section style={{ display: 'grid', gap: 12 }}>
                  <div className="material-category-title">Reflexões e desenvolvimento</div>
                  {AUTOAVALIACAO_CAMPOS_TEXTO.map(campo => (
                    <label key={campo.id} style={{ display: 'grid', gap: 6 }}>
                      <span style={{ fontSize: 12, color: 'rgba(240,230,255,0.55)' }}>{campo.label}</span>
                      <textarea
                        className="input-field message-textarea"
                        value={textosAutoavaliacao[campo.id] ?? ''}
                        onChange={event => setTextosAutoavaliacao(prev => ({ ...prev, [campo.id]: event.target.value }))}
                        placeholder="Digite sua resposta..."
                        style={{ minHeight: 86 }}
                      />
                    </label>
                  ))}
                </section>

                <div className="responsive-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 130px 160px', gap: 12, alignItems: 'end' }}>
                  <div style={{ fontSize: 13, color: 'rgba(240,230,255,0.6)' }}>
                    Média parcial dos critérios: <strong style={{ color: '#f472b6' }}>{autoavaliacaoMedia.toFixed(1)}/10</strong>
                  </div>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 12, color: 'rgba(240,230,255,0.55)' }}>Nota geral</span>
                    <select className="input-field" value={desempenhoGeral || ''} onChange={event => setDesempenhoGeral(Number(event.target.value))}>
                      <option value="" style={{ background: '#1a0a2e' }}>Nota</option>
                      {Array.from({ length: 10 }, (_, index) => index + 1).map(nota => (
                        <option key={nota} value={nota} style={{ background: '#1a0a2e' }}>{nota}</option>
                      ))}
                    </select>
                  </label>
                  <button type="submit" className="btn-primary" disabled={enviandoAutoavaliacao}>
                    {enviandoAutoavaliacao ? 'Enviando...' : 'Enviar avaliação'}
                  </button>
                </div>
              </form>
            )}

            {statusAutoavaliacao && (
              <div className="message-panel-status" style={{ marginTop: 14 }}>
                {statusAutoavaliacao}
              </div>
            )}
          </div>
        )}
        <div id="painel-mensagem-admin" className="glass-sm message-panel" style={{ padding: 24, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 14 }}>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Mensagem para o Admin</h3>
              <p style={{ fontSize: 12, color: 'rgba(240,230,255,0.45)' }}>
                Compartilhe uma observação, dúvida ou alinhamento com a administração. Sua mensagem ficará registrada para acompanhamento.
              </p>
            </div>
            <span className="message-panel-badge">Registro no Sheets</span>
          </div>
          <form onSubmit={enviarMensagemAdmin} className="message-form">
            <textarea
              className="input-field message-textarea"
              value={mensagemAdmin}
              onChange={event => setMensagemAdmin(event.target.value)}
              maxLength={600}
              placeholder="Escreva sua mensagem para o Admin..."
            />
            <div className="message-form-footer">
              <span>{mensagemAdmin.length}/600</span>
              <button type="submit" className="btn-primary" disabled={enviandoMensagemAdmin || mensagemAdmin.trim().length < 5}>
                {enviandoMensagemAdmin ? 'Enviando...' : 'Enviar mensagem'}
              </button>
            </div>
          </form>
          {statusMensagemAdmin && (
            <div className="message-panel-status">
              {statusMensagemAdmin}
            </div>
          )}
        </div>
        <div id="painel-senha">
          <AlterarSenhaCard />
        </div>
      </main>

      <nav className="mobile-bottom-nav" aria-label="Navegacao do painel">
        <a href="#painel-resumo">Painel</a>
        <a href="#painel-folha-ponto">Ponto</a>
        <a href="#painel-metas">Metas</a>
        <a href="#painel-materiais">Materiais</a>
        <a href="#painel-autoavaliacao">Avaliação</a>
        <a href="#painel-mensagem-admin">Mensagem</a>
      </nav>

      <DecoracaoDireita />
    </div>
  )
}
