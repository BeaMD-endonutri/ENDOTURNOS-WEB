// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import ConsultationManager from './ConsultationManager'
import type { Consultation, Staff } from '../types'
vi.mock('../lib/supabase',()=>({supabase:null}))

it('enables reduction from one to zero, saves it and retains it when reopened',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host)
 const staff:Staff[]=[{id:'daniela',user_id:null,display_name:'Daniela',username:'daniela',role:'professional',active:true,mascot_key:'apple',weekly_minutes:2100}]
 let consultations:Consultation[]=[{id:'EPA',label:'EPA',short_label:'EPA',active:true,color:'#123456',coverage_rules:[{id:'r',weekdays:[4],start_time:'08:00',end_time:'15:00',min_staff:1,every_weeks:1,anchor_date:'2026-10-01',monthly:false,valid_from:'2026-10-01',valid_until:'2026-12-31',suspensions:[],preferred_staff_ids:['daniela']}]}]
 const render=()=>root.render(<ConsultationManager staff={staff} consultations={consultations} demo onChange={update=>{consultations=typeof update==='function'?update(consultations):update}} reload={()=>{}}/>)
 const edit=()=>[...host.querySelectorAll('button')].find(b=>b.textContent?.includes('Editar'))!.click()
 try{
  await act(async()=>render());await act(async()=>edit())
  await act(async()=>host.querySelector<HTMLButtonElement>('[role="switch"]')!.click())
  const minimum=host.querySelector<HTMLInputElement>('.coverage-minimum-field input')!
  expect(minimum.min).toBe('0');expect(minimum.value).toBe('0');expect(minimum.checkValidity()).toBe(true)
  await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
  expect(consultations[0].coverage_rules![0]).toMatchObject({min_staff:1,fallback_min_staff:0})
  expect(host.querySelector('[role="dialog"]')).toBeNull()
  await act(async()=>render());await act(async()=>edit())
  expect(host.querySelector('[role="switch"]')!.getAttribute('aria-checked')).toBe('true')
  expect(host.querySelector<HTMLInputElement>('.coverage-minimum-field input')!.value).toBe('0')
 }finally{await act(async()=>root.unmount());host.remove()}
})
