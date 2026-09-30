export type CicloQuinzenal = 1 | 2

export function ultimoDiaDoMes(mes: number, ano: number): number {
  return new Date(ano, mes, 0).getDate()
}

export function cicloDaData(dataVendaIso: string): CicloQuinzenal {
  const dia = Number(dataVendaIso.slice(8, 10))
  return dia <= 15 ? 1 : 2
}

export function rotuloCiclo(ciclo: CicloQuinzenal, mes: number, ano: number): string {
  if (ciclo === 1) return '1º ciclo (dia 1 a 15)'
  return `2º ciclo (dia 16 a ${ultimoDiaDoMes(mes, ano)})`
}

export function rotuloCicloCurto(ciclo: CicloQuinzenal): string {
  return ciclo === 1 ? '1º Ciclo' : '2º Ciclo'
}
