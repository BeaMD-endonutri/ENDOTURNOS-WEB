// @vitest-environment jsdom
import {act,useState} from 'react'
import {createRoot} from 'react-dom/client'
import {expect,it} from 'vitest'
import WorkCadences from './WorkCadences'
import type {WorkCadence} from '../types'
it('adds and removes a separate recurring rest while preserving work availability',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true
 let rules:WorkCadence[]=[]
 function Editor(){const [value,set]=useState<WorkCadence[]>([]);rules=value;return <WorkCadences value={value} onChange={set}/>}
 const host=document.createElement('div');const root=createRoot(host)
 await act(async()=>root.render(<Editor/>))
 const click=async(text:string)=>act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent===text)!.click())
 await click('Añadir franja de disponibilidad')
 await click('Añadir descanso recurrente')
 expect(rules).toHaveLength(2)
 expect(rules[1]).toMatchObject({kind:'rest',weekdays:[3],every_weeks:4,start_time:'00:00',end_time:'23:59'})
 expect(host.textContent).toContain('Fecha de una semana de descanso')
 expect(host.querySelectorAll('fieldset.rest-cadence')).toHaveLength(1)
 await click('Quitar descanso')
 expect(rules).toHaveLength(1);expect(rules[0].kind).toBe('work')
 await act(async()=>root.unmount())
})
