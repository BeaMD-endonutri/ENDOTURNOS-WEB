import { usePlanning, periodLabel } from '../lib/planningConfig'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { CalendarDays, ChevronLeft, ChevronRight, Clock3 } from 'lucide-react'
import type { Assignment, Consultation, ShiftRequest, Staff } from '../types'
import type { ShiftSelection } from './ShiftEditor'

export default function AgendaView({ date, today, staff, assignments, consultations, requests, isSupervisor, onDate, onSelect, onMove }: {
 date:string; today:string; staff:Staff[]; assignments:Assignment[]; consultations:Consultation[]; requests:ShiftRequest[]; isSupervisor:boolean
 onDate:(date:string)=>void; onMove:(days:number)=>void; onSelect:(selection:ShiftSelection)=>void
}) {
 const planning=usePlanning(); const {start_date:ROTA_START,end_date:ROTA_END,holidays:HOLIDAYS}=planning
 const todayAvailable=today>=ROTA_START&&today<=ROTA_END
 return <section className="agenda-view" aria-label="Agenda diaria">
  <div className="agenda-date-bar"><label><CalendarDays size={18}/> Día<input aria-label="Día de la agenda" type="date" min={ROTA_START} max={ROTA_END} value={date} onChange={e=>{if(e.target.value>=ROTA_START&&e.target.value<=ROTA_END)onDate(e.target.value)}}/></label><button className="soft-button" disabled={!todayAvailable||date===today} title={todayAvailable?'Ir al día de hoy':`Hoy está fuera del periodo ${periodLabel()}`} onClick={()=>onDate(today)}>Hoy</button></div>
  <div className="agenda-day-heading"><button className="soft-button" aria-label="Día anterior" disabled={date<=ROTA_START} onClick={()=>onMove(-1)}><ChevronLeft size={20}/></button><div aria-live="polite"><span>{date===today?'Hoy':format(parseISO(date),'EEEE',{locale:es})}</span><h2>{format(parseISO(date),"d 'de' MMMM",{locale:es})}</h2>{HOLIDAYS[date]&&<small className="agenda-holiday">Festivo · {HOLIDAYS[date]}</small>}</div><button className="soft-button" aria-label="Día siguiente" disabled={date>=ROTA_END} onClick={()=>onMove(1)}><ChevronRight size={20}/></button></div>
  {!todayAvailable&&<p className="helper">El periodo disponible abarca {periodLabel()}.</p>}
  <div className="agenda-people">{staff.map(person=>{
   const shifts=assignments.filter(a=>a.professional_id===person.id&&a.work_date===date).sort((a,b)=>a.start_time.localeCompare(b.start_time)||a.end_time.localeCompare(b.end_time))
   const absence=requests.find(r=>r.professional_id===person.id&&r.status==='approved'&&['vacation','permission'].includes(r.request_type)&&r.date_from<=date&&r.date_to>=date)
   return <article className="agenda-person" key={person.id}><header><h3>{person.display_name}</h3>{isSupervisor&&<button className="text-button inline" onClick={()=>onSelect({date,personId:person.id})}>{shifts.length?'Gestionar':'Asignar'}</button>}</header>
    {absence&&<p className="agenda-absence">{absence.request_type==='vacation'?'Vacaciones aprobadas':'Permiso aprobado'}</p>}
    {shifts.map(shift=>{const consultation=consultations.find(c=>c.id===shift.consultation_id);return <button key={shift.id} className="agenda-shift" onClick={()=>onSelect({date,personId:person.id,consultationId:shift.consultation_id})} aria-label={`${person.display_name}: ${consultation?.label??shift.consultation_id}, ${shift.start_time.slice(0,5)} a ${shift.end_time.slice(0,5)}`}><span className="agenda-consultation-color" style={{background:consultation?.color??'#50755a'}}/><span><strong>{consultation?.label??shift.consultation_id}</strong><span className="agenda-time"><Clock3 size={15}/>{shift.start_time.slice(0,5)}–{shift.end_time.slice(0,5)}{shift.provisional&&<small>Provisional</small>}</span></span><ChevronRight size={18}/></button>})}
    {!shifts.length&&<p className="agenda-empty">Sin turno asignado</p>}
   </article>
  })}{!staff.length&&<p className="all-clear">No hay profesionales en esta selección.</p>}</div>
 </section>
}
