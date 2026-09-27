import {afterEach,expect,it} from 'vitest'
import {DEFAULT_PLANNING,setPlanning,monthRange,planningMonths,clampDate,validatePlanning} from './planningConfig'
import {buildCoverageIssues} from './coverage'
import {copyRuleCheck} from './planning'
import {defaultCoverageRules} from './scheduling'
import type {Consultation} from '../types'
afterEach(()=>setPlanning(DEFAULT_PLANNING))
it('supports a year boundary, leap-year end and a maximum 24-month window',()=>{
 expect(monthRange('2028-01','2028-02').end_date).toBe('2028-02-29')
 const config={...DEFAULT_PLANNING,...monthRange('2026-12','2027-02')};setPlanning(config)
 expect(planningMonths()).toEqual(['2026-12','2027-01','2027-02']);expect(clampDate('2026-01-01')).toBe('2026-12-01');expect(clampDate('2028-01-01')).toBe('2027-02-28')
 expect(validatePlanning({...config,...monthRange('2026-01','2027-12')})).toBeNull()
 expect(validatePlanning({...config,...monthRange('2026-01','2028-01')})).not.toBeNull()
})
it('uses edited holidays consistently in coverage and copying without extending original rules',()=>{
 const rule={...defaultCoverageRules('PLANTA')[0],valid_until:'2027-12-31'}
 const c:Consultation={id:'PLANTA',label:'Planta',short_label:'PL',color:'#123',active:true,coverage_rules:[rule]}
 setPlanning({...DEFAULT_PLANNING,...monthRange('2027-01','2027-02'),holidays:{'2027-01-06':'Festivo local'}})
 expect(buildCoverageIssues([],[c],[],'2027-01-06','2027-01-06')).toEqual([])
 expect(copyRuleCheck(c,'2027-01-06','08:00','15:00',[c]).blocked).toContain('Festivo: Festivo local')
 expect(copyRuleCheck(c,'2027-01-07','08:00','15:00',[c]).blocked).toEqual([])
 expect(buildCoverageIssues([],[c],[],'2027-01-07','2027-01-07')).toHaveLength(1)
 const old={...c,coverage_rules:defaultCoverageRules('PLANTA')};expect(copyRuleCheck(old,'2027-01-07','08:00','15:00',[old]).review).toHaveLength(1)
})
