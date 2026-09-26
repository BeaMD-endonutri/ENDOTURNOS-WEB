import { supabase } from './supabase'

const PUBLIC_KEY = 'BFyvFcSdQ_cLaTEbrh3LEdxm44gHK-U1PJe-AjaFjI9L8QLPVmIRJpN27jDOvWDq5_a8CBoF8q69fr-zdQbDn3c'
const scope = import.meta.env.BASE_URL

function applicationKey() {
  const padding = '='.repeat((4 - PUBLIC_KEY.length % 4) % 4)
  const binary = atob((PUBLIC_KEY + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(binary, character => character.charCodeAt(0))
}

export function pushAvailable() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export async function getPushSubscription() {
  if (!pushAvailable()) return null
  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.getSubscription()
}

export async function enablePush(userId: string) {
  if (!supabase || !pushAvailable()) throw new Error('Este navegador no permite notificaciones push.')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Activa las notificaciones en los ajustes del móvil para recibir avisos.')
  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()
  if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationKey() })
  const keys = subscription.toJSON().keys
  if (!subscription.endpoint || !keys?.p256dh || !keys?.auth) throw new Error('No se ha podido registrar este dispositivo.')
  const { error } = await supabase.from('et_push_subscriptions').upsert({
    endpoint: subscription.endpoint, user_id: userId, p256dh: keys.p256dh, auth_key: keys.auth, updated_at: new Date().toISOString()
  }, { onConflict: 'endpoint' })
  if (error) throw new Error('No se ha podido guardar la suscripción. Vuelve a intentarlo.')
}

export async function disablePush() {
  const subscription = await getPushSubscription()
  if (!subscription) return
  if (supabase) {
    const { error } = await supabase.from('et_push_subscriptions').delete().eq('endpoint', subscription.endpoint)
    if (error) throw new Error('No se ha podido desactivar la suscripción.')
  }
  await subscription.unsubscribe()
}
