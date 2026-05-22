import type { SupabaseClient } from '@supabase/supabase-js'
import type { MaterialInformativo } from '@/lib/types'

const PREFIXO_MATERIAL_STORAGE = 'material'

const CATEGORIAS_CONHECIDAS: Record<string, string> = {
  comunicados: 'Comunicados',
  treinamentos: 'Treinamentos',
  metas: 'Metas',
  protocolos: 'Protocolos',
  'folha-de-ponto-d-1': 'Folha de Ponto D-1',
}

type StorageFile = {
  name: string
  created_at?: string | null
  updated_at?: string | null
  last_accessed_at?: string | null
  metadata?: {
    mimetype?: string
    size?: number
  } | null
}

function slugify(valor: string) {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'material'
}

function nomeSeguro(valor: string) {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
}

function idDoArquivo(nome: string) {
  const timestamp = Number(nome.match(/(?:^|__)(1\d{12})(?:__|-)/)?.[1])
  if (Number.isFinite(timestamp) && timestamp > 0) return timestamp

  let hash = 0
  for (let i = 0; i < nome.length; i += 1) {
    hash = ((hash * 31) + nome.charCodeAt(i)) >>> 0
  }
  return hash
}

function tituloDeSlug(slug: string) {
  if (!slug) return 'Material informativo'
  return slug
    .split('-')
    .filter(Boolean)
    .map(parte => parte.charAt(0).toUpperCase() + parte.slice(1))
    .join(' ')
}

function pareceFolhaPonto(...valores: string[]) {
  const texto = valores
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()

  return texto.includes('FOLHA') && texto.includes('PONTO')
}

function materialDeArquivoStorage(arquivo: StorageFile): MaterialInformativo {
  const partes = arquivo.name.split('__')
  const temMetadados = partes[0] === PREFIXO_MATERIAL_STORAGE && partes.length >= 5
  const categoriaSlug = temMetadados ? partes[3] : ''
  const tituloSlug = temMetadados ? partes[4] : ''
  const nomeOriginal = temMetadados ? partes.slice(5).join('__') : arquivo.name
  const criadoEm = arquivo.created_at ?? arquivo.updated_at ?? new Date(idDoArquivo(arquivo.name)).toISOString()
  const titulo = temMetadados ? tituloDeSlug(tituloSlug) : nomeOriginal
  const categoria = pareceFolhaPonto(categoriaSlug, tituloSlug, nomeOriginal, arquivo.name)
    ? 'Folha de Ponto D-1'
    : CATEGORIAS_CONHECIDAS[categoriaSlug] ?? 'Comunicados'

  return {
    id: idDoArquivo(arquivo.name),
    titulo,
    descricao: null,
    categoria,
    file_name: nomeOriginal,
    file_path: arquivo.name,
    file_type: arquivo.metadata?.mimetype ?? null,
    file_size: arquivo.metadata?.size ?? null,
    ativo: true,
    created_at: criadoEm,
  }
}

export function criarCaminhoMaterialStorage(arquivo: File, categoria: string, titulo: string) {
  const categoriaSlug = slugify(categoria)
  const tituloSlug = slugify(titulo || arquivo.name)
  return `${PREFIXO_MATERIAL_STORAGE}__${Date.now()}__${crypto.randomUUID()}__${categoriaSlug}__${tituloSlug}__${nomeSeguro(arquivo.name)}`
}

export async function listarMateriaisDoStorage(supabase: SupabaseClient, bucket: string) {
  const { data, error } = await supabase.storage.from(bucket).list('', {
    limit: 200,
    offset: 0,
    sortBy: { column: 'created_at', order: 'desc' },
  })

  if (error) throw error

  return ((data ?? []) as StorageFile[])
    .filter(arquivo => arquivo.name && !arquivo.name.endsWith('/'))
    .map(materialDeArquivoStorage)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
}
