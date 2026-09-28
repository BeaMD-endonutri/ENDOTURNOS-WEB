import type { Assignment } from '../types'
export const ABSENCE_IDS = ['VAC', 'PERM', 'FOR'] as const
export const isAbsence = (id: string) => (ABSENCE_IDS as readonly string[]).includes(id)
// Remove only absent intervals; a partial-day absence does not remove the other shift.
export function workingIntervals(rows: Assignment[]): Assignment[] {
 return rows.filter(a=>!isAbsence(a.consultation_id)).flatMap(a=>{
  let intervals=[{...a,start_time:a.start_time.slice(0,5),end_time:a.end_time.slice(0,5)}]
  for(const absence of rows.filter(b=>isAbsence(b.consultation_id)&&b.professional_id===a.professional_id&&b.work_date===a.work_date)){
   const start=absence.start_time.slice(0,5),end=absence.end_time.slice(0,5)
   intervals=intervals.flatMap(part=>end<=part.start_time||start>=part.end_time?[part]:[
    ...(start>part.start_time?[{...part,end_time:start}]:[]),
    ...(end<part.end_time?[{...part,start_time:end}]:[])
   ])
  }
  return intervals
 })
}
