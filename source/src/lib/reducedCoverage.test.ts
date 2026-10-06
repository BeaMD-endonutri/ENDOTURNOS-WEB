import { describe, expect, it } from 'vitest'
import { buildCoverageIssues, requiredForAlert } from './coverage'
import { suggestMonth, type SuggestionContext } from './suggestions'
import { DEFAULT_PLANNING } from './planningConfig'
import type { CoverageRule } from '../types'

const rule: CoverageRule = {id:'r',weekdays:[4],start_time:'08:00',end_time:'15:00',min_staff:1,every_weeks:1,anchor_date:'2026-09-28',monthly:false,valid_from:'2026-10-01',valid_until:'2026-10-01',suspensions:[],preferred_staff_ids:['daniela'],secondary_staff_ids:['monica']}
function context(training = true): SuggestionContext {
 return {fingerprint:'reduced',planning:DEFAULT_PLANNING,staff:['daniela','monica'].map(id=>({id,user_id:null,display_name:id,username:id,role:'professional',mascot_key:'apple',active:true,weekly_minutes:2100})),
  consultations:['EPA','EDA'].map(id=>({id,label:id,short_label:id,color:'#123456',active:true,coverage_rules:[{...rule,id,...(id==='EPA'?{fallback_min_staff:0}:{})}]})),
  profiles:['daniela','monica'].map(staff_id=>({staff_id,consultation_ids:['EPA','EDA'],work_cadences:[{...rule,id:staff_id}]})),
  assignments:training?[{id:'master',professional_id:'daniela',consultation_id:'FOR',work_date:'2026-10-01',start_time:'08:00',end_time:'15:00',provisional:false}]:[],requests:[],exceptions:[]}
}
describe('reduced coverage with zero minimum',()=>{
 it('keeps EDA covered during Daniela training even when EPA is the personal first choice',()=>{
  const ctx=context();const before=structuredClone(ctx);const result=suggestMonth('2026-10',ctx)
  expect(result.proposed.map(a=>[a.professional_id,a.consultation_id])).toEqual([['monica','EDA']])
  expect(result.issues).toEqual([]);expect(ctx).toEqual(before)
 })
 it('still fills EPA when staff are available',()=>{
  const result=suggestMonth('2026-10',context(false))
  expect(result.proposed.map(a=>a.consultation_id).sort()).toEqual(['EDA','EPA'])
  expect(result.issues).toEqual([])
 })
 it('covers every mandatory place before the first optional EPA place',()=>{
  const ctx=context(false);ctx.consultations[1].coverage_rules![0].min_staff=2
  const result=suggestMonth('2026-10',ctx)
  expect(result.proposed.map(a=>a.consultation_id)).toEqual(['EDA','EDA'])
  expect(result.issues).toEqual([])
 })
 it('does not suppress a missing mandatory EDA or an EPA rule without reduced coverage',()=>{
  const ctx=context();expect(buildCoverageIssues([],ctx.consultations,[],'2026-10-01','2026-10-01').map(i=>i.consultationId)).toEqual(['EDA'])
  delete ctx.consultations[0].coverage_rules![0].fallback_min_staff
  expect(buildCoverageIssues([],ctx.consultations,[],'2026-10-01','2026-10-01')).toHaveLength(2)
 })
 it('accepts zero for monthly rules and keeps positive minimum alerts',()=>{
  const ctx=context();ctx.consultations[0].coverage_rules![0].monthly=true
  expect(buildCoverageIssues([],ctx.consultations.slice(0,1),[],'2026-10-01','2026-10-31')).toEqual([])
  expect(requiredForAlert({...rule,min_staff:2,fallback_min_staff:1})).toBe(1)
  for(const fallback_min_staff of [-1,0.5,2,NaN])expect(requiredForAlert({...rule,fallback_min_staff})).toBe(1)
 })
})
