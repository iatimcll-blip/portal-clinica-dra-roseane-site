import type { ConfiguracoesMes, Profile, Resultado } from './types'
import {
  calcBonus,
  calcComissaoAvaliacoes,
  calcPctGatilho,
  calcPctMeta,
  calcStatus,
  calcTotalReceber,
  getMensagem,
  getMensagemAnual,
} from './formulas'

export function resultadoDoMes(resultados: Resultado[], profileId: string, mes: number, ano: number): Resultado {
  return resultados.find(r => r.profile_id === profileId && r.mes === mes && r.ano === ano) ?? {
    profile_id: profileId,
    mes,
    ano,
    realizado: 0,
    comissao_avaliacoes: 0,
    nota_feedback: 0,
  }
}

export function calcularRankingMensal(
  profiles: Profile[],
  resultados: Resultado[],
  config: Pick<ConfiguracoesMes, 'meta_gatilho' | 'meta_max' | 'meta_clinica'>,
  mes: number,
  ano: number,
) {
  const totalRealizado = profiles.reduce((s, p) => s + resultadoDoMes(resultados, p.id, mes, ano).realizado, 0)

  return [...profiles]
    .map(p => {
      const r = resultadoDoMes(resultados, p.id, mes, ano)
      const vendasAvaliacoes = r.comissao_avaliacoes ?? 0
      const bonus = calcBonus(r.realizado, config.meta_gatilho, config.meta_max, totalRealizado, config.meta_clinica)

      return {
        ...p,
        realizado: r.realizado,
        vendas_avaliacoes: vendasAvaliacoes,
        comissao_avaliacoes: calcComissaoAvaliacoes(vendasAvaliacoes),
        nota_feedback: r.nota_feedback ?? 0,
        pctGatilho: calcPctGatilho(r.realizado, config.meta_gatilho),
        pctMeta: calcPctMeta(r.realizado, config.meta_max),
        status: calcStatus(r.realizado, config.meta_gatilho, config.meta_max),
        bonus,
        totalReceber: calcTotalReceber(bonus, vendasAvaliacoes),
      }
    })
    .sort((a, b) => b.realizado - a.realizado || a.nome.localeCompare(b.nome, 'pt-BR'))
    .map((p, i) => ({ ...p, pos: i + 1, mensagem: getMensagem(i + 1) }))
}

export function calcularRankingAnual(
  profiles: Profile[],
  resultados: Resultado[],
  metaIndividualAnual: number,
  ano: number,
  ateMes?: number,
) {
  return [...profiles]
    .map(p => {
      const acumulado = resultados
        .filter(r => r.profile_id === p.id && r.ano === ano && (!ateMes || r.mes <= ateMes))
        .reduce((s, r) => s + r.realizado, 0)

      return {
        ...p,
        acumulado,
        pctMeta: calcPctMeta(acumulado, metaIndividualAnual),
        falta: Math.max(0, metaIndividualAnual - acumulado),
      }
    })
    .sort((a, b) => b.acumulado - a.acumulado || a.nome.localeCompare(b.nome, 'pt-BR'))
    .map((p, i) => ({ ...p, pos: i + 1, mensagem: getMensagemAnual(i + 1) }))
}
