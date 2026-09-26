import type { Assignment, Consultation, CoverageRule, ShiftRequest } from '../types'

export const overlaps = (start: string, end: string, otherStart: string, otherEnd: string) => start.slice(0, 5) < otherEnd.slice(0, 5) && end.slice(0, 5) > otherStart.slice(0, 5)
export function hasAbsence(person: string, date: string, requests: ShiftRequest[]) {
  return requests.some(r => r.professional_id === person && r.status === 'approved' && ['vacation', 'permission'].includes(r.request_type) && r.date_from <= date && r.date_to >= date)
}
export function assignmentConflicts(next: Omit<Assignment, 'id'> & { id?: string }, assignments: Assignment[], requests: ShiftRequest[], consultations: Consultation[]): string[] {
  const result: string[] = []
  for (const a of assignments) if (a.id !== next.id && a.professional_id === next.professional_id && a.work_date === next.work_date && overlaps(next.start_time, next.end_time, a.start_time, a.end_time)) result.push(`Coincide con ${consultations.find(c => c.id === a.consultation_id)?.label ?? a.consultation_id} (${a.start_time.slice(0, 5)}–${a.end_time.slice(0, 5)}).`)
  if (hasAbsence(next.professional_id, next.work_date, requests)) result.push('Tiene vacaciones o un permiso aprobado para ese día. Revisa su disponibilidad.')
  return result
}
export function defaultCoverageRules(id: string): CoverageRule[] {
  const rules: CoverageRule[] = []
  const add = (days: number[], afternoon = false, minimum = 1, every = 1, anchor = '2026-09-28', monthly = false, alternatives?: string[]) => rules.push({ id: `${id}-${rules.length}`, weekdays: days, start_time: afternoon ? '15:00' : '08:00', end_time: afternoon ? '20:00' : '15:00', min_staff: minimum, every_weeks: every, anchor_date: anchor, monthly, valid_from: '2026-10-01', valid_until: '2026-12-31', suspensions: afternoon ? [{ from: '2026-12-15', to: '2027-01-07' }] : [], alternatives })
  switch (id) {
    case 'PLANTA': add([1,2,3,4,5], false, 2); break
    case 'HDD': add([1,2,3,4,5]); add([1,2,3], true); break
    case 'AMBULATORIO': add([1,2,3,4]); break
    case 'EDA': add([4,5]); add([1], false, 1, 2, '2026-10-05'); add([4], true); break
    case 'NUTRICION': add([2,3,4]); add([1], false, 1, 4, '2026-10-19'); add([2], true); break
    case 'EPA': add([2,3,5]); add([4], false, 1, 1, '2026-09-28', true); break
    case 'EN1': add([4], false, 1, 2); add([3], true); break
    case 'EN2': add([2]); break
    case 'PF': add([3], false, 1, 1, '2026-09-28', false, ['PAAF']); break
    case 'EDA_GRUPAL': add([1], false, 1, 1, '2026-09-28', true); break
    case 'EN_GRUPAL': add([5], false, 1, 1, '2026-09-28', true); break
  }
  return rules
}
