// republish cadence-capacity fix
import { isAbsence, workingIntervals } from './absences'
import {addDays,differenceInCalendarWeeks,endOfMonth,format,getDay,parseISO,startOfWeek} from 'date-fns'
import type {Assignment,Consultation,CoverageException,CoverageProfile,CoverageRule,ShiftRequest,Staff} from '../types'
import type {PlanningConfig} from './planningConfig'
import {assignmentConflicts,defaultCoverageRules,hasAbsence} from './scheduling'
import {copyRuleCheck} from './planning'
import {buildCoverageIssues,minimumCoverage,sameCoverageRule} from './coverage'
export interface SuggestionContext {staff:Staff[];consultations:Consultation[];assignments:Assignment[];requests:ShiftRequest[];profiles:CoverageProfile[];exceptions:CoverageException[];planning:PlanningConfig;fingerprint:string}
export interface SuggestedShift extends Assignment {suggestion_reason:string;reference_exception?:boolean}
export function cadenceAllows(profile:CoverageProfile|undefined,date:string,start:string,end:string){
 return !!profile?.work_cadences?.some(r=>date>=r.valid_from&&date<=r.valid_until&&r.weekdays.includes(getDay(parseISO(date)))&&r.start_time<=start&&r.end_time>=end&&differenceInCalendarWeeks(parseISO(date),parseISO(r.anchor_date),{weekStartsOn:1})%r.every_weeks===0)
}
export const duration=(a:Pick<Assignment,'start_time'|'end_time'>)=>{const m=(t:string)=>Number(t.slice(0,2))*60+Number(t.slice(3,5));return m(a.end_time)-m(a.start_time)}
export function weeklyLoad(person:string,date:string,rows:Assignment[]){const from=format(startOfWeek(parseISO(date),{weekStartsOn:1}),'yyyy-MM-dd');const to=format(addDays(parseISO(from),6),'yyyy-MM-dd');return rows.filter(a=>a.professional_id===person&&a.work_date>=from&&a.work_date<=to).reduce((sum,a)=>sum+duration(a),0)}
export function cadenceWeekCapacity(profile:CoverageProfile|undefined,date:string){
 if(!profile?.work_cadences?.length)return 0
 const weekStart=startOfWeek(parseISO(date),{weekStartsOn:1})
 let minutes=0
 for(let i=0;i<7;i++){
  const d=addDays(weekStart,i),iso=format(d,'yyyy-MM-dd'),dow=getDay(d)
  const intervals=profile.work_cadences.filter(r=>iso>=r.valid_from&&iso<=r.valid_until&&r.weekdays.includes(dow)&&differenceInCalendarWeeks(d,parseISO(r.anchor_date),{weekStartsOn:1})%r.every_weeks===0).map(r=>({start_time:r.start_time,end_time:r.end_time}))
  const unique=[...new Map(intervals.map(r=>[`${r.start_time}-${r.end_time}`,r])).values()]
  minutes+=unique.reduce((sum,r)=>sum+duration(r),0)
 }
 return minutes
}
export function suggestMonth(month:string,ctx:SuggestionContext){
 const {staff,consultations,assignments,requests,profiles,exceptions,planning}=ctx
 const from=month+'-01',until=format(endOfMonth(parseISO(from)),'yyyy-MM-dd')
 const warnings:string[]=[];const proposed:SuggestedShift[]=[];const working=[...assignments]
 if(from<planning.start_date||until>planning.end_date)return {proposed,warnings:['Amplía el periodo en Configuración antes de sugerir este mes.'],issues:[]}
 const configured=consultations.filter(c=>c.active&&!isAbsence(c.id))
 for(const p of staff.filter(p=>p.active&&p.role==='professional')){const profile=profiles.find(x=>x.staff_id===p.id);if(!profile?.consultation_ids.length||!profile.work_cadences?.length)warnings.push(`${p.display_name}: ficha de consultas o cadencias pendiente; no se propondrá.`)}
 type Slot={c:Consultation;r:CoverageRule;dates:string[];target:number}
 const slots:Slot[]=[]
 for(const c of configured){
  let open=false
  for(const r of c.coverage_rules??defaultCoverageRules(c.id)){
   const preferred=r.preferred_staff_ids??(c.preferred_staff_id?[c.preferred_staff_id]:[]);if(!preferred.length)warnings.push(`${c.label}: una regla no tiene profesional habitual; se usarán profesionales compatibles.`)
   const dates:string[]=[]
   for(let d=parseISO(from);format(d,'yyyy-MM-dd')<=until;d=addDays(d,1)){
    const date=format(d,'yyyy-MM-dd');if(copyRuleCheck(c,date,r.start_time,r.end_time,consultations,planning).blocked.length||planning.holidays[date]||date<r.valid_from||date>r.valid_until||!r.weekdays.includes(getDay(d))||r.suspensions.some(s=>date>=s.from&&date<=s.to)||(!r.monthly&&differenceInCalendarWeeks(d,parseISO(r.anchor_date),{weekStartsOn:1})%r.every_weeks!==0))continue
    dates.push(date)
   }
   if(dates.length)open=true
   if(r.monthly&&dates.length)slots.push({c,r,dates,target:r.min_staff})
   else for(const date of dates){const exception=c.id==='PLANTA'&&r.min_staff===2&&!r.alternatives?.length&&exceptions.some(e=>!e.revoked_at&&e.work_date===date&&e.consultation_id===c.id&&e.rule_id===r.id&&sameCoverageRule(e.rule_snapshot,r));slots.push({c,r,dates:[date],target:exception?1:r.min_staff})}
  }
  if(!open)warnings.push(`${c.label}: sin franjas abiertas este mes; revisa la vigencia y las suspensiones.`)
 }
 const coverage=(s:Slot,date:string)=>minimumCoverage(workingIntervals(working).filter(a=>[s.c.id,...(s.r.alternatives??[])].includes(a.consultation_id)&&a.work_date===date&&!hasAbsence(a.professional_id,date,requests)),s.r.start_time,s.r.end_time)
 const available=(s:Slot,date:string)=>{const preferred=s.r.preferred_staff_ids??(s.c.preferred_staff_id?[s.c.preferred_staff_id]:[]);const secondary=s.r.secondary_staff_ids??s.c.secondary_staff_ids??[];const tier=(id:string)=>preferred.includes(id)?0:secondary.includes(id)?1:2;return staff.filter(p=>p.active&&p.role==='professional').map(person=>({person,profile:profiles.find(p=>p.staff_id===person.id)})).filter(({person,profile})=>profile?.consultation_ids.includes(s.c.id)&&cadenceAllows(profile,date,s.r.start_time,s.r.end_time)&&!assignmentConflicts({professional_id:person.id,work_date:date,consultation_id:s.c.id,start_time:s.r.start_time,end_time:s.r.end_time,provisional:false},working,requests,consultations).length&&weeklyLoad(person.id,date,working)+duration(s.r)<=Math.max(person.weekly_minutes,cadenceWeekCapacity(profile,date))).sort((a,b)=>tier(a.person.id)-tier(b.person.id)||(a.profile!.consultation_ids.indexOf(s.c.id)-b.profile!.consultation_ids.indexOf(s.c.id))||(weeklyLoad(a.person.id,date,working)/Math.max(a.person.weekly_minutes,cadenceWeekCapacity(a.profile,date))-weeklyLoad(b.person.id,date,working)/Math.max(b.person.weekly_minutes,cadenceWeekCapacity(b.profile,date)))||a.person.display_name.localeCompare(b.person.display_name,'es'))}
 // Allocate scarce recurring services first, one place per service before filling second places.
 const recurring=slots.filter(s=>!s.r.monthly)
 for(let level=1;level<=Math.max(0,...recurring.map(s=>s.target));level++){
  const ordered=[...recurring].filter(s=>s.target>=level).sort((a,b)=>available(a,a.dates[0]).length-available(b,b.dates[0]).length||a.dates[0].localeCompare(b.dates[0])||a.c.id.localeCompare(b.c.id))
  for(const s of ordered)fill(s,s.dates[0],level)
 }
 // A monthly service is placed on the date with the best achievable coverage, never once per weekday.
 for(const s of slots.filter(s=>s.r.monthly)){
  if(s.dates.some(d=>coverage(s,d)>=s.target))continue
  const date=[...s.dates].sort((a,b)=>Math.min(s.target,coverage(s,b)+available(s,b).length)-Math.min(s.target,coverage(s,a)+available(s,a).length)||coverage(s,b)-coverage(s,a)||a.localeCompare(b))[0]
  fill(s,date,s.target)
 }
 function fill(s:Slot,date:string,target:number){
  while(coverage(s,date)<target){const candidate=available(s,date)[0];if(!candidate)break
   const preferred=s.r.preferred_staff_ids??(s.c.preferred_staff_id?[s.c.preferred_staff_id]:[]);const secondary=s.r.secondary_staff_ids??s.c.secondary_staff_ids??[];const referenceException=!preferred.includes(candidate.person.id)&&!secondary.includes(candidate.person.id);const reason=preferred.includes(candidate.person.id)?'Profesional habitual de esta regla':secondary.includes(candidate.person.id)?'Alternativa de esta regla':'Cobertura excepcional: no hay habitual/alternativa disponible';const row:SuggestedShift={id:`suggest-${proposed.length}`,professional_id:candidate.person.id,work_date:date,consultation_id:s.c.id,start_time:s.r.start_time,end_time:s.r.end_time,provisional:true,is_extra:false,override_reason:null,notes:null,suggestion_reason:reason,reference_exception:referenceException}
   proposed.push(row);working.push(row)
  }
 }
 proposed.sort((a,b)=>a.work_date.localeCompare(b.work_date)||a.start_time.localeCompare(b.start_time)||a.consultation_id.localeCompare(b.consultation_id)||a.professional_id.localeCompare(b.professional_id))
 return {proposed,warnings,issues:buildCoverageIssues(working,consultations,requests,from,until,exceptions,planning.holidays)}
}
