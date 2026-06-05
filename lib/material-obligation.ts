import type { MaterialInformativo } from '@/lib/types'

const CATEGORIAS_COM_CIENCIA = new Set([
  'comunicado',
  'comunicados',
  'treinamento',
  'treinamentos',
  'protocolo',
  'protocolos',
  'link',
  'links',
])

function normalizarCategoria(valor?: string | null) {
  return (valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function exigeCienciaMaterial(material: Pick<MaterialInformativo, 'categoria'>) {
  return CATEGORIAS_COM_CIENCIA.has(normalizarCategoria(material.categoria))
}

