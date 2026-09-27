import {expect,it} from 'vitest'
import {buildCoverageIssues} from './coverage'
import {defaultCoverageRules} from './scheduling'
import type {Assignment,Consultation,CoverageException} from '../types'
const rule=defaultCoverageRules('PLANTA')[0]
const c:Consultation={id:'PLANTA',label:'Planta',short_label:'PL',color:'#123',active:true,coverage_rules:[rule]}
const row:Assignment={id:'a',professional_id:'p',work_date:'2026-10-01',consultation_id:'PLANTA',start_time:'08:00',end_time:'15:00',provisional:false}
const exception:CoverageException={id:'e',work_date:row.work_date,consultation_id:'PLANTA',rule_id:rule.id,rule_snapshot:rule,reason:'No hay personal disponible',created_by:'s',created_by_name:'Supervisora',created_at:'2026-09-27T10:00:00Z',revoked_at:null}
const issues=(rows:Assignment[],ex:CoverageException[]=[],consultation=c)=>buildCoverageIssues(rows,[consultation],[],row.work_date,row.work_date,ex)
it('resolves only the authorised date and rule while one nurse covers the whole slot',()=>{
 expect(issues([row])[0].exceptionRule).toEqual(rule)
 expect(issues([row],[exception])).toEqual([])
 expect(issues([row],[{...exception,work_date:'2026-10-02'}])).toHaveLength(1)
 expect(issues([row],[{...exception,revoked_at:'2026-09-27T11:00:00Z'}])).toHaveLength(1)
 const reordered=Object.fromEntries(Object.entries(rule).reverse()) as typeof rule
 expect(issues([row],[{...exception,rule_snapshot:reordered}])).toEqual([])
})
it('reopens zero or partial coverage, absences and modified rules',()=>{
 expect(issues([],[exception])[0].severity).toBe('critical')
 expect(issues([{...row,end_time:'11:00'}],[exception])[0].exceptionRule).toBeUndefined()
 expect(issues([row],[exception],{...c,coverage_rules:[{...rule,min_staff:3}]})).toHaveLength(1)
 expect(issues([row],[exception],{...c,coverage_rules:[{...rule,end_time:'14:00'}]})).toHaveLength(1)
 expect(buildCoverageIssues([row],[c],[{id:'r',professional_id:'p',request_type:'permission',date_from:row.work_date,date_to:row.work_date,status:'approved',details:'',created_at:''}],row.work_date,row.work_date,[exception])[0].severity).toBe('critical')
})
