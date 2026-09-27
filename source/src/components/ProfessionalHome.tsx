import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { Bell, CalendarDays, ChevronRight, Clock3 } from 'lucide-react'
import { MASCOTS } from '../data/constants'
import type { Assignment, Consultation, ShiftRequest, Staff, TeamBroadcast } from '../types'
import { ROTA_START, ROTA_END } from './AgendaView'

const requestLabels = {vacation:'Vacaciones',permission:'Permiso',swap:'Cambio de turno',preference:'Preferencia',correction:'Corrección'}
export default function ProfessionalHome({profile,publishedAssignments,consultations,requests,broadcasts,today,onCalendar,onBroadcasts,onRequest}:{
 profile:Staff;publishedAssignments:Assignment[];consultations:Consultation[];requests:ShiftRequest[];broadcasts:TeamBroadcast[];today:string
 onCalendar:(date:string)=>void;onBroadcasts:()=>void;onRequest:(id?:string)=>void
}) {
 const mascot=MASCOTS.find(m=>m.key===profile.mascot_key)??MASCOTS[0]
 const mine=publishedAssignments.filter(a=>a.professional_id===profile.id).sort((a,b)=>a.work_date.localeCompare(b.work_date)||a.start_time.localeCompare(b.start_time)||a.id.localeCompare(b.id))
 const todayShifts=mine.filter(a=>a.work_date===today)
 const future=mine.filter(a=>a.work_date>today)
 const nextDates=[...new Set(future.map(a=>a.work_date))].slice(0,3)
 const myRequests=requests.filter(r=>r.professional_id===profile.id)
 const pending=myRequests.filter(r=>r.status==='pending').sort((a,b)=>b.created_at.localeCompare(a.created_at))
 const updates=myRequests.filter(r=>r.status!=='pending'&&!r.professional_seen_at)
 const unread=broadcasts.filter(b=>b.et_broadcast_recipients.some(r=>r.staff_id===profile.id&&!r.read_at)).sort((a,b)=>b.created_at.localeCompare(a.created_at))
 const absences=myRequests.filter(r=>r.status==='approved'&&['vacation','permission'].includes(r.request_type)&&r.date_from<=today&&r.date_to>=today)
 const inPeriod=today>=ROTA_START&&today<=ROTA_END
 const calendarDate=inPeriod?today:nextDates[0]??(today<ROTA_START?ROTA_START:ROTA_END)
 const shift=(a:Assignment)=>{
  const c=consultations.find(c=>c.id===a.consultation_id)
  return <button className="personal-shift" key={a.id} onClick={()=>onCalendar(a.work_date)} aria-label={`Ver ${c?.label??a.consultation_id} del ${a.work_date}, ${a.start_time.slice(0,5)}–${a.end_time.slice(0,5)}`}><span className="personal-shift-dot" style={{background:c?.color??'#3a7d63'}}/><span><strong>{c?.label??a.consultation_id}</strong><small><Clock3 size={14}/>{a.start_time.slice(0,5)}–{a.end_time.slice(0,5)}{a.provisional?' · Provisional':''}</small></span><ChevronRight size={18}/></button>
 }
 return <section className="content-section professional-home">
  <div className="personal-greeting"><img src={mascot.src} alt=""/><div><span className="eyebrow">Tu día, de un vistazo</span><h1>Hola, {profile.display_name.split(' ')[0].toLocaleLowerCase('es').replace(/^./,s=>s.toUpperCase())}</h1><p>{format(parseISO(today),"EEEE d 'de' MMMM",{locale:es})}</p></div></div>
  <section className="panel personal-today" aria-labelledby="personal-today-title"><div className="section-heading"><div><h2 id="personal-today-title">Hoy</h2><p>Tu planificación publicada</p></div><button className="primary" onClick={()=>onCalendar(calendarDate)}><CalendarDays size={18}/> Mi cuadrante</button></div>
   {absences.map(r=><button className="personal-absence" key={r.id} onClick={()=>onRequest(r.id)}>{r.request_type==='vacation'?'Vacaciones aprobadas':'Permiso aprobado'} · Ver solicitud<ChevronRight size={16}/></button>)}
   {todayShifts.length>0?<div className="personal-shifts">{todayShifts.map(shift)}</div>:<p className="personal-empty">{!inPeriod?'Hoy está fuera del periodo disponible: octubre–diciembre de 2026.':absences.length?'No tienes turnos publicados para hoy.':'No tienes turnos asignados hoy en la versión publicada.'}</p>}
   {absences.length>0&&todayShifts.length>0&&<p className="form-message">Tu ausencia está aprobada, pero estos turnos siguen en el cuadrante publicado. Consulta con la supervisora.</p>}
  </section>
  <div className="personal-home-grid">
   <section className="panel" aria-labelledby="personal-next-title"><h2 id="personal-next-title">Próximos turnos</h2>{nextDates.length?nextDates.map(date=><div className="personal-next-day" key={date}><h3>{format(parseISO(date),"EEEE d 'de' MMMM",{locale:es})}</h3><div className="personal-shifts">{future.filter(a=>a.work_date===date).map(shift)}</div></div>):<p className="personal-empty">No hay próximos turnos en el cuadrante publicado del periodo disponible.</p>}<button className="text-button inline" onClick={()=>onCalendar(calendarDate)}>Ver mi cuadrante completo <ChevronRight size={16}/></button></section>
   <div className="personal-pending">
    <section className="panel" aria-labelledby="personal-notices-title"><h2 id="personal-notices-title"><Bell size={19}/> Avisos pendientes <span className="personal-count">{unread.length}</span></h2>{unread.length?<><ul className="personal-notice-list">{unread.slice(0,3).map(b=><li key={b.id}><strong>{b.title}</strong><small>{format(parseISO(b.created_at),'d MMM · HH:mm',{locale:es})}</small></li>)}</ul><button className="soft-button" onClick={onBroadcasts}>Leer avisos pendientes</button></>:<><p className="personal-empty">Estás al día con los avisos.</p><button className="text-button inline" onClick={onBroadcasts}>Ver todos los avisos</button></>}</section>
    <section className="panel" aria-labelledby="personal-requests-title"><h2 id="personal-requests-title">Solicitudes en curso <span className="personal-count">{pending.length}</span></h2>{pending.length?<div className="personal-request-list">{pending.slice(0,3).map(r=><button key={r.id} onClick={()=>onRequest(r.id)}><span><strong>{requestLabels[r.request_type]}</strong><small>{format(parseISO(r.date_from),'d MMM',{locale:es})}{r.date_to!==r.date_from?` – ${format(parseISO(r.date_to),'d MMM',{locale:es})}`:''} · Pendiente</small></span><ChevronRight size={17}/></button>)}</div>:<p className="personal-empty">No tienes solicitudes pendientes de resolver.</p>}{updates.length>0&&<button className="personal-response" onClick={()=>onRequest(updates[0].id)}>{updates.length===1?'Tienes una respuesta sin leer':`Tienes ${updates.length} respuestas sin leer`}<ChevronRight size={16}/></button>}<button className="text-button inline" onClick={()=>onRequest()}>Ver mis solicitudes</button></section>
   </div>
  </div>
 </section>
}
