import type { Assignment } from '../types'

export const ABSENCE_IDS = ['VAC', 'PERM', 'FOR', 'DESCANSO'] as const
export const isAbsence = (id: string) => (ABSENCE_IDS as readonly string[]).includes(id)

export const absenceAppearance = (id:string) => {
 switch(id){
  case 'VAC': return {className:'vac', symbol:'VAC', label:'Vacaciones', shade:'#d8f1e5', color:'#277a59'}
  case 'PERM': return {className:'perm', symbol:'PER', label:'Permiso', shade:'#eadcf0', color:'#8b67a1'}
  case 'FOR': return {className:'for', symbol:'FOR', label:'Formación', shade:'#ffe3c7', color:'#d97d2d'}
  case 'DESCANSO': return {className:'rest', symbol:'', label:'Descanso', shade:'#e3e5e6', color:'#7b8185'}
  default: return {className:'', symbol:id, label:id, shade:'#eef2ee', color:'#50755a'}
 }
}

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
