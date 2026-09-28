// @vitest-environment jsdom
import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import RequestsPanel from './RequestsPanel'
import ShiftEditor, { type ShiftSelection } from './ShiftEditor'
import { affectedAssignments } from './AbsenceImpact'
import type { Assignment, Consultation, ShiftRequest, Staff } from '../types'
const db=vi.hoisted(()=>({from:vi.fn()}))
vi.mock('../lib/supabase',()=>({supabase:db}))
const staff:Staff[]=[{id:'boss',user_id:'boss-user',display_name:'Supervisora',username:'boss',role:'supervisor',active:true,mascot_key:'apple',weekly_minutes:0},...['Ausente','Sustituta'].map(id=>({id,user_id:id+'-user',display_name:id,username:id,role:'professional' as const,active:true,mascot_key:'apple' as const,weekly_minutes:2100}))]
const consultations:Consultation[]=[{id:'PLANTA',label:'Planta',short_label:'PL',color:'#347049',active:true}]
const request:ShiftRequest={id:'request1',professional_id:'Ausente',created_by:'Ausente-user',request_type:'vacation',date_from:'2026-10-05',date_to:'2026-10-05',status:'pending',details:'Vacaciones solicitadas',created_at:'2026-09-27T07:00:00Z'}
const assignment:Assignment={id:'shift1',professional_id:'Ausente',work_date:'2026-10-05',consultation_id:'PLANTA',start_time:'08:00',end_time:'15:00',provisional:false,updated_at:'2026-09-27T07:00:00Z'}
let root:Root;let host:HTMLDivElement
async function mount(component:React.ReactNode){(globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;Element.prototype.scrollIntoView=vi.fn();host=document.createElement('div');document.body.append(host);root=createRoot(host);await act(async()=>root.render(component))}
const click=async(name:string)=>{await act(async()=>{const b=[...host.querySelectorAll('button')].find(b=>b.textContent?.trim()===name||b.getAttribute('aria-label')===name);if(!b)throw Error(name);b.click()})}
afterEach(async()=>{if(root)await act(async()=>root.unmount());host?.remove();vi.clearAllMocks()})
it('shows impact before approval and reassigns the exact affected shift while tracking the published version',async()=>{
 const saved=vi.fn();const calendar=vi.fn()
 function Flow(){const [requests,setRequests]=useState([request]);const [rows,setRows]=useState([assignment]);const [selection,setSelection]=useState<ShiftSelection|null>(null);return <><RequestsPanel requests={requests} unreadIds={[]} staff={staff} profile={staff[0]} isSupervisor demo onChange={setRequests} reload={()=>{}} assignments={rows} publishedAssignments={[assignment]} consultations={consultations} focusId={null} onCalendar={calendar} onReassign={a=>setSelection({date:a.work_date,personId:a.professional_id,consultationId:a.consultation_id,assignmentId:a.id,findCoverage:true})}/>{selection&&<ShiftEditor selection={selection} staff={staff} assignments={rows} requests={requests} consultations={consultations} editable coverageProfiles={[{staff_id:'Ausente',consultation_ids:['PLANTA']},{staff_id:'Sustituta',consultation_ids:['PLANTA']}]} onClose={()=>setSelection(null)} onRemove={vi.fn()} onSave={async draft=>{saved(draft);const item=Array.isArray(draft)?draft[0]:draft;if(item)setRows(rows=>rows.map(row=>row.id===item.id?{...row,...item}:row));return null}}/>}</>}
 await mount(<Flow/>);expect(host.textContent).toContain('1 turno en borrador');expect(host.querySelector('.request-card .status')!.textContent).toBe('Pendiente')
 await click('Aprobar');expect(host.querySelector('[aria-labelledby="absence-approval-title"]')).not.toBeNull();expect(host.querySelector('.request-card .status')!.textContent).toBe('Pendiente')
 await click('Confirmar aprobación');expect(host.querySelector('.request-card .status')!.textContent).toBe('Aprobada');expect(saved).not.toHaveBeenCalled()
 await click('Buscar cobertura para Planta del 2026-10-05');await click('Reasignar turno a Sustituta')
 expect(saved).toHaveBeenCalledWith(expect.objectContaining({id:'shift1',professional_id:'Sustituta',updated_at:assignment.updated_at}))
 expect(host.querySelector('[aria-label="Gestionar turnos"]')).toBeNull();expect(host.textContent).toContain('Borrador resuelto. Falta publicar los meses afectados.')
 expect(host.textContent).toContain('1 turno en la versión publicada')
 await click('Revisar y publicar octubre');expect(calendar).toHaveBeenCalledWith('2026-10-01')
})
it('includes both boundaries and excludes other people and non-absence requests',()=>{
 const rows=[assignment,{...assignment,id:'after',work_date:'2026-10-07'},{...assignment,id:'end',work_date:'2026-10-06'},{...assignment,id:'other',professional_id:'Sustituta'}]
 expect(affectedAssignments({...request,date_to:'2026-10-06'},rows).map(a=>a.id)).toEqual(['shift1','end'])
 expect(affectedAssignments({...request,request_type:'preference'},rows)).toEqual([])
})
it('does not claim approval when a concurrent change makes the conditional update affect no rows',async()=>{
 const chain={update:vi.fn(),eq:vi.fn(),select:vi.fn().mockResolvedValue({data:[],error:null})};chain.update.mockReturnValue(chain);chain.eq.mockReturnValue(chain);db.from.mockReturnValue(chain)
 const changed=vi.fn();const reload=vi.fn()
 await mount(<RequestsPanel requests={[request]} unreadIds={[]} staff={staff} profile={staff[0]} isSupervisor demo={false} onChange={changed} reload={reload} assignments={[assignment]} publishedAssignments={[assignment]} consultations={consultations} focusId={null}/>)
 await click('Aprobar');await click('Confirmar aprobación')
 expect(chain.eq).toHaveBeenCalledWith('date_from',request.date_from);expect(chain.eq).toHaveBeenCalledWith('status','pending');expect(changed).not.toHaveBeenCalled()
 expect(host.querySelector('.request-card .status')!.textContent).toBe('Pendiente');expect(host.textContent).toContain('La solicitud ha cambiado.')
})
