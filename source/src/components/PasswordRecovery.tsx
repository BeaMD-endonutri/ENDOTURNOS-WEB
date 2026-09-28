import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'

export const RECOVERY_KEY = 'endoturnos-password-recovery'
export function recoveryPending() {
 const params=new URLSearchParams(window.location.hash.slice(1))
 return params.get('type')==='recovery'||params.has('error_code')||sessionStorage.getItem(RECOVERY_KEY)!==null
}
export function clearRecovery() {
 sessionStorage.removeItem(RECOVERY_KEY)
 const url=new URL(window.location.href)
 if(new URLSearchParams(url.hash.slice(1)).has('error_code')||new URLSearchParams(url.hash.slice(1)).get('type')==='recovery')url.hash=''
 window.history.replaceState({},'',url.pathname+url.search+url.hash)
}
export default function PasswordRecovery({valid,onClose}:{valid:boolean;onClose:()=>void}) {
 const [password,setPassword]=useState(''),[confirmation,setConfirmation]=useState('')
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[done,setDone]=useState(false)
 const saving=useRef(false)
 const submit=async(e:React.FormEvent)=>{
  e.preventDefault();if(saving.current||!valid||!supabase)return
  if(password.length<8){setMessage('La contraseña debe tener al menos 8 caracteres.');return}
  if(password!==confirmation){setMessage('Las contraseñas no coinciden.');return}
  saving.current=true;setBusy(true);setMessage('')
  try {
   const {error}=await supabase.auth.updateUser({password})
   if(error){setMessage(error.code==='same_password'?'Elige una contraseña distinta de la anterior.':error.code==='weak_password'?'La contraseña no cumple los requisitos de seguridad. Usa una más larga con letras, números y símbolos.':'No se ha podido cambiar la contraseña. Si el enlace ha caducado, solicita uno nuevo.');return}
   clearRecovery();setPassword('');setConfirmation('');setDone(true)
  }catch{setMessage('No se ha podido conectar. Comprueba tu conexión e inténtalo de nuevo.')}
  finally{saving.current=false;setBusy(false)}
 }
 return <main className="center-page"><section className="auth-card" aria-labelledby="recovery-title"><div className="auth-heading"><h1 id="recovery-title">{done?'Contraseña actualizada':'Nueva contraseña'}</h1><p>{done?'Tu nueva contraseña ya está guardada.':valid?'Escribe y confirma la contraseña que quieres usar en EndoTurnos.':'Este enlace ha caducado o ya no es válido. Vuelve al acceso y solicita otro con tu correo.'}</p></div>
 {valid&&!done&&<form onSubmit={submit}><label>Nueva contraseña<input required type="password" minLength={8} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><label>Repetir contraseña<input required type="password" minLength={8} autoComplete="new-password" value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label>{message&&<p className="form-message" role="alert">{message}</p>}<button className="primary wide" disabled={busy}>{busy?'Guardando…':'Guardar nueva contraseña'}</button></form>}
 <button className="text-button" disabled={busy} onClick={onClose}>{done?'Continuar a EndoTurnos':valid?'Cancelar':'Volver al acceso'}</button></section></main>
}
