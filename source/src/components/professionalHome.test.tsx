// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import ProfessionalHome from './ProfessionalHome'
import { CONSULTATIONS, DEMO_STAFF } from '../data/constants'
import type { Assignment, ShiftRequest, TeamBroadcast } from '../types'
let root:Root;let host:HTMLDivElement
const person=DEMO_STAFF[0]
const assignment=(id:string,date:string,professional=person.id):Assignment=>({id,professional_id:professional,work_date:date,consultation_id:'EN1',start_time:'08:00:00',end_time:'15:00:00',provisional:false})
const request=(id:string,status:ShiftRequest['status']='pending',professional=person.id):ShiftRequest=>({id,professional_id:professional,request_type:'permission',date_from:'2026-10-05',date_to:'2026-10-05',status,details:'Prueba',created_at:'2026-10-01T08:00:00Z'})
const notice=(id:string,staff=person.id,read:string|null=null):TeamBroadcast=>({id,title:id,message:'Aviso',created_by:'supervisor',created_at:'2026-10-01T08:00:00Z',et_broadcast_recipients:[{staff_id:staff,read_at:read}]})
async function render(overrides:Partial<React.ComponentProps<typeof ProfessionalHome>>={}) {
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true
 const props={profile:person,publishedAssignments:[],consultations:CONSULTATIONS,requests:[],broadcasts:[],today:'2026-10-05',onCalendar:vi.fn(),onRequest:vi.fn(),onBroadcasts:vi.fn(),...overrides}
 host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(<ProfessionalHome {...props}/>));return props
}
async function click(text:string){const b=[...host.querySelectorAll('button')].find(b=>b.textContent?.includes(text));expect(b).toBeTruthy();await act(async()=>b!.click())}
afterEach(async()=>{if(root)await act(async()=>root.unmount());host?.remove()})
it('shows only own published shifts in date order, with working calendar links',async()=>{
 const props=await render({publishedAssignments:[assignment('future2','2026-10-08'),assignment('other','2026-10-05','another-person'),assignment('today','2026-10-05'),assignment('future1','2026-10-06'),assignment('old','2026-10-02')]})
 expect(host.querySelectorAll('.personal-today .personal-shift')).toHaveLength(1)
 expect([...host.querySelectorAll('.personal-next-day h3')].map(x=>x.textContent)).toEqual(['martes 6 de octubre','jueves 8 de octubre'])
 await click('Mi cuadrante');expect(props.onCalendar).toHaveBeenCalledWith('2026-10-05')
 await act(async()=>host.querySelector<HTMLButtonElement>('.personal-next-day .personal-shift')!.click());expect(props.onCalendar).toHaveBeenLastCalledWith('2026-10-06')
})
it('counts only unread notices for this person and separates pending requests from responses',async()=>{
 const props=await render({requests:[request('pending'),request('approved','approved'),request('other','pending','other-person')],broadcasts:[notice('Para ti'),notice('Ya leído',person.id,'2026-10-02'),notice('Para otra','another-person')]})
 expect(host.querySelector('#personal-notices-title .personal-count')?.textContent).toBe('1')
 expect(host.querySelector('#personal-requests-title .personal-count')?.textContent).toBe('1')
 expect(host.textContent).not.toContain('Para otra');expect(host.textContent).not.toContain('Ya leído')
 expect(host.textContent).toContain('una respuesta sin leer')
 await click('Leer avisos pendientes');expect(props.onBroadcasts).toHaveBeenCalledOnce()
 await act(async()=>host.querySelector<HTMLButtonElement>('.personal-request-list button')!.click());expect(props.onRequest).toHaveBeenCalledWith('pending')
 await click('una respuesta sin leer');expect(props.onRequest).toHaveBeenLastCalledWith('approved')
})
it('explains an out-of-period day and approved absences without hiding published shifts',async()=>{
 const props=await render({today:'2026-09-27'});expect(host.textContent).toContain('fuera del periodo disponible');await click('Mi cuadrante');expect(props.onCalendar).toHaveBeenCalledWith('2026-10-01')
 await act(async()=>root.render(<ProfessionalHome {...props} today="2026-10-05" publishedAssignments={[assignment('today','2026-10-05')]} requests={[request('absence','approved')]}/>))
 expect(host.textContent).toContain('Permiso aprobado');expect(host.textContent).toContain('estos turnos siguen en el cuadrante publicado');expect(host.querySelectorAll('.personal-today .personal-shift')).toHaveLength(1)
})
