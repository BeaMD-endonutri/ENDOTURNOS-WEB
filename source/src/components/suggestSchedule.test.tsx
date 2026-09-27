// @vitest-environment jsdom
import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {expect,it,vi} from 'vitest'
import SuggestSchedule from './SuggestSchedule'
import {DEFAULT_PLANNING} from '../lib/planningConfig'
import type {SuggestionContext} from '../lib/suggestions'
vi.mock('../lib/supabase',()=>({supabase:null}))
it('previews without saving, allows excluding a shift, and saves only the selected draft rows',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true
 const rule={id:'r',weekdays:[1],start_time:'08:00',end_time:'15:00',min_staff:1,every_weeks:1,anchor_date:'2026-10-05',monthly:false,valid_from:'2026-10-01',valid_until:'2026-10-31',suspensions:[]}
 const ctx:SuggestionContext={staff:[{id:'p',display_name:'Persona',user_id:null,username:'p',role:'professional',active:true,weekly_minutes:2100,mascot_key:'apple'}],consultations:[{id:'X',label:'Consulta',short_label:'X',active:true,color:'#123',preferred_staff_id:'p',coverage_rules:[rule]}],profiles:[{staff_id:'p',consultation_ids:['X'],work_cadences:[rule]}],requests:[],assignments:[],exceptions:[],planning:DEFAULT_PLANNING,fingerprint:'demo'}
 const saved=vi.fn().mockResolvedValue(undefined),close=vi.fn();const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
 await act(async()=>root.render(<SuggestSchedule context={ctx} demo month="2026-10" onClose={close} onSaved={saved}/>))
 expect(saved).not.toHaveBeenCalled();expect(host.querySelectorAll('.suggestion-row')).toHaveLength(3)
 await act(async()=>host.querySelector<HTMLInputElement>('.suggestion-row input')!.click())
 expect(host.textContent).toContain('2 turnos propuestos · 1 incidencias pendientes')
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Añadir propuesta al borrador')!.click())
 expect(saved).toHaveBeenCalledTimes(1);expect(saved.mock.calls[0][0]).toHaveLength(2);expect(saved.mock.calls[0][0].every((a:{provisional:boolean})=>a.provisional)).toBe(true)
 expect(host.textContent).toContain('2 turnos añadidos al borrador');expect(host.querySelectorAll('.suggestion-row')).toHaveLength(0)
 await act(async()=>root.unmount());host.remove()
})
