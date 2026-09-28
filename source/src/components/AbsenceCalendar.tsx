import { usePlanning } from '../lib/planningConfig'
import { useState } from 'react'
import { addDays,addMonths,endOfMonth,format,getDay,parseISO,startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { ChevronLeft,ChevronRight, Plus, X } from 'lucide-react'
import type { Assignment,Consultation,ShiftRequest,Staff,LockedMonth } from '../types'
import type { CoverageIssue } from '../lib/coverage'
import type { ShiftSelection } from './ShiftEditor'
import { ABSENCE_IDS,absenceAppearance,isAbsence } from '../lib/absences'
import { overlaps } from '../lib/scheduling'
export default function AbsenceCalendar({initialMonth,staff,requests,assignments,consultations,issues,isSupervisor,lockedMonths=[],onClose,onAssign,onRequest,onAbsence}:{initialMonth:string;staff:Staff[];requests:ShiftRequest[];assignments:Assignment[];consultations:Consultation[];issues:CoverageIssue[];isSupervisor:boolean;lockedMonths?:LockedMonth[];onClose:()=>void;onAssign:(date:string,personId?:string)=>void;onRequest:(id:string)=>void;onAbsence?:(selection:ShiftSelection)=>void}){
 const {end_date:ROTA_END}=usePlanning()
 const [month,setMonth]=useState(parseISO(initialMonth+'-01'));const [day,setDay]=useState<string|null>(null)
 const approved=requests.filter(r=>r.status==='approved'&&['vacation','permission'].includes(r.request_type))
 const days=[];for(let d=startOfMonth(month);d<=endOfMonth(month);d=addDays(d,1))days.push(format(d,'yyyy-MM-dd'))
 const first=(getDay(startOfMonth(month))+6)%7;const key=format(month,'yyyy-MM')
 const onDay=(date:string)=>approved.filter(r=>r.date_from<=date&&r.date_to>=date)
 const recorded=(date:string)=>assignments.filter(a=>a.work_date===date&&isAbsence(a.consultation_id))
 const selected=day?onDay(day):[];const selectedShifts=day?recorded(day):[]
 const locked=lockedMonths.some(m=>m.month===key+'-01')
 const canAdd=isSupervisor&&!locked&&(day??key+'-01')<=ROTA_END
 const name=(id:string)=>staff.find(s=>s.id===id)?.display_name??'Profesional'
 const label=(id:string)=>consultations.find(c=>c.id===id)?.label??id
 return <section className="panel absence-calendar">
  <div className="section-heading"><div><h2>{isSupervisor?'Calendario de ausencias':'Mis ausencias'}</h2><p>Vacaciones (VAC), permisos (PER), formaciones (FOR) y descansos del personal. Puedes añadirlos por periodos continuos y mantener su horario.</p></div><button className="soft-button" onClick={onClose}><X size={16}/> Volver al cuadrante</button></div>
  <div className="month-switch"><button aria-label="Ausencias: mes anterior" onClick={()=>{setMonth(addMonths(month,-1));setDay(null)}}><ChevronLeft/></button><label><span className="sr-only">Mes de ausencias</span><input aria-label="Mes de ausencias" type="month" value={key} onChange={e=>{if(e.target.value){setMonth(parseISO(e.target.value+'-01'));setDay(null)}}}/></label><button aria-label="Ausencias: mes siguiente" onClick={()=>{setMonth(addMonths(month,1));setDay(null)}}><ChevronRight/></button></div>
  {locked&&<p className="form-message">Mes bloqueado permanentemente: solo consulta.</p>}
  {canAdd&&onAbsence&&<div className="inline-actions absence-add-actions">{ABSENCE_IDS.map(id=><button className="soft-button" key={id} onClick={()=>onAbsence({date:day??key+'-01',consultationId:id})}><Plus size={16}/> {label(id)} ({id})</button>)}</div>}
  <div className="absence-grid">{['L','M','X','J','V','S','D'].map((d,i)=><strong className="absence-weekday" key={i}>{d}</strong>)}{Array.from({length:first},(_,i)=><div key={`blank${i}`}/>)}{days.map(date=><button className={`absence-day ${day===date?'selected':''}`} key={date} onClick={()=>setDay(date)}><strong>{Number(date.slice(-2))}</strong>{recorded(date).map(a=>{const visual=absenceAppearance(a.consultation_id);return <span className={`scheduled-absence absence-preview-${visual.className}`} style={{borderLeft:`3px solid ${visual.color}`}} key={a.id}>{name(a.professional_id)}<small>{visual.symbol?visual.symbol+' · ':''}{visual.label} · {a.start_time.slice(0,5)}–{a.end_time.slice(0,5)}{a.provisional?' · Provisional':''}</small></span>})}{onDay(date).map(r=><span className={r.request_type} key={r.id}>{name(r.professional_id)}<small>{r.request_type==='vacation'?'VAC':'PERM'} · Solicitud aprobada</small></span>)}</button>)}</div>
  {day&&<div className="absence-detail"><h3>{format(parseISO(day),"EEEE d 'de' MMMM",{locale:es})}</h3>{!selected.length&&!selectedShifts.length&&<p>No hay ausencias este día.</p>}
   {selectedShifts.map(a=>{const affected=assignments.filter(b=>!isAbsence(b.consultation_id)&&b.professional_id===a.professional_id&&b.work_date===day&&overlaps(a.start_time,a.end_time,b.start_time,b.end_time));return <article key={a.id}><strong>{name(a.professional_id)} · {label(a.consultation_id)} ({a.consultation_id})</strong><p>{a.start_time.slice(0,5)}–{a.end_time.slice(0,5)}{a.provisional?' · Provisional':''}</p>{a.notes&&<p>{a.notes}</p>}{affected.length>0&&<p className="review-text">Turnos que requieren revisión: {affected.map(b=>label(b.consultation_id)).join(', ')}.</p>}<div className="inline-actions"><button className="soft-button" onClick={()=>onAbsence?.({date:day,personId:a.professional_id,consultationId:a.consultation_id,assignmentId:a.id})}>{isSupervisor&&!locked?'Editar ausencia':'Ver ausencia'}</button>{isSupervisor&&!locked&&affected.length>0&&<button className="soft-button" onClick={()=>onAssign(day,a.professional_id)}>Reorganizar turnos</button>}</div></article>})}
   {selected.map(r=>{const affected=assignments.filter(a=>!isAbsence(a.consultation_id)&&a.professional_id===r.professional_id&&a.work_date===day);return <article key={r.id}><strong>{name(r.professional_id)} · {r.request_type==='vacation'?'Vacaciones':'Permiso'}</strong><p>{r.date_from} — {r.date_to} · Solicitud aprobada</p>{affected.length>0&&<p className="review-text">Turnos que requieren revisión: {affected.map(a=>label(a.consultation_id)).join(', ')}.</p>}<div className="inline-actions"><button className="soft-button" onClick={()=>onRequest(r.id)}>Ver solicitud</button>{isSupervisor&&!locked&&affected.length>0&&<button className="soft-button" onClick={()=>onAssign(day,r.professional_id)}>Reorganizar turnos</button>}</div></article>})}
   {isSupervisor&&!locked&&issues.some(i=>i.date===day)&&<button className="soft-button" onClick={()=>onAssign(day)}>Revisar cobertura del día ({issues.filter(i=>i.date===day).length})</button>}
  </div>}
 </section>
}
