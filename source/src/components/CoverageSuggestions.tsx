import { AlertTriangle, CheckCircle2, Star } from 'lucide-react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import type { Assignment, Consultation, CoverageProfile, ShiftRequest, Staff } from '../types'
import { copyRuleCheck, findCoverageCandidates } from '../lib/planning'

type Draft = Omit<Assignment,'id'> & {id?:string}
export function directCoverageChecks(draft:Draft,consultations:Consultation[]) {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(draft.work_date)||!draft.start_time||!draft.end_time||draft.end_time.slice(0,5)<=draft.start_time.slice(0,5))return {blocked:['Completa el día y un horario válido antes de asignar.'],review:[] as string[]}
 return copyRuleCheck(consultations.find(c=>c.id===draft.consultation_id),draft.work_date,draft.start_time,draft.end_time,consultations)
}
export default function CoverageSuggestions({draft,staff,profiles,assignments,requests,consultations,busy,reviewed,onReview,onAssign,onAdjust}:{
 draft:Draft;staff:Staff[];profiles:CoverageProfile[];assignments:Assignment[];requests:ShiftRequest[];consultations:Consultation[];busy:boolean;reviewed:boolean;onReview:(checked:boolean)=>void;onAssign:(id:string)=>void;onAdjust:()=>void
}) {
 const candidates=findCoverageCandidates(draft,staff,profiles,assignments,requests,consultations)
 const available=candidates.filter(c=>!c.conflicts.length)
 const unavailable=candidates.filter(c=>c.conflicts.length)
 const unconfigured=staff.filter(p=>p.active&&p.role==='professional'&&!profiles.some(c=>c.staff_id===p.id)).length
 const consultation=consultations.find(c=>c.id===draft.consultation_id)
 const checks=directCoverageChecks(draft,consultations)
 const disabled=busy||checks.blocked.length>0||(checks.review.length>0&&!reviewed)
 const labelDate=draft.work_date&& !Number.isNaN(parseISO(draft.work_date).getTime())?format(parseISO(draft.work_date),'EEEE d MMM',{locale:es}):'Día pendiente'
 return <section className="coverage-suggestions" aria-label="Recomendaciones de cobertura">
  <div className="coverage-context"><div><span className="eyebrow">Buscar cobertura</span><h3>{consultation?.label??'Selecciona una consulta'}</h3><p>{labelDate} · {draft.start_time.slice(0,5)||'—'}–{draft.end_time.slice(0,5)||'—'}</p></div><button type="button" className="text-button inline" disabled={busy} onClick={onAdjust}>Ajustar día u horario</button></div>
  <p className="helper">Primero las personas disponibles, por prioridad en su ficha. A igual prioridad, orden alfabético. La asignación se guardará en borrador.</p>
  {checks.blocked.length>0&&<div className="coverage-caution" role="alert"><strong>Revisa antes de asignar</strong>{checks.blocked.map(reason=><p key={reason}>{reason}</p>)}</div>}
  {checks.review.length>0&&<div className="coverage-caution">{checks.review.map(reason=><p key={reason}>{reason}</p>)}<label className="coverage-review"><input type="checkbox" disabled={busy} checked={reviewed} onChange={e=>onReview(e.target.checked)}/>He revisado la cadencia y el horario de esta cobertura.</label></div>}
  <h4>Disponibles · {available.length}</h4>
  <div className="coverage-candidate-list">{available.map(c=>{const current=Boolean(draft.id&&assignments.find(a=>a.id===draft.id)?.professional_id===c.person.id);const recommended=c.rank===available[0]?.rank;return <article className={`coverage-candidate ${recommended?'recommended':''}`} key={c.person.id}><div><div className="coverage-candidate-heading"><strong>{c.person.display_name}</strong><span className="coverage-rank">Prioridad {c.rank}</span></div>{recommended&&!current&&<span className="coverage-recommended"><Star size={13}/> Recomendada por su prioridad</span>}<ul className="coverage-reasons"><li><CheckCircle2 size={14}/>Consulta incluida en su ficha</li><li><CheckCircle2 size={14}/>Sin ausencia aprobada</li><li><CheckCircle2 size={14}/>Sin solapamientos</li></ul>{current&&<small>Profesional actual de este turno</small>}</div><button type="button" className="primary" aria-label={`${draft.id?'Reasignar turno a':'Asignar a'} ${c.person.display_name}`} disabled={disabled||current} onClick={()=>onAssign(c.person.id)}>{draft.id?'Reasignar':'Asignar'}</button></article>})}</div>
  {!available.length&&<p className="coverage-empty">{candidates.length?'Ninguna persona compatible está libre en esta franja. Revisa los impedimentos o ajusta el horario.':'Ninguna ficha de cobertura incluye esta consulta. Revisa las fichas del equipo para poder obtener recomendaciones.'}</p>}
  {!!unavailable.length&&<details className="unavailable-candidates"><summary>No disponibles · {unavailable.length}</summary>{unavailable.map(c=><article className="coverage-candidate unavailable" key={c.person.id}><div><div className="coverage-candidate-heading"><strong>{c.person.display_name}</strong><span className="coverage-rank">Prioridad {c.rank}</span></div>{c.conflicts.map((reason,index)=><p className="coverage-blocked-reason" key={index}><AlertTriangle size={14}/>{reason}</p>)}</div><span className="coverage-unavailable-label">No asignable</span></article>)}</details>}
  {!!unconfigured&&<p className="helper">{unconfigured} {unconfigured===1?'profesional con ficha pendiente':'profesionales con ficha pendiente'}. No se incluyen en las recomendaciones hasta configurar sus consultas.</p>}
 </section>
}
