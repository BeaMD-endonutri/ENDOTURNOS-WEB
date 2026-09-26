import { addDays, format, getDay, isAfter, isBefore, parseISO, startOfWeek } from 'date-fns'
import { HOLIDAYS, STAFF_IDS } from './constants'
import type { Assignment } from '../types'

const START = parseISO('2026-10-01')
const END = parseISO('2026-12-31')
const anchor = startOfWeek(START, { weekStartsOn: 1 })
let seq = 0

const make = (professional_id: string, work_date: string, consultation_id: string, start_time = '08:00', end_time = '15:00', notes?: string): Assignment => ({
  id: `demo-${++seq}`, professional_id, work_date, consultation_id, start_time, end_time, notes, provisional: true,
})

export function buildDemoSchedule(): Assignment[] {
  const rows: Assignment[] = []
  const monthFlags = new Set<string>()
  for (let d = START; !isAfter(d, END); d = addDays(d, 1)) {
    if (isBefore(d, START)) continue
    const iso = format(d, 'yyyy-MM-dd')
    const day = getDay(d)
    if (day === 0 || day === 6 || HOLIDAYS[iso]) continue
    const week = Math.floor((d.getTime() - anchor.getTime()) / 604800000)
    const month = format(d, 'yyyy-MM')
    const afternoonOpen = isBefore(d, parseISO('2026-12-15'))

    if (day === 1) {
      rows.push(make(STAFF_IDS.P5, iso, 'HDD'))
      rows.push(make(STAFF_IDS.P7, iso, 'AMBULATORIO'))
      if (week % 2 === 1) rows.push(make(STAFF_IDS.P4, iso, 'EDA'))
      if (!monthFlags.has(`${month}-edag`)) { rows.push(make(STAFF_IDS.P3, iso, 'EDA_GRUPAL')); monthFlags.add(`${month}-edag`) }
      if (week % 4 === 3) rows.push(make(STAFF_IDS.P1, iso, 'NUTRICION'))
      rows.push(make(STAFF_IDS.P2, iso, 'PLANTA'))
      rows.push(make(STAFF_IDS.P8, iso, 'PLANTA', '08:00', '15:00', 'Segunda cobertura obligatoria de lunes'))
      if (afternoonOpen) rows.push(make(STAFF_IDS.P5, iso, 'HDD', '15:00', '20:00'))
    }
    if (day === 2) {
      rows.push(make(STAFF_IDS.P4, iso, 'HDD'))
      rows.push(make(STAFF_IDS.P6, iso, 'NUTRICION', '08:00', '20:00'))
      rows.push(make(STAFF_IDS.P1, iso, 'EN2'))
      rows.push(make(STAFF_IDS.P7, iso, 'AMBULATORIO'))
      rows.push(make(STAFF_IDS.P3, iso, 'EPA'))
      rows.push(make(STAFF_IDS.P2, iso, 'PLANTA'))
      rows.push(make(STAFF_IDS.P8, iso, 'PLANTA'))
      if (afternoonOpen) rows.push(make(STAFF_IDS.P4, iso, 'HDD', '15:00', '20:00'))
    }
    if (day === 3) {
      const danielaAway = week % 2 === 1
      rows.push(make(STAFF_IDS.P8, iso, 'HDD'))
      rows.push(make(STAFF_IDS.P1, iso, 'NUTRICION'))
      rows.push(make(STAFF_IDS.P5, iso, 'AMBULATORIO'))
      rows.push(make(STAFF_IDS.P7, iso, week % 2 === 0 ? 'PF' : 'PAAF'))
      rows.push(make(danielaAway ? STAFF_IDS.P4 : STAFF_IDS.P3, iso, 'EPA', '08:00', '15:00', danielaAway ? 'Cobertura de formación' : undefined))
      rows.push(make(STAFF_IDS.P2, iso, 'PLANTA'))
      rows.push(make(STAFF_IDS.P6, iso, 'PLANTA'))
      if (afternoonOpen) {
        rows.push(make(STAFF_IDS.P2, iso, 'EN1', '15:00', '20:00'))
        rows.push(make(STAFF_IDS.P7, iso, 'HDD', '15:00', '20:00'))
      }
    }
    if (day === 4) {
      const danielaAway = week % 2 === 1
      const nuriaEn1 = week % 2 === 0
      rows.push(make(STAFF_IDS.P5, iso, 'HDD'))
      rows.push(make(STAFF_IDS.P1, iso, 'NUTRICION'))
      rows.push(make(STAFF_IDS.P7, iso, 'AMBULATORIO'))
      rows.push(make(danielaAway ? STAFF_IDS.P4 : STAFF_IDS.P3, iso, 'EDA', '08:00', afternoonOpen ? '20:00' : '15:00', danielaAway ? 'Cobertura de formación' : undefined))
      if (nuriaEn1) rows.push(make(STAFF_IDS.P2, iso, 'EN1'))
      else rows.push(make(STAFF_IDS.P2, iso, 'PLANTA'))
      rows.push(make(STAFF_IDS.P6, iso, 'PLANTA'))
      if (week % 4 === 0) rows.push(make(STAFF_IDS.P8, iso, 'PLANTA', '08:00', '15:00', 'Jueves 1 de cada 4'))
    }
    if (day === 5) {
      rows.push(make(week % 4 === 0 ? STAFF_IDS.P7 : STAFF_IDS.P5, iso, 'HDD'))
      rows.push(make(STAFF_IDS.P4, iso, 'EDA'))
      rows.push(make(STAFF_IDS.P3, iso, 'EPA'))
      rows.push(make(STAFF_IDS.P6, iso, 'PLANTA'))
      if (week % 4 === 3) rows.push(make(STAFF_IDS.P2, iso, 'PLANTA', '08:00', '15:00', 'Viernes 1 de cada 4'))
      else if (week % 4 !== 0) rows.push(make(STAFF_IDS.P7, iso, 'PLANTA'))
      if (!monthFlags.has(`${month}-eng`)) { rows.push(make(STAFF_IDS.P1, iso, 'EN_GRUPAL', '08:00', '15:00', 'Viernes sujeto a cambio')); monthFlags.add(`${month}-eng`) }
    }
  }
  return rows
}
