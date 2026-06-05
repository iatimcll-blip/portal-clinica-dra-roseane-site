import type { SupabaseClient } from '@supabase/supabase-js'
import type { MaterialInformativo } from '@/lib/types'

const PREFIXO_MATERIAL_STORAGE = 'material'
const PREFIXO_LINK_STORAGE = 'link'
const PREFIXO_DESTINOS_MATERIAL = 'targets__'

const CATEGORIAS_CONHECIDAS: Record<string, string> = {
  comunicados: 'Comunicados',
  treinamentos: 'Treinamentos',
  metas: 'Metas',
  protocolos: 'Protocolos',
  'folha-de-ponto-d-1': 'Folha de Ponto D-1',
  links: 'Links',
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

function codificarUrl(valor: string) {
  return btoa(valor).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function decodificarUrl(valor: string) {
  try {
    const normalizado = valor.replace(/-/g, '+').replace(/_/g, '/')
    const padding = '='.repeat((4 - (normalizado.length % 4)) % 4)
    return atob(normalizado + padding)
  } catch {
    return ''
  }
}

function extrairDestinosDoCaminho(filePath: string) {
  if (!filePath.startsWith(PREFIXO_DESTINOS_MATERIAL)) {
    return { destinos: [] as string[], caminho: filePath }
  }

  const fim = filePath.indexOf('__', PREFIXO_DESTINOS_MATERIAL.length)
  if (fim < 0) {
    return { destinos: [] as string[], caminho: filePath }
  }

  return {
    destinos: filePath
      .slice(PREFIXO_DESTINOS_MATERIAL.length, fim)
      .split(',')
      .map(id => id.trim())
      .filter(Boolean),
    caminho: filePath.slice(fim + 2),
  }
}

function pareceFolhaPonto(...valores: string[]) {
  const texto = valores
    .join(' ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()

  return (texto.includes('FOLHA') && texto.includes('PONTO'))
    || (texto.includes('ESPELHO') && texto.includes('PONTO'))
}

function materialDeArquivoStorage(arquivo: StorageFile): MaterialInformativo {
  const { destinos, caminho } = extrairDestinosDoCaminho(arquivo.name)
  const partes = caminho.split('__')
  const temMetadados = partes[0] === PREFIXO_MATERIAL_STORAGE && partes.length >= 5
  const temLink = partes[0] === PREFIXO_LINK_STORAGE && partes.length >= 5
  const categoriaSlug = temMetadados ? partes[3] : ''
  const tituloSlug = temMetadados || temLink ? partes[4] : ''
  const nomeOriginal = temLink ? decodificarUrl(partes.slice(5).join('__')) : temMetadados ? partes.slice(5).join('__') : arquivo.name
  const criadoEm = arquivo.created_at ?? arquivo.updated_at ?? new Date(idDoArquivo(arquivo.name)).toISOString()
  const titulo = temMetadados ? tituloDeSlug(tituloSlug) : nomeOriginal
  const categoria = temLink ? 'Links' : pareceFolhaPonto(categoriaSlug, tituloSlug, nomeOriginal, arquivo.name)
    ? 'Folha de Ponto D-1'
    : CATEGORIAS_CONHECIDAS[categoriaSlug] ?? 'Comunicados'

  return {
    id: idDoArquivo(arquivo.name),
    titulo: temLink ? tituloDeSlug(tituloSlug) : titulo,
    descricao: null,
    categoria,
    file_name: nomeOriginal,
    file_path: arquivo.name,
    file_type: temLink ? 'text/uri-list' : arquivo.metadata?.mimetype ?? null,
    file_size: arquivo.metadata?.size ?? null,
    ativo: true,
    created_at: criadoEm,
    target_profile_ids: destinos.length > 0 ? destinos : null,
    link_url: temLink ? nomeOriginal : null,
  }
}

export function criarCaminhoMaterialStorage(arquivo: File, categoria: string, titulo: string) {
  const categoriaSlug = slugify(categoria)
  const tituloSlug = slugify(titulo || arquivo.name)
  return `${PREFIXO_MATERIAL_STORAGE}__${Date.now()}__${crypto.randomUUID()}__${categoriaSlug}__${tituloSlug}__${nomeSeguro(arquivo.name)}`
}

export function criarCaminhoLinkStorage(url: string, categoria: string, titulo: string) {
  const categoriaSlug = slugify(categoria)
  const tituloSlug = slugify(titulo || 'link-informativo')
  return `${PREFIXO_LINK_STORAGE}__${Date.now()}__${crypto.randomUUID()}__${categoriaSlug}__${tituloSlug}__${codificarUrl(url)}`
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
