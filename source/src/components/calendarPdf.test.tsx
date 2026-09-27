// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest'
import {act} from 'react'
import {createRoot} from 'react-dom/client'
import CalendarPanel from './CalendarPanel'
import {CONSULTATIONS,DEMO_STAFF} from '../data/constants'
import {buildDemoSchedule} from '../data/demoSchedule'

it('downloads personal and team PDFs from a professional profile and retains a fallback link',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true
 const create=vi.fn((_blob:Blob)=> 'blob:test-pdf'); const revoke=vi.fn()
 vi.stubGlobal('URL',Object.assign(URL,{createObjectURL:create,revokeObjectURL:revoke}))
 const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{})
 const host=document.createElement('div'); document.body.append(host);const root=createRoot(host)
 const staff=DEMO_STAFF.filter(s=>s.role==='professional');const profile=staff[0]
 await act(async()=>root.render(<CalendarPanel staff={staff} profile={profile} isSupervisor={false} assignments={buildDemoSchedule()} consultations={CONSULTATIONS} issues={[]} focusDate={null} requests={[]} coverageProfiles={[]} syncedAt={new Date()} onSelect={()=>{}} onCopy={async()=>null} onRequest={()=>{}}/>))
 expect(host.querySelector('select')?.value).toBe(profile.id)
 const download=()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Descargar mes en PDF')!
 await act(async()=>download().click())
 expect(click).toHaveBeenCalledOnce();expect(create.mock.calls[0][0]).toBeInstanceOf(Blob)
 expect(host.querySelector('a[download]')?.getAttribute('download')).toBe('EndoTurnos_2026-10_individual.pdf')
 expect(host.querySelector('a[target="_blank"]')?.getAttribute('href')).toBe('blob:test-pdf')
 await act(async()=>{const select=host.querySelector('select')!;select.value='all';select.dispatchEvent(new Event('change',{bubbles:true}))})
 expect(host.querySelector('a[download]')).toBeNull();expect(revoke).toHaveBeenCalled()
 await act(async()=>download().click())
 expect(host.querySelector('a[download]')?.getAttribute('download')).toBe('EndoTurnos_2026-10_equipo.pdf')
 expect(click).toHaveBeenCalledTimes(2)
 await act(async()=>root.unmount());host.remove()
})
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()})
