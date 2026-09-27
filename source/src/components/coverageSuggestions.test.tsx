// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import ShiftEditor from './ShiftEditor'
import type { Assignment, Consultation, ShiftRequest, Staff } from '../types'
const staff:Staff[]=['A','B','C','D'].map(id=>({id,user_id:null,display_name:id,username:id,role:'professional',mascot_key:'apple',active:true,weekly_minutes:2100}))
const consultations:Consultation[]=[{id:'PLANTA',label:'Planta',short_label:'PL',color:'#347049',active:true}]
const profiles=[{staff_id:'A',consultation_ids:['EN1','PLANTA']},{staff_id:'B',consultation_ids:['PLANTA']},{staff_id:'C',consultation_ids:['PLANTA']}]
const assignment:Assignment={id:'b1',professional_id:'B',work_date:'2026-10-05',consultation_id:'PLANTA',start_time:'08:00',end_time:'15:00',provisional:false}
const request:ShiftRequest={id:'r1',professional_id:'C',request_type:'vacation',date_from:'2026-10-05',date_to:'2026-10-05',details:'',status:'approved',created_at:'2026-09-27'}
let root:Root;let host:HTMLDivElement
async function render(onSave:(draft:any)=>Promise<string|null>,date='2026-10-05'){
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;host=document.createElement('div');document.body.append(host);root=createRoot(host)
 await act(async()=>root.render(<ShiftEditor selection={{date,consultationId:'PLANTA',startTime:'08:00',endTime:'15:00',findCoverage:true}} staff={staff} assignments={[assignment]} requests={[request]} consultations={consultations} editable onClose={vi.fn()} onSave={onSave} onRemove={vi.fn()} coverageProfiles={profiles}/>))
}
afterEach(async()=>{if(root)await act(async()=>root.unmount());host?.remove()})
it('opens coverage immediately, explains blocked candidates and saves an available person once to the draft',async()=>{
 let finish!:(value:string|null)=>void;const save=vi.fn(()=>new Promise<string|null>(resolve=>{finish=resolve}))
 await render(save)
 expect(host.querySelector('[aria-label="Recomendaciones de cobertura"]')).not.toBeNull()
 expect(host.querySelectorAll('.coverage-candidate-list article')).toHaveLength(1)
 expect(host.querySelector('.unavailable-candidates')!.textContent).toContain('Coincide con Planta')
 expect(host.querySelector('.unavailable-candidates')!.textContent).toContain('vacaciones o un permiso')
 expect(host.textContent).toContain('1 profesional con ficha pendiente')
 const assign=host.querySelector<HTMLButtonElement>('[aria-label="Asignar a A"]')!
 await act(async()=>{assign.click();assign.click()});expect(save).toHaveBeenCalledTimes(1)
 expect(save).toHaveBeenCalledWith(expect.objectContaining({professional_id:'A',consultation_id:'PLANTA',work_date:'2026-10-05',start_time:'08:00',end_time:'15:00',override_reason:null}))
 expect(assign.disabled).toBe(true)
 await act(async()=>finish(null));expect(host.textContent).toContain('Guardado en borrador')
})
it('blocks direct assignment on holidays without invoking save',async()=>{
 const save=vi.fn().mockResolvedValue(null);await render(save,'2026-10-12')
 expect(host.textContent).toContain('Festivo:')
 expect([...host.querySelectorAll<HTMLButtonElement>('.coverage-candidate-list button')].every(b=>b.disabled)).toBe(true)
 expect(save).not.toHaveBeenCalled()
})
it('reports server conflicts without claiming the turn was assigned',async()=>{
 const save=vi.fn().mockResolvedValue('La disponibilidad ha cambiado en el servidor.');await render(save)
 await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Asignar a A"]')!.click())
 expect(host.querySelector('[role="status"]')!.textContent).toContain('La disponibilidad ha cambiado en el servidor.')
 expect(host.textContent).not.toContain('Turno asignado a')
})
it('requires review for an off-cadence slot and resets it when the date changes',async()=>{
 const save=vi.fn().mockResolvedValue(null);await render(save,'2026-10-11')
 const assign=host.querySelector<HTMLButtonElement>('[aria-label="Asignar a A"]')!
 expect(assign.disabled).toBe(true)
 await act(async()=>host.querySelector<HTMLInputElement>('.coverage-review input')!.click())
 expect(assign.disabled).toBe(false)
 await act(async()=>{const input=host.querySelector<HTMLInputElement>('input[type="date"]')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'2026-10-18');input.dispatchEvent(new Event('input',{bubbles:true}))})
 expect(assign.disabled).toBe(true);expect(save).not.toHaveBeenCalled()
})
it('reassigns the existing turn with its identity instead of creating a duplicate',async()=>{
 const save=vi.fn().mockResolvedValue(null);await render(save)
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent?.trim()==='Editar')!.click())
 await act(async()=>host.querySelector<HTMLButtonElement>('[aria-label="Reasignar turno a A"]')!.click())
 expect(save).toHaveBeenCalledWith(expect.objectContaining({id:'b1',professional_id:'A',work_date:'2026-10-05'}))
 expect(assignment.professional_id).toBe('B')
})
