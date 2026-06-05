import type { SupabaseClient } from '@supabase/supabase-js'
import type { MaterialInformativo } from './types'

const MANIFEST_PATH = 'links-manifest.json'

type LinkEntry = {
  id: number
  titulo: string
  descricao: string | null
  url: string
  target_profile_ids: string[]
  created_at: string
}

async function lerManifest(supabase: SupabaseClient, bucket: string): Promise<LinkEntry[]> {
  try {
    const { data, error } = await supabase.storage.from(bucket).download(MANIFEST_PATH)
    if (error || !data) return []
    const text = await data.text()
    const parsed = JSON.parse(text)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

async function gravarManifest(supabase: SupabaseClient, bucket: string, links: LinkEntry[]): Promise<void> {
  const blob = new Blob([JSON.stringify(links)], { type: 'application/json' })
  const { error } = await supabase.storage.from(bucket).upload(MANIFEST_PATH, blob, { upsert: true })
  if (error) throw error
}

export function isMaterialManifest(material: Pick<MaterialInformativo, 'file_path'>) {
  return material.file_path.startsWith('link-manifest-')
}

function entradaParaMaterial(entry: LinkEntry): MaterialInformativo {
  return {
    id: entry.id,
    titulo: entry.titulo,
    descricao: entry.descricao,
    categoria: 'Links',
    file_name: entry.url,
    file_path: `link-manifest-${entry.id}`,
    file_type: null,
    file_size: null,
    ativo: true,
    created_at: entry.created_at,
    link_url: entry.url,
    target_profile_ids: entry.target_profile_ids.length > 0 ? entry.target_profile_ids : null,
  }
}

export async function listarLinksManifest(
  supabase: SupabaseClient,
  bucket: string,
): Promise<MaterialInformativo[]> {
  const links = await lerManifest(supabase, bucket)
  return links.map(entradaParaMaterial)
}

export async function adicionarLinkManifest(
  supabase: SupabaseClient,
  bucket: string,
  dados: { titulo: string; descricao: string | null; url: string; targetProfileIds: string[] | null },
): Promise<void> {
  const links = await lerManifest(supabase, bucket)
  links.push({
    id: Date.now(),
    titulo: dados.titulo,
    descricao: dados.descricao,
    url: dados.url,
    target_profile_ids: dados.targetProfileIds ?? [],
    created_at: new Date().toISOString(),
  })
  await gravarManifest(supabase, bucket, links)
}

export async function removerLinkManifest(
  supabase: SupabaseClient,
  bucket: string,
  id: number,
): Promise<void> {
  const links = await lerManifest(supabase, bucket)
  await gravarManifest(supabase, bucket, links.filter(l => l.id !== id))
}
