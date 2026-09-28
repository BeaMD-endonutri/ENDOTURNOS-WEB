// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {act} from 'react'
import {createRoot,type Root} from 'react-dom/client'
import App from '../App'
import PasswordRecovery,{RECOVERY_KEY} from './PasswordRecovery'
const auth=vi.hoisted(()=>({getSession:vi.fn(),onAuthStateChange:vi.fn(),resetPasswordForEmail:vi.fn(),updateUser:vi.fn()}))
vi.mock('../lib/supabase',()=>({supabase:{auth},isSupabaseConfigured:true}))
let root:Root,host:HTMLDivElement,listener:(event:string,session:any)=>void
const click=async(text:string)=>{await act(async()=>{const b=[...host.querySelectorAll('button')].find(b=>b.textContent?.trim()===text);if(!b)throw Error(text);b.click()})}
const input=async(index:number,value:string)=>{await act(async()=>{const el=host.querySelectorAll('input')[index];Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}))})}
const submit=async()=>{await act(async()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))}
beforeEach(()=>{
 (globalThis as any).IS_REACT_ACT_ENVIRONMENT=true;vi.clearAllMocks();sessionStorage.clear();window.history.replaceState({},'','/');
 auth.getSession.mockResolvedValue({data:{session:null},error:null});auth.onAuthStateChange.mockImplementation(fn=>{listener=fn;return {data:{subscription:{unsubscribe:vi.fn()}}}})
 auth.resetPasswordForEmail.mockResolvedValue({data:{},error:null});auth.updateUser.mockResolvedValue({data:{},error:null})
 host=document.createElement('div');document.body.append(host);root=createRoot(host)
})
afterEach(async()=>{await act(async()=>root.unmount());host.remove();sessionStorage.clear();window.history.replaceState({},'','/')})
it('requests recovery for the entered email, without requiring a password',async()=>{
 await act(async()=>root.render(<App/>));await click('¿Has olvidado tu contraseña?');expect(host.querySelector('input[type=password]')).toBeNull()
 await input(0,'persona@example.com');await submit()
 expect(auth.resetPasswordForEmail).toHaveBeenCalledWith('persona@example.com',{redirectTo:expect.stringMatching(/^http.*\/$/)})
 expect(host.textContent).toContain('Si ese correo tiene una cuenta');await click('Volver al acceso');expect(host.querySelector('input[type=password]')).not.toBeNull()
})
it('opens the new-password screen on recovery, checks confirmation, and updates only the authenticated user',async()=>{
 await act(async()=>root.render(<App/>));await act(async()=>listener('PASSWORD_RECOVERY',{user:{id:'recovered-user',email:'persona@example.com'}}))
 expect(sessionStorage.getItem(RECOVERY_KEY)).toBe('recovered-user');expect(host.textContent).toContain('Nueva contraseña')
 await input(0,'NewPassword123!');await input(1,'DifferentPassword123!');await submit();expect(auth.updateUser).not.toHaveBeenCalled();expect(host.textContent).toContain('no coinciden')
 await input(1,'NewPassword123!');await submit();expect(auth.updateUser).toHaveBeenCalledWith({password:'NewPassword123!'});expect(host.textContent).toContain('Contraseña actualizada');expect(sessionStorage.getItem(RECOVERY_KEY)).toBeNull()
})
it('does not permit a password change from an expired link',async()=>{
 window.history.replaceState({},'','/#error=access_denied&error_code=otp_expired')
 await act(async()=>root.render(<App/>));expect(host.textContent).toContain('ha caducado');expect(host.querySelector('form')).toBeNull();await click('Volver al acceso');expect(host.textContent).toContain('¿Has olvidado tu contraseña?');expect(window.location.hash).toBe('');expect(auth.updateUser).not.toHaveBeenCalled()
})
it('keeps a failed password update available for retry',async()=>{
 auth.updateUser.mockResolvedValue({error:{code:'weak_password'}})
 await act(async()=>root.render(<PasswordRecovery valid onClose={()=>{}}/>));await input(0,'NewPassword123!');await input(1,'NewPassword123!');await submit()
 expect(host.textContent).toContain('no cumple los requisitos');expect(host.textContent).not.toContain('Contraseña actualizada');expect(host.querySelector('button')!.disabled).toBe(false)
})
