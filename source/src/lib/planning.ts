import { addDays, differenceInCalendarDays, differenceInCalendarWeeks, format, getDay, parseISO } from 'date-fns'
import type { Assignment, Consultation, CoverageProfile, ShiftRequest, Staff } from '../types'
import { HOLIDAYS } from '../data/constants'
import { assignmentConflicts, defaultCoverageRules, overlaps } from './scheduling'
export interface CopyPreviewRow { source: Assignment; target: Assignment; blocked: string[]; review: string[] }
export function copyRuleCheck(c:Consultation|undefined,date:string,start:string,end:string,consultations:Consultation[]) {
 const blocked:string[]=[];const review:string[]=[]
 if(date<'2026-10-01'||date>'2026-12-31')blocked.push('Fuera del trimestre disponible')
 if(HOLIDAYS[date])blocked.push(`Festivo: ${HOLIDAYS[date]}`)
 if(!c?.active){blocked.push('Consulta no activa');return {blocked,review}}
 const rules=consultations.filter(x=>x.active).flatMap(x=>(x.coverage_rules??defaultCoverageRules(x.id)).filter(r=>x.id===c.id||r.alternatives?.includes(c.id)))
 const matches=rules.filter(r=>date>=r.valid_from&&date<=r.valid_until&&r.weekdays.includes(getDay(parseISO(date)))&&start.slice(0,5)===r.start_time&&end.slice(0,5)===r.end_time&&(r.monthly||differenceInCalendarWeeks(parseISO(date),parseISO(r.anchor_date),{weekStartsOn:1})%r.every_weeks===0))
 if(rules.some(r=>r.suspensions.some(s=>date>=s.from&&date<=s.to)&&overlaps(start,end,r.start_time,r.end_time)))blocked.push('Franja suspendida')
 if(!matches.length)review.push('Fuera de la cadencia o sin regla de cobertura')
 else if(matches.some(r=>r.monthly))review.push('Sesión mensual: comprueba que no se repita innecesariamente')
 return {blocked,review}
}
export function buildCopyPreview(assignments:Assignment[],consultations:Consultation[],requests:ShiftRequest[],profiles:CoverageProfile[],staff:Staff[],from:string,to:string,targetFrom:string,person='all'):CopyPreviewRow[]{
 if(!from||!to||!targetFrom||to<from||differenceInCalendarDays(parseISO(to),parseISO(from))>30)return []
 const offset=differenceInCalendarDays(parseISO(targetFrom),parseISO(from))
 return assignments.filter(a=>a.work_date>=from&&a.work_date<=to&&(person==='all'||a.professional_id===person)).sort((a,b)=>a.work_date.localeCompare(b.work_date)||a.professional_id.localeCompare(b.professional_id)).map(source=>{
 const date=format(addDays(parseISO(source.work_date),offset),'yyyy-MM-dd')
 const target={...source,id:`copy-${source.id}`,work_date:date,override_reason:null,updated_at:undefined}
 const {blocked,review}=copyRuleCheck(consultations.find(c=>c.id===source.consultation_id),date,source.start_time,source.end_time,consultations)
 if(offset===0)blocked.push('Origen y destino son iguales')
 if(!staff.some(p=>p.id===source.professional_id&&p.active&&p.role==='professional'))blocked.push('Profesional no activo')
 blocked.push(...assignmentConflicts(target,assignments,requests,consultations))
 const profile=profiles.find(p=>p.staff_id===source.professional_id)
 if(!profile)review.push('Ficha de cobertura pendiente de configurar')
 else if(!profile.consultation_ids.includes(source.consultation_id))blocked.push('No puede cubrir esta consulta según su ficha')
 if(source.provisional)review.push('Turno provisional: confirma la cadencia')
 return {source,target,blocked,review}
 })
}
export function findCoverageCandidates(draft:Omit<Assignment,'id'>&{id?:string},staff:Staff[],profiles:CoverageProfile[],assignments:Assignment[],requests:ShiftRequest[],consultations:Consultation[]) {
 return staff.filter(p=>p.active&&p.role==='professional').map(person=>({person,rank:(profiles.find(p=>p.staff_id===person.id)?.consultation_ids.indexOf(draft.consultation_id)??-1)+1,conflicts:assignmentConflicts({...draft,professional_id:person.id},assignments,requests,consultations)})).filter(p=>p.rank>0).sort((a,b)=>Number(a.conflicts.length>0)-Number(b.conflicts.length>0)||a.rank-b.rank||a.person.display_name.localeCompare(b.person.display_name,'es'))
}
export function selectedCopyConflicts(rows:CopyPreviewRow[]):boolean {
 return rows.some((r,i)=>rows.slice(i+1).some(x=>x.target.professional_id===r.target.professional_id&&x.target.work_date===r.target.work_date&&overlaps(r.target.start_time,r.target.end_time,x.target.start_time,x.target.end_time)))
}
