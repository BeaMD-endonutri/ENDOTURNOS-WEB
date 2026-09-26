import { describe, expect, it } from 'vitest'
import type { Assignment, Consultation, CoverageRule, ShiftRequest } from '../types'
import { buildCoverageIssues } from './coverage'
import { assignmentConflicts } from './scheduling'
const consultation: Consultation={id:'PLANTA',label:'Planta',short_label:'PL',color:'#3a7d63',active:true}
const row=(id:string,p:string,date='2026-10-01',c='PLANTA',start='08:00',end='15:00'):Assignment=>({id,professional_id:p,work_date:date,consultation_id:c,start_time:start,end_time:end,provisional:false})
const forDay=(rows:Assignment[],c:Consultation=consultation,requests:ShiftRequest[]=[])=>buildCoverageIssues(rows,[c],requests,'2026-10-01','2026-10-01')
const custom:CoverageRule={id:'custom',weekdays:[4],start_time:'08:00',end_time:'15:00',min_staff:2,every_weeks:1,anchor_date:'2026-09-28',monthly:false,valid_from:'2026-10-01',valid_until:'2026-12-31',suspensions:[]}
const absent:ShiftRequest={id:'r1',professional_id:'p1',request_type:'vacation',date_from:'2026-10-01',date_to:'2026-10-01',details:'Vacaciones',status:'approved',created_at:'2026-09-25'}
describe('coverage requirements',()=>{
 it('distinguishes empty Planta, one nurse and two nurses',()=>{expect(forDay([])[0].severity).toBe('critical');expect(forDay([row('a','p1')])[0].title).toBe('Planta con una sola enfermera');expect(forDay([row('a','p1'),row('b','p2')])).toEqual([])})
 it('never counts duplicate assignments as two professionals',()=>{expect(forDay([row('a','p1'),row('b','p1')])).toHaveLength(1)})
 it('detects partial gaps, and accepts continuous split cover',()=>{expect(forDay([row('a','p1'),row('b','p2',undefined,undefined,'08:00','11:00')])).toHaveLength(1);expect(forDay([row('a','p1'),row('b','p2',undefined,undefined,'08:00','11:00'),row('c','p3',undefined,undefined,'11:00','15:00')])).toEqual([])})
 it('does not count a professional with an approved absence',()=>{expect(forDay([row('a','p1'),row('b','p2')],consultation,[absent])).toHaveLength(1)})
 it('supports new consultations and configurable staffing',()=>{const c={...consultation,id:'NEW',coverage_rules:[custom]};expect(forDay([],c)[0].consultationId).toBe('NEW');expect(forDay([row('a','p1',undefined,'NEW'),row('b','p2',undefined,'NEW')],c)).toEqual([])})
 it('does not require coverage on holidays or outside validity',()=>{expect(buildCoverageIssues([],[consultation],[],'2026-10-12','2026-10-12')).toEqual([]);expect(forDay([],{...consultation,coverage_rules:[{...custom,valid_from:'2026-11-01'}]})).toEqual([])})
 it('suspends only the configured slot and flags work there',()=>{const r={...custom,start_time:'15:00',end_time:'20:00',suspensions:[{from:'2026-10-01',to:'2026-10-01'}]};const c={...consultation,coverage_rules:[r]};expect(forDay([],c)).toEqual([]);expect(forDay([row('a','p1')],c)).toEqual([]);expect(forDay([row('a','p1',undefined,undefined,'15:00','20:00')],c)[0].kind).toBe('suspended')})
 it('honours fortnightly anchors',()=>{const c={...consultation,coverage_rules:[{...custom,every_weeks:2,anchor_date:'2026-10-05'}]};expect(forDay([],c)).toEqual([]);expect(buildCoverageIssues([],[c],[],'2026-10-08','2026-10-08')).toHaveLength(1)})
 it('requires one fully staffed monthly session on eligible weekdays',()=>{const c={...consultation,coverage_rules:[{...custom,monthly:true}]};expect(buildCoverageIssues([],[c],[],'2026-10-01','2026-10-31')).toHaveLength(1);expect(buildCoverageIssues([row('a','p1'),row('b','p2')],[c],[],'2026-10-01','2026-10-31')).toEqual([])})
 it('counts a configured alternative consultation',()=>{expect(forDay([row('a','p1',undefined,'PAAF')],{...consultation,coverage_rules:[{...custom,min_staff:1,alternatives:['PAAF']}]})).toEqual([])})
})
describe('scheduling conflicts',()=>{
 it('detects overlap but accepts adjacent shifts and editing the same row',()=>{const a=row('a','p1');expect(assignmentConflicts(row('b','p1',undefined,'HDD'),[a],[],[consultation])).toHaveLength(1);expect(assignmentConflicts(row('b','p1',undefined,'HDD','15:00','20:00'),[a],[],[consultation])).toEqual([]);expect(assignmentConflicts(a,[a],[],[consultation])).toEqual([])})
 it('detects approved absences, not pending or rejected requests',()=>{expect(assignmentConflicts(row('a','p1'),[],[absent],[consultation])).toHaveLength(1);expect(assignmentConflicts(row('a','p1'),[],[{...absent,status:'pending'}],[consultation])).toEqual([])})
})
