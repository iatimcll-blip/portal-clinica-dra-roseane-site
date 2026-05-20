import type { MaterialInformativo, MaterialLeitura, Profile } from '@/lib/types'

export type GoogleSheetsMaterialRead = {
  registrado_em?: string
  email?: string
  nome?: string
  perfil?: string
  profile_id?: string
  material_id?: number | string
  material_titulo?: string
  material_arquivo?: string
  categoria?: string
}

export type CompatibilizacaoLeituras = {
  leituras: MaterialLeitura[]
  totalLinhasGoogle: number
  totalUnicoGoogle: number
  totalCompatibilizado: number
}

export function normalizarChave(valor?: string | null) {
  return (valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizarSolto(valor?: string | null) {
  return normalizarChave(valor).replace(/[^a-z0-9]/g, '')
}

function distanciaEdicao(a: string, b: string) {
  const matriz = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0))
  for (let i = 0; i <= a.length; i += 1) matriz[i][0] = i
  for (let j = 0; j <= b.length; j += 1) matriz[0][j] = j

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const custo = a[i - 1] === b[j - 1] ? 0 : 1
      matriz[i][j] = Math.min(
        matriz[i - 1][j] + 1,
        matriz[i][j - 1] + 1,
        matriz[i - 1][j - 1] + custo,
      )
    }
  }

  return matriz[a.length][b.length]
}

function encontrarMaterialPorTitulo(materiais: MaterialInformativo[], titulo: string) {
  const tituloNormalizado = normalizarChave(titulo)
  const exato = materiais.find(material => normalizarChave(material.titulo) === tituloNormalizado)
  if (exato) return exato

  const tituloSolto = normalizarSolto(titulo)
  if (!tituloSolto) return undefined

  return materiais.find(material => {
    const materialSolto = normalizarSolto(material.titulo)
    if (!materialSolto) return false
    if (materialSolto.includes(tituloSolto) || tituloSolto.includes(materialSolto)) return true

    const limite = Math.max(1, Math.floor(Math.max(materialSolto.length, tituloSolto.length) * 0.08))
    return distanciaEdicao(materialSolto, tituloSolto) <= limite
  })
}

function encontrarMaterialPorIdOuTitulo(materiais: MaterialInformativo[], materialId?: number | string, titulo?: string) {
  const idNumerico = Number(materialId)
  if (Number.isFinite(idNumerico)) {
    const porId = materiais.find(material => material.id === idNumerico)
    if (porId) return porId
  }

  return encontrarMaterialPorTitulo(materiais, titulo ?? '')
}

function encontrarProfilePorIdOuNome(profiles: Profile[], profissionaisPorNome: Map<string, Profile>, profileId?: string, nome?: string) {
  const id = String(profileId ?? '').trim()
  if (id) {
    const porId = profiles.find(profile => profile.id === id)
    if (porId) return porId
  }

  return profissionaisPorNome.get(normalizarChave(nome))
}

export function compatibilizarLeiturasGoogleSheets(
  profiles: Profile[],
  materiais: MaterialInformativo[],
  leiturasGoogle: GoogleSheetsMaterialRead[],
): CompatibilizacaoLeituras {
  const profissionaisPorNome = new Map(profiles.map(profile => [normalizarChave(profile.nome), profile]))
  const unicasGoogle = new Map<string, GoogleSheetsMaterialRead>()
  const compatibilizadas = new Map<string, MaterialLeitura>()

  leiturasGoogle.forEach(leitura => {
    const nome = normalizarChave(leitura.nome)
    const titulo = normalizarChave(leitura.material_titulo)
    if (!nome || !titulo) return

    const chaveGoogle = `${nome}:${titulo}`
    if (!unicasGoogle.has(chaveGoogle)) {
      unicasGoogle.set(chaveGoogle, leitura)
    }

    const profile = encontrarProfilePorIdOuNome(profiles, profissionaisPorNome, leitura.profile_id, leitura.nome)
    const material = encontrarMaterialPorIdOuTitulo(materiais, leitura.material_id, leitura.material_titulo)
    if (!profile || !material) return

    const chaveLeitura = `${profile.id}:${material.id}`
    if (!compatibilizadas.has(chaveLeitura)) {
      compatibilizadas.set(chaveLeitura, {
        profile_id: profile.id,
        material_id: material.id,
        read_at: leitura.registrado_em || new Date().toISOString(),
      })
    }
  })

  return {
    leituras: Array.from(compatibilizadas.values()),
    totalLinhasGoogle: leiturasGoogle.length,
    totalUnicoGoogle: unicasGoogle.size,
    totalCompatibilizado: compatibilizadas.size,
  }
}
