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
import { calcularRankingAnual, calcularRankingMensal, mesclarResultadosComReferencia, resultadoDoMes } from '@/lib/dashboard-metrics'
import {
  atualizarAutoavaliacaoConfigGoogleSheets,
  buscarAutoavaliacaoConfigGoogleSheets,
  buscarAutoavaliacaoRespostasGoogleSheets,
  buscarLeiturasMateriaisGoogleSheets,
  buscarMensagensGoogleSheets,
  enviarMensagemGoogleSheets,
  registrarEventoGoogleSheets,
  type AutoavaliacaoConfig,
  type AutoavaliacaoResposta,
  type GoogleSheetsMessageRow,
} from '@/lib/google-sheets-sync'
import { AUTOAVALIACAO_CAMPOS_TEXTO, AUTOAVALIACAO_PERGUNTAS, formatarDataAutoavaliacao, normalizarDataAutoavaliacao } from '@/lib/autoavaliacao'
import { compatibilizarLeiturasGoogleSheets, type CompatibilizacaoLeituras } from '@/lib/material-read-compat'
import { criarCaminhoLinkStorage, criarCaminhoMaterialStorage, listarMateriaisDoStorage } from '@/lib/materiais-storage'
import { exigeCienciaMaterial } from '@/lib/material-obligation'
import { adicionarLinkManifest, isMaterialManifest, listarLinksManifest, removerLinkManifest } from '@/lib/link-manifest'
import {
  CATEGORIA_FOLHA_PONTO_D1,
  criarFolhasPontoD1Fallback,
  encontrarFolhaDoProfissional,
  extrairFolhasPontoD1DePdf,
  isFolhaPontoD1,
  type FolhaPontoD1,
} from '@/lib/ponto-d1'

type Aba = 'mensal' | 'anual' | 'bonus' | 'materiais' | 'autoavaliacao'
type PerfilAdmin = 'admin' | 'gestao'

const ANO_METAS = 2025
const ANO_RESULTADOS = new Date().getFullYear()
const PERCENTUAL_RECEBER_CNPJ = 0.30
const BUCKET_MATERIAIS = 'materiais-informativos'
const CATEGORIA_LINK = 'Links'
const YOUTUBE_CANAL_URL = 'https://www.youtube.com/@DraRoseaneDebora/videos'
const YOUTUBE_UPLOADS_PLAYLIST_ID = 'UUomJ8VZUli9JIv2Cgpzf_DQ'
const YOUTUBE_PLAYLIST_LIMIT = 50
const LIMITE_MATERIAL_BYTES = 50 * 1024 * 1024
const EXTENSOES_MATERIAIS = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'png', 'jpg', 'jpeg', 'webp', 'txt', 'csv', 'mp4', 'mov', 'zip']
const CATEGORIAS_MATERIAIS = ['Comunicados', 'Treinamentos', 'Metas', 'Protocolos', CATEGORIA_FOLHA_PONTO_D1, CATEGORIA_LINK]
const PREFIXO_DESTINOS_MATERIAL = 'targets__'

const SQL_MIGRACAO_LINKS = `ALTER TABLE public.materiais_informativos
  ADD COLUMN IF NOT EXISTS profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS target_profile_ids UUID[],
  ADD COLUMN IF NOT EXISTS link_url TEXT;

DROP POLICY IF EXISTS "authenticated_read_active_materials" ON public.materiais_informativos;

CREATE POLICY "authenticated_read_active_materials"
  ON public.materiais_informativos FOR SELECT TO authenticated
  USING (
    ativo = true AND (
      (profile_id IS NULL AND (target_profile_ids IS NULL OR cardinality(target_profile_ids) = 0))
      OR auth.uid() = ANY(target_profile_ids)
      OR profile_id = auth.uid()
      OR public.is_admin_or_gestao()
    )
  );`

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

function anexarDestinosAoCaminho(filePath: string, targetProfileIds: string[] | null) {
  if (!targetProfileIds || targetProfileIds.length === 0) return filePath
  return `${PREFIXO_DESTINOS_MATERIAL}${targetProfileIds.join(',')}__${filePath}`
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

export default function AdminPage() {
  const router = useRouter()
  const [mesSelecionado, setMesSelecionado] = useState(MESES_LISTA[new Date().getMonth()])
  const [aba, setAba] = useState<Aba>('mensal')
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [config, setConfig] = useState<ConfiguracoesMes | null>(null)
  const [resultados, setResultados] = useState<Resultado[]>([])
  const [todosResultados, setTodosResultados] = useState<Resultado[]>([])
  const [profissionaisComReferencia, setProfissionaisComReferencia] = useState<Set<string>>(new Set())
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
  const [mostrarSqlMigracao, setMostrarSqlMigracao] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const [materialParaTodas, setMaterialParaTodas] = useState(true)
  const [profileIdsMaterial, setProfileIdsMaterial] = useState<string[]>([])
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
  const [folhasPontoD1, setFolhasPontoD1] = useState<FolhaPontoD1[]>([])
  const [erroFolhaPontoD1, setErroFolhaPontoD1] = useState('')
  const [mensagemGestaoAdmin, setMensagemGestaoAdmin] = useState('')
  const [statusMensagemGestao, setStatusMensagemGestao] = useState('')
  const [enviandoMensagemGestao, setEnviandoMensagemGestao] = useState(false)
  const [erroMensagensAdmin, setErroMensagensAdmin] = useState('')
  const [autoavaliacaoConfig, setAutoavaliacaoConfig] = useState<AutoavaliacaoConfig>({ liberado: false, periodo: '' })
  const [periodoAutoavaliacao, setPeriodoAutoavaliacao] = useState('')
  const [dataInicioAutoavaliacao, setDataInicioAutoavaliacao] = useState('')
  const [dataFimAutoavaliacao, setDataFimAutoavaliacao] = useState('')
  const [autoavaliacaoRespostas, setAutoavaliacaoRespostas] = useState<AutoavaliacaoResposta[]>([])
  const [autoavaliacaoProfileId, setAutoavaliacaoProfileId] = useState('')
  const [statusAutoavaliacaoAdmin, setStatusAutoavaliacaoAdmin] = useState('')
  const [salvandoAutoavaliacaoAdmin, setSalvandoAutoavaliacaoAdmin] = useState(false)
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
      setAutoavaliacaoConfig({ liberado: false, periodo: '' })
      setPeriodoAutoavaliacao('')
      setDataInicioAutoavaliacao('')
      setDataFimAutoavaliacao('')
      setAutoavaliacaoRespostas([])
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

    const [{ data: profs }, { data: cfg }, { data: res }, { data: resReferencia }, { data: anuais }, { data: mats, error: matsError }] = await Promise.all([
      supabase.from('profiles').select('*').eq('ativo', true).eq('role', 'user').order('nome'),
      supabase.from('configuracoes_mes').select('*').eq('mes', mesNum).eq('ano', ANO_METAS).single(),
      supabase.from('resultados').select('*').eq('mes', mesNum).eq('ano', ANO_RESULTADOS),
      supabase.from('resultados').select('*').eq('mes', mesNum).eq('ano', ANO_METAS),
      supabase.from('resultados').select('*').eq('ano', ANO_RESULTADOS),
      supabase.from('materiais_informativos').select('*').order('created_at', { ascending: false }),
    ])

    const { resultados: resMesclados, profissionaisComReferencia: refsDoMes } = mesclarResultadosComReferencia(
      res ?? [], resReferencia ?? [], mesNum, ANO_RESULTADOS,
    )

    let materiaisCarregados = mats ?? []
    let erroMateriaisAtual = matsError ? mensagemErroMateriais(matsError.message, matsError.code) : ''
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
      if (matsError) materiaisCarregados = []
    }

    setProfiles(profs ?? [])
    setConfig(cfg ?? null)
    setResultados(resMesclados)
    setProfissionaisComReferencia(refsDoMes)
    setTodosResultados(anuais ?? [])
    setMateriais(materiaisCarregados)
    setErroMaterial(erroMateriaisAtual)

    const [leiturasResult, auditoriaResult] = await Promise.allSettled([
      supabase.from('materiais_leituras').select('material_id, profile_id, read_at'),
      supabase.from('auditoria_eventos').select('*').order('created_at', { ascending: false }).limit(5),
    ])

    const leiturasBanco = leiturasResult.status === 'fulfilled' ? ((leiturasResult.value.data ?? []) as MaterialLeitura[]) : []
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
        const resumoGoogle = compatibilizarLeiturasGoogleSheets(profs ?? [], materiaisCarregados, linhasGoogle)
        setResumoLeiturasGoogle(resumoGoogle)
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

    Promise.all([buscarAutoavaliacaoConfigGoogleSheets(), buscarAutoavaliacaoRespostasGoogleSheets()])
      .then(([configAuto, respostasAuto]) => {
        setAutoavaliacaoConfig(configAuto)
        setPeriodoAutoavaliacao(configAuto.periodo || `Avaliação ${mesSelecionado} 2025`)
        setDataInicioAutoavaliacao(normalizarDataAutoavaliacao(configAuto.data_inicio))
        setDataFimAutoavaliacao(normalizarDataAutoavaliacao(configAuto.data_fim))
        setAutoavaliacaoRespostas(respostasAuto)
        setStatusAutoavaliacaoAdmin('')
        setAutoavaliacaoProfileId(atual => atual || (profs?.[0]?.id ?? ''))
      })
      .catch(() => {
        setAutoavaliacaoRespostas([])
        setStatusAutoavaliacaoAdmin('Atualize o Apps Script para habilitar a liberação e leitura das autoavaliações.')
      })
  }, [mesNum, mesSelecionado, router]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { queueMicrotask(() => { carregarDados() }) }, [carregarDados])

  useEffect(() => {
    if (DEMO_MODE || materiais.length === 0) {
      queueMicrotask(() => {
        setFolhasPontoD1([])
        setErroFolhaPontoD1('')
      })
      return
    }

    const materiaisFolha = materiais.filter(material => material.ativo && isFolhaPontoD1(material) && isPdfMaterial(material))
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
          setFolhasPontoD1(folhas.length > 0 ? folhas : criarFolhasPontoD1Fallback(materiaisFolha, profiles))
          setErroFolhaPontoD1('')
        }
      } catch (error) {
        console.error('Erro ao analisar folha de ponto D-1', error)
        if (!cancelado) {
          setFolhasPontoD1(criarFolhasPontoD1Fallback(materiaisFolha, profiles))
          setErroFolhaPontoD1('Não foi possível analisar a Folha de Ponto D-1 agora.')
        }
      }
    }

    carregarFolhasPonto()
    return () => { cancelado = true }
  }, [materiais, profiles])

  useEffect(() => {
    queueMicrotask(() => setYoutubeVideoIndex(0))
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
    if (erroColunasDestinoMaterial(message, code)) {
      setMostrarSqlMigracao(true)
      return 'Execute o SQL abaixo no Supabase SQL Editor para liberar links e envio por profissional.'
    }
    if (message?.toLowerCase().includes('row-level security')) {
      return 'O Supabase bloqueou a ação pelas regras de acesso. O sistema tentará usar o armazenamento alternativo para liberar o material.'
    }
    if (code === 'PGRST205') {
      return 'A área de materiais ainda não foi criada no Supabase. Execute o arquivo supabase/fix_materiais_informativos.sql no SQL Editor.'
    }
    if (message?.toLowerCase().includes('bucket not found')) {
      return 'O armazenamento de materiais ainda não foi criado no Supabase. Execute o arquivo supabase/fix_materiais_informativos.sql no SQL Editor.'
    }
    return 'Não foi possível acessar os materiais informativos agora.'
  }

  function erroColunasDestinoMaterial(message?: string, code?: string) {
    const texto = (message ?? '').toLowerCase()
    return code === 'PGRST204'
      || texto.includes('schema cache')
      || texto.includes('link_url')
      || texto.includes('profile_id')
      || texto.includes('target_profile_ids')
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

  function toggleProfileMaterial(profileId: string) {
    setMaterialParaTodas(false)
    setProfileIdsMaterial(prev =>
      prev.includes(profileId)
        ? prev.filter(id => id !== profileId)
        : [...prev, profileId],
    )
  }

  function selecionarTodasMateriais() {
    setMaterialParaTodas(true)
    setProfileIdsMaterial([])
  }

  function resetarDestinoMaterial() {
    setMaterialParaTodas(true)
    setProfileIdsMaterial([])
  }

  function destinoMaterialSelecionado() {
    const idsSelecionados = materialParaTodas ? [] : profileIdsMaterial.filter(id => idsProfissionais.has(id))
    return {
      targetProfileIds: idsSelecionados.length > 0 ? idsSelecionados : null,
      label: idsSelecionados.length > 0
        ? `${idsSelecionados.length} profissional${idsSelecionados.length > 1 ? 'es' : ''} selecionada${idsSelecionados.length > 1 ? 's' : ''}`
        : 'todas as profissionais',
    }
  }

  function urlDoMaterialLink(material: MaterialInformativo) {
    const url = material.link_url || material.file_name
    return /^https?:\/\/.+/.test(url) ? url : ''
  }

  async function handleUploadMaterial(e: React.SyntheticEvent) {
    e.preventDefault()
    setMensagemMaterial('')
    setErroMaterial('')

    if (DEMO_MODE) {
      setErroMaterial('Upload real indisponível no modo demonstração.')
      return
    }

    const isLink = categoriaMaterial === CATEGORIA_LINK
    const destinoMaterial = destinoMaterialSelecionado()

    if (!materialParaTodas && !destinoMaterial.targetProfileIds) {
      setErroMaterial('Selecione pelo menos uma profissional ou marque todas.')
      return
    }

    if (isLink) {
      const url = linkUrl.trim()
      if (!url) {
        setErroMaterial('Informe a URL do link.')
        return
      }
      if (!/^https?:\/\/.+/.test(url)) {
        setErroMaterial('A URL deve começar com http:// ou https://')
        return
      }

      setSalvandoMaterial(true)
      const supabase = createClient()
      const titulo = tituloMaterial.trim() || 'Link informativo'
      const filePath = anexarDestinosAoCaminho(`link__${Date.now()}__${crypto.randomUUID()}`, destinoMaterial.targetProfileIds)

      const payloadLinkBase = {
        titulo,
        descricao: descricaoMaterial.trim() || null,
        categoria: CATEGORIA_LINK,
        file_name: url,
        file_path: filePath,
        file_type: null,
        file_size: null,
        ativo: true,
      }

      const payloadLinkCompleto = {
        ...payloadLinkBase,
        link_url: url,
        target_profile_ids: destinoMaterial.targetProfileIds ?? [],
      }

      let { error: insertError } = await supabase.from('materiais_informativos').insert(payloadLinkCompleto)

      if (insertError && erroColunasDestinoMaterial(insertError.message, insertError.code)) {
        ;({ error: insertError } = await supabase.from('materiais_informativos').insert(payloadLinkBase))
      }

      if (insertError) {
        console.error('[link-insert]', insertError)
        try {
          await adicionarLinkManifest(supabase, BUCKET_MATERIAIS, {
            titulo,
            descricao: descricaoMaterial.trim() || null,
            url,
            targetProfileIds: destinoMaterial.targetProfileIds,
          })
        } catch (manifestError) {
          const caminhoLinkStorage = anexarDestinosAoCaminho(
            criarCaminhoLinkStorage(url, CATEGORIA_LINK, titulo),
            destinoMaterial.targetProfileIds,
          )
          const arquivoLink = new Blob([url], { type: 'text/uri-list' })
          const { error: uploadLinkError } = await supabase.storage
            .from(BUCKET_MATERIAIS)
            .upload(caminhoLinkStorage, arquivoLink, {
              contentType: 'text/uri-list',
              upsert: false,
            })

          if (uploadLinkError) {
            console.error('[link-manifest]', manifestError)
            console.error('[link-storage]', uploadLinkError)
            setErroMaterial(`${mensagemErroMateriais(insertError.message, insertError.code)} Falha no armazenamento alternativo: ${uploadLinkError.message}`)
            setSalvandoMaterial(false)
            return
          }
        }
      }

      setTituloMaterial('')
      setDescricaoMaterial('')
      setCategoriaMaterial(CATEGORIAS_MATERIAIS[0])
      setLinkUrl('')
      resetarDestinoMaterial()
      setMensagemMaterial(`Link publicado para ${destinoMaterial.label}.`)
      setSalvandoMaterial(false)
      await carregarDados()
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
    const filePath = anexarDestinosAoCaminho(
      criarCaminhoMaterialStorage(arquivoMaterial, categoriaMaterial, titulo),
      destinoMaterial.targetProfileIds,
    )
    const substituirFolhaPonto = categoriaMaterial === CATEGORIA_FOLHA_PONTO_D1
    const materiaisFolhaPontoAnteriores = substituirFolhaPonto
      ? materiais.filter(material => isFolhaPontoD1(material))
      : []

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

    const payloadMaterialBase = {
      titulo,
      descricao: descricaoMaterial.trim() || null,
      categoria: categoriaMaterial,
      file_name: arquivoMaterial.name,
      file_path: filePath,
      file_type: arquivoMaterial.type || null,
      file_size: arquivoMaterial.size,
      ativo: true,
    }

    const payloadMaterialCompleto = {
      ...payloadMaterialBase,
      target_profile_ids: destinoMaterial.targetProfileIds ?? [],
    }

    let { error: insertError } = await supabase.from('materiais_informativos').insert(payloadMaterialCompleto)

    if (insertError && erroColunasDestinoMaterial(insertError.message, insertError.code)) {
      ;({ error: insertError } = await supabase.from('materiais_informativos').insert(payloadMaterialBase))
    }

    if (insertError) {
      if (destinoMaterial.targetProfileIds) {
        // Falha com profissionais específicas: remove apenas o arquivo novo (antigos preservados).
        await supabase.storage.from(BUCKET_MATERIAIS).remove([filePath])
        setErroMaterial(mensagemErroMateriais(insertError.message, insertError.code))
        setSalvandoMaterial(false)
        return
      }

      // Fallback de storage para todas as profissionais: remove antigos do storage antes de listar.
      if (substituirFolhaPonto && materiaisFolhaPontoAnteriores.length > 0) {
        await supabase.storage
          .from(BUCKET_MATERIAIS)
          .remove(materiaisFolhaPontoAnteriores.map(material => material.file_path))
      }
      const materiaisStorage = await listarMateriaisDoStorage(supabase, BUCKET_MATERIAIS)
      setMateriais(substituirFolhaPonto
        ? materiaisStorage.filter(material => !isFolhaPontoD1(material) || material.file_path === filePath)
        : materiaisStorage)
      setTituloMaterial('')
      setDescricaoMaterial('')
      setCategoriaMaterial(CATEGORIAS_MATERIAIS[0])
      setArquivoMaterial(null)
      resetarDestinoMaterial()
      setMensagemMaterial('Material anexado pelo armazenamento alternativo. A Folha D-1 será analisada por nome e liberada individualmente.')
      setErroMaterial('')
      setSalvandoMaterial(false)
      return
    }

    // Insert bem-sucedido: agora remove os materiais antigos de Folha de Ponto.
    if (materiaisFolhaPontoAnteriores.length > 0) {
      await supabase.storage
        .from(BUCKET_MATERIAIS)
        .remove(materiaisFolhaPontoAnteriores.map(material => material.file_path))

      await supabase
        .from('materiais_informativos')
        .delete()
        .in('id', materiaisFolhaPontoAnteriores.map(material => material.id))
    }

    setTituloMaterial('')
    setDescricaoMaterial('')
    setCategoriaMaterial(CATEGORIAS_MATERIAIS[0])
    setArquivoMaterial(null)
    resetarDestinoMaterial()
    setMensagemMaterial(`Material anexado e liberado para ${destinoMaterial.label}.`)
    setSalvandoMaterial(false)
    await carregarDados()
  }

  async function handleRemoverMaterial(material: MaterialInformativo) {
    if (!confirm(`Remover o material "${material.titulo}"?`)) return

    const supabase = createClient()
    if (isMaterialManifest(material)) {
      await removerLinkManifest(supabase, BUCKET_MATERIAIS, material.id)
    } else {
      await supabase.from('materiais_informativos').delete().eq('id', material.id)
      await supabase.storage.from(BUCKET_MATERIAIS).remove([material.file_path])
    }
    setMensagemMaterial('Material removido.')
    await carregarDados()
  }

  async function handleAbrirMaterial(material: MaterialInformativo) {
    if (isLinkMaterial(material)) {
      const url = urlDoMaterialLink(material)
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer')
      } else {
        setErroMaterial('Este material não possui URL configurada.')
      }
      return
    }

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

  function isLinkMaterial(material: MaterialInformativo) {
    return (material.categoria ?? '').toLowerCase() === 'links' || (material.categoria ?? '').toLowerCase() === 'link'
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
    const profileGestao = profileIdAtual
      ? ({ id: profileIdAtual, nome: nomeAtual, primeiro_nome: nomeAtual.split(' ')[0] || nomeAtual, role: perfilAdmin, ativo: true } as const)
      : null
    const folhaCiencia = isFolhaPontoD1(material) ? encontrarFolhaDoProfissional(folhasPontoD1, profileGestao) : null
    const tituloCiencia = folhaCiencia
      ? `${material.titulo} - ${folhaCiencia.nome} - página ${folhaCiencia.pagina}`
      : material.titulo
    const arquivoCiencia = folhaCiencia
      ? `${material.file_name} | página ${folhaCiencia.pagina}`
      : material.file_name

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
      material_titulo: tituloCiencia,
      material_arquivo: arquivoCiencia,
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

  async function salvarLiberacaoAutoavaliacao(liberado: boolean) {
    const periodo = periodoAutoavaliacao.trim()
    const dataInicio = dataInicioAutoavaliacao.trim()
    const dataFim = dataFimAutoavaliacao.trim()
    if (liberado && !periodo) {
      setStatusAutoavaliacaoAdmin('Informe o período da avaliação antes de liberar o formulário.')
      return
    }
    if (liberado && (!dataInicio || !dataFim)) {
      setStatusAutoavaliacaoAdmin('Informe a data inicial e a data final para liberar o formulário.')
      return
    }
    if (liberado && dataInicio > dataFim) {
      setStatusAutoavaliacaoAdmin('A data inicial não pode ser maior que a data final.')
      return
    }

    setSalvandoAutoavaliacaoAdmin(true)
    setStatusAutoavaliacaoAdmin('')

    try {
      await atualizarAutoavaliacaoConfigGoogleSheets({ liberado, periodo, data_inicio: dataInicio, data_fim: dataFim })
      const novaConfig = { liberado, periodo, data_inicio: dataInicio, data_fim: dataFim, liberado_em: new Date().toISOString() }
      setAutoavaliacaoConfig(novaConfig)
      setStatusAutoavaliacaoAdmin(liberado
        ? 'Formulário de autoavaliação liberado para as profissionais.'
        : 'Formulário de autoavaliação encerrado.')
    } catch {
      setStatusAutoavaliacaoAdmin('Não foi possível atualizar a liberação no Google Sheets. Verifique o Apps Script.')
    } finally {
      setSalvandoAutoavaliacaoAdmin(false)
    }
  }

  function trocarVideoYoutube(delta: number) {
    setYoutubeVideoIndex(atual => Math.min(Math.max(atual + delta, 0), YOUTUBE_PLAYLIST_LIMIT - 1))
  }

  const cfg = config ?? { meta_clinica: 55000, meta_gatilho: 15000, meta_max: 18000, meta_individual_anual: 187000 }

  function getRes(profileId: string) {
    return resultadoDoMes(resultados, profileId, mesNum, ANO_RESULTADOS)
  }

  const totalRealizado = profiles.reduce((s, p) => s + getRes(p.id).realizado, 0)
  const faltaClinica = Math.max(0, cfg.meta_clinica - totalRealizado)
  const ticketMedio = profiles.length > 0 ? totalRealizado / profiles.length : 0
  const metaClinicaBatida = totalRealizado >= cfg.meta_clinica

  const rankingMensal = calcularRankingMensal(profiles, resultados, cfg, mesNum, ANO_RESULTADOS)
  const rankingAnual = calcularRankingAnual(profiles, todosResultados, cfg.meta_individual_anual, ANO_RESULTADOS)

  const pctClinica = calcPctMeta(totalRealizado, cfg.meta_clinica)
  const totalComissoes = rankingMensal.reduce((s, p) => s + p.comissao_avaliacoes, 0)

  const totalBonus = rankingMensal.reduce((s, p) => s + p.bonus, 0)
  const totalVendasAvaliacao = rankingMensal.reduce((s, p) => s + p.vendas_avaliacoes, 0)
  const totalGeral = totalBonus + totalComissoes
  const notasFeedback = rankingMensal.map(p => p.nota_feedback ?? 0).filter(nota => nota > 0)
  const mediaFeedback = notasFeedback.length > 0 ? notasFeedback.reduce((s, nota) => s + nota, 0) / notasFeedback.length : 0
  const abaixoDoGatilho = rankingMensal.filter(p => p.realizado < cfg.meta_gatilho).length
  const pertoDaMeta = rankingMensal.filter(p => p.pctMeta >= 80 && p.pctMeta < 100).length
  const idsProfissionais = new Set(profiles.map(profile => profile.id))
  const idsProfissionaisAlvoMaterial = (material: MaterialInformativo) => (
    extrairDestinosDoCaminho(material.file_path).length > 0
      ? new Set(extrairDestinosDoCaminho(material.file_path).filter(id => idsProfissionais.has(id)))
      : Array.isArray(material.target_profile_ids) && material.target_profile_ids.length > 0
        ? new Set(material.target_profile_ids.filter(id => idsProfissionais.has(id)))
        : material.profile_id && idsProfissionais.has(material.profile_id)
          ? new Set([material.profile_id])
          : idsProfissionais
  )
  const materiaisObrigatorios = materiais.filter(material =>
    material.ativo
    && (isPdfMaterial(material) || isLinkMaterial(material))
    && exigeCienciaMaterial(material)
    && idsProfissionaisAlvoMaterial(material).size > 0,
  )
  const idsMateriaisObrigatorios = new Set(materiaisObrigatorios.map(material => material.id))
  const leiturasContagemSheets = resumoLeiturasGoogle?.leituras ?? []
  const contagemSheetsDisponivel = Boolean(resumoLeiturasGoogle)
  const assinaturasUnicas = new Set(
    leiturasContagemSheets
      .filter(leitura => {
        if (!idsMateriaisObrigatorios.has(leitura.material_id)) return false
        const material = materiaisObrigatorios.find(item => item.id === leitura.material_id)
        return Boolean(material && idsProfissionaisAlvoMaterial(material).has(leitura.profile_id))
      })
      .map(leitura => `${leitura.profile_id}:${leitura.material_id}`),
  )
  const totalLeituras = assinaturasUnicas.size
  const totalLeiturasPossiveis = materiaisObrigatorios.reduce((total, material) => total + idsProfissionaisAlvoMaterial(material).size, 0)
  const profissionaisComCienciaCompletaLista = profiles.filter(profile =>
    materiaisObrigatorios.some(material => idsProfissionaisAlvoMaterial(material).has(profile.id))
    && materiaisObrigatorios
      .filter(material => idsProfissionaisAlvoMaterial(material).has(profile.id))
      .every(material => assinaturasUnicas.has(`${profile.id}:${material.id}`)),
  )
  const profissionaisPendentesCienciaLista = profiles.filter(profile =>
    materiaisObrigatorios.some(material => idsProfissionaisAlvoMaterial(material).has(profile.id))
    && !materiaisObrigatorios
      .filter(material => idsProfissionaisAlvoMaterial(material).has(profile.id))
      .every(material => assinaturasUnicas.has(`${profile.id}:${material.id}`)),
  )
  const profissionaisComCienciaCompleta = profissionaisComCienciaCompletaLista.length
  const totalMensagensRecebidas = mensagensRecebidas.length
  const ultimaMensagemRecebida = mensagensRecebidas[0]
  const autoavaliacaoPeriodoAtual = autoavaliacaoConfig.periodo || periodoAutoavaliacao
  const respostasAutoavaliacaoPeriodo = autoavaliacaoRespostas.filter(resposta =>
    !autoavaliacaoPeriodoAtual || resposta.periodo === autoavaliacaoPeriodoAtual,
  )
  const respostasAutoavaliacaoPorProfile = new Map(respostasAutoavaliacaoPeriodo.map(resposta => [resposta.profile_id, resposta]))
  const profissionaisComAutoavaliacao = profiles.filter(profile => respostasAutoavaliacaoPorProfile.has(profile.id))
  const profissionalAutoavaliacaoSelecionado = profiles.find(profile => profile.id === autoavaliacaoProfileId) ?? profiles[0] ?? null
  const respostaAutoavaliacaoSelecionada = profissionalAutoavaliacaoSelecionado
    ? respostasAutoavaliacaoPorProfile.get(profissionalAutoavaliacaoSelecionado.id)
    : undefined
  const perguntasPorGrupoAutoavaliacao = AUTOAVALIACAO_PERGUNTAS.reduce<Record<string, typeof AUTOAVALIACAO_PERGUNTAS>>((acc, pergunta) => {
    acc[pergunta.grupo] = [...(acc[pergunta.grupo] ?? []), pergunta]
    return acc
  }, {})
  const folhasDoMesSelecionado = folhasPontoD1.filter(folha => {
    if (!folha.periodo) return true
    const matchMes = folha.periodo.match(/\d{2}\/(\d{2})\/\d{4}/)
    const mesFolha = matchMes ? Number(matchMes[1]) : null
    return mesFolha === null || mesFolha === mesNum
  })
  const folhasPontoPorProfissional = profiles.map(profile => ({
    profile,
    folha: encontrarFolhaDoProfissional(folhasDoMesSelecionado, profile),
  }))
  const folhasPontoIdentificadas = folhasPontoPorProfissional.filter(item => item.folha).length
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
  const youtubeEmbedUrl = `https://www.youtube-nocookie.com/embed/videoseries?list=${YOUTUBE_UPLOADS_PLAYLIST_ID}&index=${youtubeVideoIndex}&autoplay=1&mute=${youtubeMuted ? '1' : '0'}&playsinline=1&rel=0&controls=1`

  function categoriaDoMaterial(material: MaterialInformativo) {
    return material.categoria || 'Comunicados'
  }

  function totalLeiturasMaterial(material: MaterialInformativo) {
    const idsAlvo = idsProfissionaisAlvoMaterial(material)
    return new Set(
      leiturasContagemSheets
        .filter(leitura => leitura.material_id === material.id && idsAlvo.has(leitura.profile_id))
        .map(leitura => leitura.profile_id),
    ).size
  }

  function profissionaisAlvoMaterial(material: MaterialInformativo) {
    const idsAlvo = idsProfissionaisAlvoMaterial(material)
    return profiles.filter(profile => idsAlvo.has(profile.id))
  }

  function labelDestinoMaterial(material: MaterialInformativo) {
    const alvos = profissionaisAlvoMaterial(material)
    const temSelecaoExplicita = Boolean(
      extrairDestinosDoCaminho(material.file_path).length > 0
      || (Array.isArray(material.target_profile_ids) && material.target_profile_ids.length > 0)
      || material.profile_id,
    )
    if (!temSelecaoExplicita) return 'Todas'
    if (alvos.length === 0) return 'Sem alvo'
    if (alvos.length === 1) return alvos[0].primeiro_nome
    if (alvos.length <= 3) return alvos.map(profile => profile.primeiro_nome).join(', ')
    return `${alvos.length} profissionais`
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
                { label: 'Folha D-1 analisada', valor: erroFolhaPontoD1 ? 'Verificar' : `${folhasPontoIdentificadas}/${profiles.length}`, apoio: erroFolhaPontoD1 || 'consulta individual, sem ciência', cor: erroFolhaPontoD1 ? '#facc15' : folhasPontoIdentificadas === profiles.length && profiles.length > 0 ? '#4ade80' : '#38bdf8' },
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

                <div id="painel-mensagem-admin" className="glass-sm message-panel" style={{ padding: 24, marginTop: 24, marginBottom: 24 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 14 }}>
                    <div>
                      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Mensagem para o Admin</h3>
                      <p style={{ fontSize: 12, color: 'rgba(240,230,255,0.45)' }}>
                        Compartilhe uma observação, dúvida ou alinhamento com a administração. Sua mensagem ficará registrada para acompanhamento.
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
                          const dispensaCiencia = !exigeCienciaMaterial(material)
                          return (
                          <div key={material.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: 14, borderRadius: 12, background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
                            <div style={{ minWidth: 220, flex: '1 1 260px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <div style={{ fontSize: 14, fontWeight: 700, color: '#f0e6ff' }}>{material.titulo}</div>
                                {dispensaCiencia ? <span className="material-read-badge">Consulta</span> : lidoEm && <span className="material-read-badge">Ciente</span>}
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
              {([['mensal','📅 Ranking Mensal'],['anual','🏆 Ranking Anual'],['bonus','💰 Bônus e Comissões'],['materiais','📎 Materiais'],['autoavaliacao','📝 Autoavaliação']] as const).map(([t, label]) => (
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
                      {rankingMensal.map((p, i) => {
                        const ehCnpj = p.contrato === 'cnpj'
                        return (
                        <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: 16, fontSize: 20 }}>{getMedalEmoji(p.pos)}</td>
                          <td style={{ padding: 16, fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap' }}>
                            {p.nome}
                            {ehCnpj && <span style={{ marginLeft: 6, fontSize: 10, padding: '2px 6px', borderRadius: 6, background: 'rgba(56,189,248,0.16)', color: '#7dd3fc' }}>CNPJ</span>}
                          </td>
                          <td style={{ padding: 16, fontSize: 14, fontWeight: 700, color: '#f472b6', whiteSpace: 'nowrap' }}>
                            {formatBRL(p.realizado)}
                            {profissionaisComReferencia.has(p.id) && <span style={{ marginLeft: 6, fontSize: 10, color: '#facc15' }}>≈2025</span>}
                          </td>
                          {ehCnpj ? (
                            <>
                              <td style={{ padding: 16, fontSize: 14, color: 'rgba(240,230,255,0.35)' }}>—</td>
                              <td style={{ padding: 16, fontSize: 14, color: 'rgba(240,230,255,0.35)' }}>—</td>
                              <td style={{ padding: 16, fontSize: 12, color: 'rgba(240,230,255,0.35)' }}>Sem meta (CNPJ)</td>
                              <td style={{ padding: 16, fontSize: 14, fontWeight: 600, color: '#7dd3fc', whiteSpace: 'nowrap' }}>{formatBRL(p.realizado * PERCENTUAL_RECEBER_CNPJ)} <span style={{ fontSize: 10, color: 'rgba(240,230,255,0.4)' }}>(30% a receber)</span></td>
                              <td style={{ padding: 16, minWidth: 120, color: 'rgba(240,230,255,0.3)', fontSize: 12 }}>—</td>
                            </>
                          ) : (
                            <>
                              <td style={{ padding: 16, fontSize: 14, color: p.pctGatilho >= 100 ? '#4ade80' : '#f87171' }}>{p.pctGatilho}%</td>
                              <td style={{ padding: 16, fontSize: 14, color: p.pctMeta >= 100 ? '#4ade80' : '#f87171' }}>{p.pctMeta}%</td>
                              <td style={{ padding: 16 }}><span className={getStatusClass(p.status)}>{p.status}</span></td>
                              <td style={{ padding: 16, fontSize: 14, fontWeight: 600, color: '#c084fc', whiteSpace: 'nowrap' }}>{formatBRL(p.bonus)}</td>
                              <td style={{ padding: 16, minWidth: 120 }}>
                                <div className="progress-track"><div className={getProgressColor(p.pctMeta)} style={{ width: `${Math.min(p.pctMeta, 100)}%` }} /></div>
                              </td>
                            </>
                          )}
                        </tr>
                        )
                      })}
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
                        {rankingMensal.map((p, i) => {
                          const ehCnpj = p.contrato === 'cnpj'
                          const aReceberCnpj = p.realizado * PERCENTUAL_RECEBER_CNPJ
                          return (
                          <tr key={i} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                            <td style={{ padding: 16, fontSize: 20 }}>{getMedalEmoji(p.pos)}</td>
                            <td style={{ padding: 16, fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap' }}>
                              {p.nome}
                              {ehCnpj && <span style={{ marginLeft: 6, fontSize: 10, padding: '2px 6px', borderRadius: 6, background: 'rgba(56,189,248,0.16)', color: '#7dd3fc' }}>CNPJ</span>}
                            </td>
                            <td style={{ padding: 16, fontSize: 14, fontWeight: 600, color: '#f472b6', whiteSpace: 'nowrap' }}>{formatBRL(p.realizado)}</td>
                            {ehCnpj ? (
                              <>
                                <td style={{ padding: 16, fontSize: 14, color: 'rgba(240,230,255,0.35)' }}>—</td>
                                <td style={{ padding: 16, fontSize: 14, color: 'rgba(240,230,255,0.35)' }}>—</td>
                                <td style={{ padding: 16, fontSize: 14, color: 'rgba(240,230,255,0.35)' }}>—</td>
                                <td style={{ padding: 16, whiteSpace: 'nowrap' }}>
                                  <span style={{ fontSize: 16, fontWeight: 800, color: '#4ade80' }}>{formatBRL(aReceberCnpj)}</span>
                                  <span style={{ marginLeft: 6, fontSize: 10, color: 'rgba(240,230,255,0.4)' }}>(30% CNPJ)</span>
                                </td>
                              </>
                            ) : (
                              <>
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
                              </>
                            )}
                          </tr>
                          )
                        })}
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
                    <form onSubmit={handleUploadMaterial} style={{ display: 'grid', gap: 12 }}>
                      <div className="responsive-grid" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 0.9fr 1fr', gap: 12 }}>
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
                          <select className="input-field" value={categoriaMaterial} onChange={e => { setCategoriaMaterial(e.target.value); setArquivoMaterial(null); setLinkUrl('') }}>
                            {CATEGORIAS_MATERIAIS.map(categoria => (
                              <option key={categoria} value={categoria} style={{ background: '#1a0a2e' }}>{categoria}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, color: 'rgba(240,230,255,0.5)', marginBottom: 6 }}>Para profissionais</label>
                          <div style={{ display: 'grid', gap: 6, maxHeight: 136, overflowY: 'auto', padding: 10, borderRadius: 12, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.035)' }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#f0e6ff', cursor: 'pointer' }}>
                              <input
                                type="checkbox"
                                checked={materialParaTodas}
                                onChange={selecionarTodasMateriais}
                              />
                              Todas as profissionais
                            </label>
                            {profiles.map(prof => (
                              <label key={prof.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: materialParaTodas ? 'rgba(240,230,255,0.35)' : 'rgba(240,230,255,0.75)', cursor: 'pointer' }}>
                                <input
                                  type="checkbox"
                                  checked={!materialParaTodas && profileIdsMaterial.includes(prof.id)}
                                  onChange={() => toggleProfileMaterial(prof.id)}
                                />
                                {prof.primeiro_nome}
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'end' }}>
                        {categoriaMaterial === CATEGORIA_LINK ? (
                          <div>
                            <label style={{ display: 'block', fontSize: 12, color: 'rgba(240,230,255,0.5)', marginBottom: 6 }}>URL do link</label>
                            <input
                              type="url"
                              className="input-field"
                              value={linkUrl}
                              onChange={e => setLinkUrl(e.target.value)}
                              placeholder="https://..."
                            />
                          </div>
                        ) : (
                          <div>
                            <label style={{ display: 'block', fontSize: 12, color: 'rgba(240,230,255,0.5)', marginBottom: 6 }}>Arquivo</label>
                            <input
                              type="file"
                              className="input-field"
                              onChange={e => setArquivoMaterial(e.target.files?.[0] ?? null)}
                              accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.webp,.txt,.csv,.mp4,.mov,.zip"
                            />
                          </div>
                        )}
                        <button type="submit" className="btn-primary" disabled={salvandoMaterial} style={{ minWidth: 150 }}>
                          {salvandoMaterial ? 'Enviando...' : categoriaMaterial === CATEGORIA_LINK ? 'Publicar link' : 'Anexar'}
                        </button>
                      </div>
                    </form>

                    {erroMaterial && (
                      <div style={{ marginTop: 14, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#f87171' }}>
                        {erroMaterial}
                        {mostrarSqlMigracao && (
                          <div style={{ marginTop: 12 }}>
                            <pre style={{ background: 'rgba(0,0,0,0.35)', borderRadius: 8, padding: '10px 12px', fontSize: 11, color: '#e2e8f0', whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginBottom: 8 }}>
                              {SQL_MIGRACAO_LINKS}
                            </pre>
                            <button
                              type="button"
                              onClick={() => { navigator.clipboard.writeText(SQL_MIGRACAO_LINKS).catch(() => {}) }}
                              style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 6, padding: '5px 12px', fontSize: 12, color: '#fca5a5', cursor: 'pointer' }}
                            >
                              Copiar SQL
                            </button>
                            <span style={{ marginLeft: 10, fontSize: 11, color: 'rgba(240,230,255,0.5)' }}>
                              Cole e execute no Supabase → SQL Editor → New query
                            </span>
                          </div>
                        )}
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

                {(folhasDoMesSelecionado.length > 0 || erroFolhaPontoD1) && (
                  <div style={{ padding: 24, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Folha de Ponto D-1 por profissional</h3>
                    <p style={{ fontSize: 12, color: 'rgba(240,230,255,0.45)', marginBottom: 14 }}>
                      Horas calculadas pelo documento anexado e comparadas com a escala prevista.
                    </p>
                    {erroFolhaPontoD1 ? (
                      <div style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.16)', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#facc15' }}>
                        {erroFolhaPontoD1}
                      </div>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                              {['Profissional','Periodo','Batidas','Escala','Com abono','Saldo','Faltas','Atenção','Pagina'].map(h => (
                                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontSize: 12, color: 'rgba(240,230,255,0.4)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {folhasPontoPorProfissional.map(({ profile, folha }) => (
                              <tr key={profile.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                                <td style={{ padding: '12px', fontSize: 13, color: '#f0e6ff', fontWeight: 700 }}>{profile.nome}</td>
                                <td style={{ padding: '12px', fontSize: 13, color: 'rgba(240,230,255,0.65)', whiteSpace: 'nowrap' }}>{folha?.periodo ?? 'Nao localizada'}</td>
                                <td style={{ padding: '12px', fontSize: 13, color: '#38bdf8', fontWeight: 700 }}>{folha?.horas_batidas ?? '-'}</td>
                                <td style={{ padding: '12px', fontSize: 13, color: 'rgba(240,230,255,0.65)' }}>{folha?.horas_previstas ?? '-'}</td>
                                <td style={{ padding: '12px', fontSize: 13, color: '#c084fc', fontWeight: 700 }}>{folha?.horas_com_abono ?? '-'}</td>
                                <td style={{ padding: '12px', fontSize: 13, color: (folha?.saldo_minutos ?? 0) >= 0 ? '#4ade80' : '#f87171', fontWeight: 800 }}>{folha?.saldo_periodo ?? '-'}</td>
                                <td style={{ padding: '12px', fontSize: 13, color: 'rgba(240,230,255,0.65)' }}>{folha?.faltas_horas ?? '-'}</td>
                                <td style={{ padding: '12px', fontSize: 13, whiteSpace: 'nowrap' }}>
                                  {folha?.marcacao_impar ? (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#fecaca', fontWeight: 900 }}>
                                      <span style={{ width: 22, height: 22, borderRadius: 999, background: '#ef4444', color: '#fff', display: 'inline-grid', placeItems: 'center' }}>!</span>
                                      Marcação ímpar ({folha.dias_marcacao_impar.join(', ')})
                                    </span>
                                  ) : '-'}
                                </td>
                                <td style={{ padding: '12px', fontSize: 13, color: 'rgba(240,230,255,0.65)' }}>{folha ? `${folha.material_titulo} - pag. ${folha.pagina}` : '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                        {['Material','Categoria','Para','Arquivo / URL','Tamanho','Ciência','Status','Ações'].map(h => (
                          <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, color: 'rgba(240,230,255,0.4)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {materiais.map(material => {
                        const destinoLabel = labelDestinoMaterial(material)
                        const denominador = idsProfissionaisAlvoMaterial(material).size
                        const linkMaterial = urlDoMaterialLink(material)
                        return (
                        <tr key={material.id} style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: 16, minWidth: 220 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#f0e6ff' }}>{material.titulo}</div>
                            {material.descricao && <div style={{ fontSize: 12, color: 'rgba(240,230,255,0.45)', marginTop: 4 }}>{material.descricao}</div>}
                          </td>
                          <td style={{ padding: 16 }}><span className="material-category-badge">{categoriaDoMaterial(material)}</span></td>
                          <td style={{ padding: 16, fontSize: 13, whiteSpace: 'nowrap' }}>
                            {destinoLabel === 'Todas' ? (
                              <span style={{ color: 'rgba(240,230,255,0.45)' }}>Todas</span>
                            ) : (
                              <span style={{ color: '#f472b6', fontWeight: 700 }}>{destinoLabel}</span>
                            )}
                          </td>
                          <td style={{ padding: 16, fontSize: 13, color: 'rgba(240,230,255,0.65)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {isLinkMaterial(material) ? (
                              <a href={linkMaterial || '#'} target="_blank" rel="noreferrer" style={{ color: '#7dd3fc', textDecoration: 'underline' }}>
                                {linkMaterial || 'Link nao configurado'}
                              </a>
                            ) : material.file_name}
                          </td>
                          <td style={{ padding: 16, fontSize: 13, color: 'rgba(240,230,255,0.5)', whiteSpace: 'nowrap' }}>
                            {isLinkMaterial(material) ? '—' : formatFileSize(material.file_size)}
                          </td>
                          <td style={{ padding: 16, fontSize: 13, color: 'rgba(240,230,255,0.65)', whiteSpace: 'nowrap' }}>
                            {exigeCienciaMaterial(material) ? `${totalLeiturasMaterial(material)}/${denominador} cientes` : 'Não exige'}
                          </td>
                          <td style={{ padding: 16 }}><span className={material.ativo ? 'badge-acima' : 'badge-abaixo'}>{material.ativo ? 'Visível' : 'Oculto'}</span></td>
                          <td style={{ padding: 16, whiteSpace: 'nowrap' }}>
                            <button type="button" onClick={() => handleAbrirMaterial(material)} style={{ background: 'rgba(56,189,248,0.12)', border: '1px solid rgba(56,189,248,0.24)', color: '#7dd3fc', borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', marginRight: 8 }}>
                              {isLinkMaterial(material) ? 'Abrir link' : 'Abrir'}
                            </button>
                            {podeEditar && (
                              <button type="button" onClick={() => handleRemoverMaterial(material)} style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.22)', color: '#f87171', borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                                Excluir
                              </button>
                            )}
                          </td>
                        </tr>
                        )
                      })}
                      {materiais.length === 0 && (
                        <tr>
                          <td colSpan={8} style={{ padding: 40, textAlign: 'center', color: 'rgba(240,230,255,0.35)', fontSize: 14 }}>
                            Nenhum material anexado ainda.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {aba === 'autoavaliacao' && (
              <div className="glass-sm" style={{ padding: 0, overflow: 'hidden', marginBottom: 20 }}>
                <div style={{ padding: '18px 24px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <h2 style={{ fontSize: 16, fontWeight: 700 }}>📝 Autoavaliação de Desempenho</h2>
                  <p style={{ fontSize: 12, color: 'rgba(240,230,255,0.4)', marginTop: 4 }}>
                    Libere o formulário digital no período de avaliação e acompanhe as respostas por profissional.
                  </p>
                </div>

                <div style={{ padding: 24, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="responsive-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 180px 180px', gap: 12, alignItems: 'end' }}>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={{ fontSize: 12, color: 'rgba(240,230,255,0.55)' }}>Período da avaliação</span>
                      <input
                        className="input-field"
                        value={periodoAutoavaliacao}
                        onChange={event => setPeriodoAutoavaliacao(event.target.value)}
                        placeholder="Ex.: Maio/2026"
                        disabled={!podeEditar}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={{ fontSize: 12, color: 'rgba(240,230,255,0.55)' }}>Data inicial</span>
                      <input
                        type="date"
                        className="input-field"
                        value={dataInicioAutoavaliacao}
                        onChange={event => setDataInicioAutoavaliacao(event.target.value)}
                        disabled={!podeEditar}
                      />
                    </label>
                    <label style={{ display: 'grid', gap: 6 }}>
                      <span style={{ fontSize: 12, color: 'rgba(240,230,255,0.55)' }}>Data final</span>
                      <input
                        type="date"
                        className="input-field"
                        value={dataFimAutoavaliacao}
                        onChange={event => setDataFimAutoavaliacao(event.target.value)}
                        disabled={!podeEditar}
                      />
                    </label>
                  </div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
                    <button type="button" className="btn-primary" onClick={() => salvarLiberacaoAutoavaliacao(true)} disabled={!podeEditar || salvandoAutoavaliacaoAdmin}>
                      Liberar formulário
                    </button>
                    <button
                      type="button"
                      onClick={() => salvarLiberacaoAutoavaliacao(false)}
                      disabled={!podeEditar || salvandoAutoavaliacaoAdmin}
                      style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.22)', color: '#fca5a5', borderRadius: 10, padding: '12px 16px', fontSize: 13, fontWeight: 800, cursor: podeEditar ? 'pointer' : 'not-allowed' }}
                    >
                      Encerrar
                    </button>
                  </div>

                  <div className="responsive-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginTop: 16 }}>
                    {[
                      { label: 'Status', valor: autoavaliacaoConfig.liberado ? 'Liberado' : 'Encerrado', cor: autoavaliacaoConfig.liberado ? '#4ade80' : '#facc15' },
                      { label: 'Período ativo', valor: autoavaliacaoConfig.periodo || 'Não definido', cor: '#c084fc' },
                      { label: 'Janela de liberação', valor: autoavaliacaoConfig.data_inicio && autoavaliacaoConfig.data_fim ? `${formatarDataAutoavaliacao(autoavaliacaoConfig.data_inicio)} a ${formatarDataAutoavaliacao(autoavaliacaoConfig.data_fim)}` : 'Sem datas', cor: '#f472b6' },
                      { label: 'Respostas recebidas', valor: `${profissionaisComAutoavaliacao.length}/${profiles.length}`, cor: '#38bdf8' },
                    ].map(item => (
                      <div key={item.label} style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 14, background: 'rgba(255,255,255,0.03)' }}>
                        <div style={{ fontSize: 11, color: 'rgba(240,230,255,0.45)', marginBottom: 4 }}>{item.label}</div>
                        <div style={{ fontSize: 20, fontWeight: 900, color: item.cor }}>{item.valor}</div>
                      </div>
                    ))}
                  </div>

                  {statusAutoavaliacaoAdmin && (
                    <div className="message-panel-status" style={{ marginTop: 14 }}>
                      {statusAutoavaliacaoAdmin}
                    </div>
                  )}
                  {!podeEditar && (
                    <div style={{ marginTop: 14, fontSize: 13, color: 'rgba(240,230,255,0.5)' }}>
                      Perfil Gestão: visualização liberada sem permissão para liberar ou encerrar avaliações.
                    </div>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 0 }} className="admin-autoavaliacao-layout">
                  <div style={{ padding: 18, borderRight: '1px solid rgba(255,255,255,0.06)', display: 'grid', gap: 8, alignContent: 'start' }}>
                    {profiles.map(profile => {
                      const respondida = respostasAutoavaliacaoPorProfile.has(profile.id)
                      return (
                        <button
                          key={profile.id}
                          type="button"
                          onClick={() => setAutoavaliacaoProfileId(profile.id)}
                          style={{
                            textAlign: 'left',
                            border: '1px solid rgba(255,255,255,0.06)',
                            borderRadius: 10,
                            padding: 12,
                            background: profissionalAutoavaliacaoSelecionado?.id === profile.id ? 'rgba(244,114,182,0.14)' : 'rgba(255,255,255,0.03)',
                            color: '#f0e6ff',
                            cursor: 'pointer',
                          }}
                        >
                          <div style={{ fontSize: 13, fontWeight: 800 }}>{profile.nome}</div>
                          <div style={{ fontSize: 11, color: respondida ? '#86efac' : 'rgba(240,230,255,0.42)', marginTop: 4 }}>
                            {respondida ? 'Respondida' : 'Pendente'}
                          </div>
                        </button>
                      )
                    })}
                  </div>

                  <div style={{ padding: 24 }}>
                    {!profissionalAutoavaliacaoSelecionado ? (
                      <div style={{ color: 'rgba(240,230,255,0.4)', fontSize: 14 }}>Nenhuma profissional cadastrada.</div>
                    ) : !respostaAutoavaliacaoSelecionada ? (
                      <div style={{ color: 'rgba(240,230,255,0.5)', fontSize: 14 }}>
                        {profissionalAutoavaliacaoSelecionado.nome} ainda não enviou a autoavaliação para {autoavaliacaoPeriodoAtual || 'o período selecionado'}.
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gap: 18 }}>
                        <div className="responsive-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                          {[
                            ['Profissional', respostaAutoavaliacaoSelecionada.nome],
                            ['Período', respostaAutoavaliacaoSelecionada.periodo],
                            ['Média critérios', `${respostaAutoavaliacaoSelecionada.media.toFixed(1)}/10`],
                            ['Nota geral', `${respostaAutoavaliacaoSelecionada.desempenho_geral}/10`],
                          ].map(([label, valor]) => (
                            <div key={label} style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 14, background: 'rgba(255,255,255,0.03)' }}>
                              <div style={{ fontSize: 11, color: 'rgba(240,230,255,0.45)', marginBottom: 4 }}>{label}</div>
                              <div style={{ fontSize: 15, fontWeight: 900, color: '#f0e6ff' }}>{valor}</div>
                            </div>
                          ))}
                        </div>

                        {Object.entries(perguntasPorGrupoAutoavaliacao).map(([grupo, perguntas]) => (
                          <section key={grupo} style={{ display: 'grid', gap: 8 }}>
                            <div className="material-category-title">{grupo}</div>
                            {perguntas.map(pergunta => (
                              <div key={pergunta.id} style={{ display: 'grid', gridTemplateColumns: '1fr 70px', gap: 12, padding: 10, borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                                <div style={{ fontSize: 13, color: 'rgba(240,230,255,0.82)' }}>{pergunta.texto}</div>
                                <div style={{ fontSize: 13, fontWeight: 900, color: '#f472b6', textAlign: 'right' }}>{respostaAutoavaliacaoSelecionada.notas[pergunta.id] ?? '-'}/10</div>
                              </div>
                            ))}
                          </section>
                        ))}

                        <section style={{ display: 'grid', gap: 10 }}>
                          <div className="material-category-title">Respostas abertas</div>
                          {AUTOAVALIACAO_CAMPOS_TEXTO.map(campo => (
                            <div key={campo.id} style={{ border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, padding: 14, background: 'rgba(255,255,255,0.03)' }}>
                              <div style={{ fontSize: 12, color: '#c084fc', fontWeight: 800, marginBottom: 6 }}>{campo.label}</div>
                              <div style={{ fontSize: 13, color: 'rgba(240,230,255,0.75)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                                {respostaAutoavaliacaoSelecionada.textos[campo.id] || 'Sem resposta.'}
                              </div>
                            </div>
                          ))}
                        </section>
                      </div>
                    )}
                  </div>
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
