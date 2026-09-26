// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import PublicationPanel from './PublicationPanel'
vi.mock('../lib/supabase',()=>({supabase:null}))
it('requires a reviewed confirmation and shows additions and removals before publishing',async()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const publish=vi.fn().mockResolvedValue(null)
 const row={id:'new',professional_id:'staff',work_date:'2026-10-02',consultation_id:'EN1',start_time:'08:00',end_time:'15:00',provisional:false}
 await act(async()=>root.render(<PublicationPanel month="2026-10" isSupervisor draft={[row]} published={[{...row,id:'old'}]} coverageCount={2} demo onPublish={publish}/>))
 expect(host.textContent).toContain('2 cambios pendientes')
 await act(async()=>[...host.querySelectorAll('button')].find(b=>b.textContent?.includes('Revisar y publicar'))!.click())
 const confirm=[...host.querySelectorAll('button')].find(b=>b.textContent==='Publicar cuadrante')!
 expect(confirm.disabled).toBe(true);expect(publish).not.toHaveBeenCalled()
 expect(host.querySelector('[role="dialog"]')?.textContent).toContain('2 incidencias de cobertura')
 await act(async()=>host.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click())
 await act(async()=>confirm.click())
 expect(publish).toHaveBeenCalledWith(expect.objectContaining({added:1,removed:1,changed:0}))
 expect(host.querySelector('[role="dialog"]')).toBeNull();expect(host.textContent).toContain('Cuadrante publicado.')
 await act(async()=>root.unmount());host.remove()
})
