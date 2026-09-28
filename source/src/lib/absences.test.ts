import {describe,it,expect} from 'vitest'
import {workingIntervals} from './absences'
import {assignmentConflicts} from './scheduling'
import {buildCoverageIssues} from './coverage'
import {buildCopyPreview} from './planning'
import {createRotaPdf} from './rotaPdf'
import type {Assignment,Consultation,Staff} from '../types'
const work:Assignment={id:'work',professional_id:'p',work_date:'2026-10-05',consultation_id:'PLANTA',start_time:'08:00',end_time:'20:00',provisional:false}
const person:Staff={id:'p',user_id:null,display_name:'Ana',username:'ana',active:true,role:'professional',mascot_key:'apple',weekly_minutes:2100}
const c:Consultation={id:'PLANTA',label:'Planta',short_label:'PL',color:'#338855',active:true,coverage_rules:[{id:'r',weekdays:[1],start_time:'08:00',end_time:'15:00',min_staff:1,every_weeks:1,anchor_date:'2026-10-05',monthly:false,valid_from:'2026-10-01',valid_until:'2026-10-31',suspensions:[]}]}
describe('scheduled absences',()=>{
 for(const id of ['VAC','PERM','FOR','DESCANSO'])it(`${id} blocks its hours, removes coverage and appears in PDF`,()=>{
  const absence={...work,id:'absence',consultation_id:id,start_time:'10:00',end_time:'12:00'}
  const absenceType={...c,id,label:id,short_label:id,coverage_rules:[]}
  expect(workingIntervals([work,absence]).map(a=>[a.start_time,a.end_time])).toEqual([['08:00','10:00'],['12:00','20:00']])
  expect(assignmentConflicts({...work,id:'new',start_time:'11:00',end_time:'12:00'},[absence],[],[c,absenceType])).toHaveLength(1)
  expect(assignmentConflicts({...work,id:'new',start_time:'15:00',end_time:'20:00'},[absence],[],[c,absenceType])).toHaveLength(0)
  expect(buildCoverageIssues([work,absence],[c,absenceType],[],'2026-10-05','2026-10-05',[],{})).toHaveLength(1)
  const pdf=createRotaPdf('2026-10',[person],[absence],[c,absenceType]);expect(pdf.getNumberOfPages()).toBe(1);const expected=id==='PERM'?'PER':id==='DESCANSO'?'Descanso':id;expect(pdf.output()).toContain(expected)
  const copied=buildCopyPreview([absence],[c,absenceType],[],[{staff_id:'p',consultation_ids:['PLANTA']}],[person],'2026-10-05','2026-10-05','2026-10-06')
  expect(copied[0].blocked).toEqual([])
 })
})
