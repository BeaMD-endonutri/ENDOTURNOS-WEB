import { usePlanning, periodLabel } from '../lib/planningConfig'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Assignment, Consultation, ShiftRequest } from '../types'

export const isAbsenceRequest=(request:ShiftRequest)=>['vacation','permission'].includes(request.request_type)
export function affectedAssignments(request:ShiftRequest,assignments:Assignment[]) {
 if(!isAbsenceRequest(request))return []
 return assignments.filter(a=>a.professional_id===request.professional_id&&a.work_date>=request.date_from&&a.work_date<=request.date_to).sort((a,b)=>a.work_date.localeCompare(b.work_date)||a.start_time.localeCompare(b.start_time)||a.id.localeCompare(b.id))
}
export default function AbsenceImpact({request,assignments,publishedAssignments,consultations,expanded=false,busy=false,onReassign,onCalendar}:{request:ShiftRequest;assignments:Assignment[];publishedAssignments:Assignment[];consultations:Consultation[];expanded?:boolean;busy?:boolean;onReassign?:(assignment:Assignment)=>void;onCalendar?:(date:string)=>void}) {
 const planning=usePlanning(); const {start_date:ROTA_START,end_date:ROTA_END,holidays:HOLIDAYS}=planning
 if(!isAbsenceRequest(request))return null
 const affected=affectedAssignments(request,assignments)
 const published=affectedAssignments(request,publishedAssignments)
 const approved=request.status==='approved'
 const partial=request.date_from<ROTA_START||request.date_to>ROTA_END
 const groups=Object.entries(affected.reduce<Record<string,number>>((all,a)=>({...all,[a.consultation_id]:(all[a.consultation_id]??0)+1}),{}))
 const months=[...new Set([...affected,...published].map(a=>a.work_date.slice(0,7)))].sort()
 return <section className="absence-impact" aria-label="Impacto de la ausencia"><div className="absence-impact-heading">{affected.length||published.length?<AlertTriangle size={18}/>:<CheckCircle2 size={18}/>}<strong>{approved?'Seguimiento de la ausencia':'Impacto si se aprueba'}</strong></div>
 {partial&&<p className="absence-impact-warning">La revisión solo incluye {periodLabel()}. Comprueba por separado las fechas que quedan fuera de ese periodo.</p>}
 <p><strong>{affected.length} {affected.length===1?'turno en borrador':'turnos en borrador'}</strong>{approved?' por reasignar.':' afectados.'}</p>
 {!!groups.length&&<div className="absence-impact-summary">{groups.map(([id,count])=><span key={id}>{consultations.find(c=>c.id===id)?.label??id} · {count}</span>)}</div>}
 {affected.length>0&&<details open={expanded||approved}><summary>{approved?'Turnos por resolver':'Ver fechas y horarios'}</summary><div className="absence-shift-list">{affected.map(a=><article key={a.id}><div><strong>{consultations.find(c=>c.id===a.consultation_id)?.label??a.consultation_id}</strong><small>{format(parseISO(a.work_date),'EEE d MMM',{locale:es})} · {a.start_time.slice(0,5)}–{a.end_time.slice(0,5)}</small></div>{approved&&onReassign&&<button type="button" disabled={busy} className="soft-button" aria-label={`Buscar cobertura para ${consultations.find(c=>c.id===a.consultation_id)?.label??a.consultation_id} del ${a.work_date}`} onClick={()=>onReassign(a)}>Buscar cobertura</button>}</article>)}</div></details>}
 <p className="absence-published-status"><strong>{published.length} {published.length===1?'turno en la versión publicada':'turnos en la versión publicada'}</strong>{approved&&published.length>0?'. El equipo seguirá viendo esos turnos hasta que publiques el cuadrante corregido.':'.'}</p>
 {published.length>0&&<details><summary>Ver turnos publicados afectados</summary><div className="absence-shift-list">{published.map(a=><article key={a.id}><div><strong>{consultations.find(c=>c.id===a.consultation_id)?.label??a.consultation_id}</strong><small>{format(parseISO(a.work_date),'EEE d MMM',{locale:es})} · {a.start_time.slice(0,5)}–{a.end_time.slice(0,5)}</small></div></article>)}</div></details>}
 {approved&&!affected.length&&<p className="absence-resolved"><CheckCircle2 size={16}/>{published.length?'Borrador resuelto. Falta publicar los meses afectados.':partial?'No hay turnos afectados en el periodo revisado.':'No quedan turnos afectados en borrador ni en la versión publicada.'}</p>}
 {approved&&months.length>0&&onCalendar&&<div className="absence-month-links">{months.map(month=><button type="button" className="text-button inline" key={month} onClick={()=>onCalendar(month+'-01')}>Revisar y publicar {format(parseISO(month+'-01'),'MMMM',{locale:es})}</button>)}</div>}
 {!approved&&!!affected.length&&<p className="helper">Al aprobar, estos turnos dejarán de contar para la cobertura. Podrás reasignarlos desde esta misma solicitud.</p>}
 </section>
}
