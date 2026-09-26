import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { addDays, addMonths, endOfMonth, format, getDay, isSameDay, parseISO, startOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { Home, History, AlertTriangle, Bell, CalendarDays, Check, ChevronLeft, ChevronRight, CircleUserRound, ClipboardList, Clock3, LogOut, Megaphone, Menu, Pencil, Plus, RefreshCw, Sparkles, Trash2, Users, Volume2, X } from 'lucide-react'
import { CONSULTATIONS, DEMO_STAFF, HOLIDAYS, MASCOTS } from './data/constants'
import { buildDemoSchedule } from './data/demoSchedule'
import { buildCoverageIssues, type CoverageIssue } from './lib/coverage'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import type { CoverageProfile, AssignmentHistory, Assignment, Consultation, MascotKey, PersonalTask, RequestStatus, RequestType, ShiftRequest, Staff, TeamBroadcast } from './types'

import ConsultationManager from './components/ConsultationManager'
import SupervisorHome from './components/SupervisorHome'
import ShiftEditor, { type AssignmentDraft, type ShiftSelection } from './components/ShiftEditor'
import CalendarPanel from './components/CalendarPanel'
import RequestsPanel from './components/RequestsPanel'
import HistoryPanel from './components/HistoryPanel'
import CoveragePreferences from './components/CoveragePreferences'
import type { CopyPreviewRow } from './lib/planning'

type View = 'home' | 'history' | 'calendar' | 'broadcasts' | 'requests' | 'tasks' | 'team' | 'profile'
const todayIso = format(new Date(), 'yyyy-MM-dd')
const REQUEST_LABELS: Record<RequestType, string> = {
  vacation: 'Vacaciones', permission: 'Permiso', swap: 'Cambio con una compañera',
  preference: 'Día u horario preferente', correction: 'Corrección de una asignación',
}
const PERMANENT_DELETE_PROMPT = '¿seguro que quieres eliminar esto permanentemente?'

async function playBell() {
  const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextClass) return false
  const context = new AudioContextClass()
  try {
    if (context.state === 'suspended') await context.resume()
    if (context.state !== 'running') { await context.close(); return false }
    const start = context.currentTime
    ;[[659.25, 0], [880, 0.13]].forEach(([frequency, delay]) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.value = frequency
      gain.gain.setValueAtTime(0.0001, start + delay)
      gain.gain.exponentialRampToValueAtTime(0.12, start + delay + 0.015)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + delay + 0.24)
      oscillator.connect(gain).connect(context.destination)
      oscillator.start(start + delay)
      oscillator.stop(start + delay + 0.25)
    })
    window.setTimeout(() => { void context.close() }, 550)
    return true
  } catch {
    await context.close().catch(() => undefined)
    return false
  }
}

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [demo, setDemo] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  if (loading) return <Splash />
  if (!session && !demo) return <AuthScreen onDemo={() => setDemo(true)} />
  return <Workspace session={session} demo={demo} onExitDemo={() => setDemo(false)} />
}

function Splash() {
  return <main className="center-page"><div className="splash-mark"><img src={`${import.meta.env.BASE_URL}mascots/apple.png`} alt="" /><span>EndoTurnos</span></div></main>
}

function AuthScreen({ onDemo }: { onDemo: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [mascot, setMascot] = useState<MascotKey>('apple')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setMessage(''); setBusy(true)
    if (!supabase) { setMessage('La conexión segura todavía no está configurada. Puedes abrir la demostración.'); setBusy(false); return }
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setMessage('No hemos podido iniciar sesión. Revisa el usuario y la contraseña.')
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}${import.meta.env.BASE_URL}`,
          data: { full_name: name, username, mascot_key: mascot },
        },
      })
      setMessage(error ? error.message : 'Registro enviado. Revisa tu correo si se solicita confirmación.')
    }
    setBusy(false)
  }

  return <main className="auth-page">
    <section className="auth-story">
      <div className="brand-pill"><Sparkles size={16} /> EndoTurnos</div>
      <h1>El cuadrante,<br /><em>sin enredos.</em></h1>
      <p>Turnos, solicitudes y tareas del equipo de Endonutrición, siempre al día.</p>
      <div className="mascot-cluster">{MASCOTS.map((m, i) => <img key={m.key} src={m.src} alt={m.name} style={{ '--i': i } as React.CSSProperties} />)}</div>
    </section>
    <section className="auth-card">
      <div className="auth-tabs"><button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Entrar</button><button className={mode === 'signup' ? 'active' : ''} onClick={() => setMode('signup')}>Registrarme</button></div>
      <div className="auth-heading"><h2>{mode === 'login' ? '¡Hola de nuevo!' : 'Crea tu espacio'}</h2><p>{mode === 'login' ? 'Accede con tu usuario y contraseña.' : 'Elige también quién te dará la bienvenida.'}</p></div>
      <form onSubmit={submit}>
        {mode === 'signup' && <><label>Nombre completo<input required value={name} onChange={e => setName(e.target.value)} placeholder="Nombre Apellidos" /></label><label>Nombre de usuario<input required value={username} onChange={e => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))} placeholder="usuario" /></label></>}
        <label>Usuario (correo)<input required type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="nombre@hospital.es" /></label>
        <label>Contraseña<input required minLength={8} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 8 caracteres" /></label>
        {mode === 'signup' && <MascotPicker value={mascot} onChange={setMascot} compact />}
        {message && <p className="form-message">{message}</p>}
        <button className="primary wide" disabled={busy}>{busy ? <RefreshCw className="spin" size={18} /> : mode === 'login' ? 'Entrar en EndoTurnos' : 'Crear mi cuenta'}</button>
      </form>
      {!isSupabaseConfigured && <button className="text-button" onClick={onDemo}>Ver demostración interactiva</button>}
    </section>
  </main>
}

function Workspace({ session, demo, onExitDemo }: { session: Session | null; demo: boolean; onExitDemo: () => void }) {
  const [staff, setStaff] = useState<Staff[]>(demo ? DEMO_STAFF : [])
  const [consultations, setConsultations] = useState<Consultation[]>(demo ? CONSULTATIONS : [])
  const [assignments, setAssignments] = useState<Assignment[]>(demo ? buildDemoSchedule : [])
  const [requests, setRequests] = useState<ShiftRequest[]>([])
  const [tasks, setTasks] = useState<PersonalTask[]>([])
  const [broadcasts, setBroadcasts] = useState<TeamBroadcast[]>([])
  const [view, setView] = useState<View>('home')
  const [calendarFocusDate, setCalendarFocusDate] = useState<string | null>(null)
  const [coverageProfiles, setCoverageProfiles] = useState<CoverageProfile[]>([])
  const [history, setHistory] = useState<AssignmentHistory[]>([])
  const [shiftSelection, setShiftSelection] = useState<ShiftSelection | null>(null)
  const [requestFocus, setRequestFocus] = useState<string | null>(null)
  const [loadError, setLoadError] = useState('')
  const [taskComposerNonce, setTaskComposerNonce] = useState(0)
  const [mobileNav, setMobileNav] = useState(false)
  const [syncedAt, setSyncedAt] = useState<Date>(new Date())
  const [dataLoaded, setDataLoaded] = useState(demo)
  const [profile, setProfile] = useState<Staff | null>(demo ? { ...DEMO_STAFF[0], role: 'supervisor', user_id: 'demo' } : null)
  const previousUnread = useRef<Set<string>>(new Set())

  const loadData = useCallback(async () => {
    if (!supabase || demo || !session) return
    const [s, c, a, r, t, b, h, cp] = await Promise.all([
      supabase.from('et_staff').select('*').order('display_name'),
      supabase.from('et_consultations').select('*').eq('active', true).order('sort_order'),
      supabase.from('et_assignments').select('*').gte('work_date', '2026-10-01').lte('work_date', '2026-12-31'),
      supabase.from('et_requests').select('*').order('created_at', { ascending: false }),
      supabase.from('et_tasks').select('*').order('task_date'),
      supabase.from('et_broadcasts').select('id,title,message,created_by,created_at,et_broadcast_recipients(staff_id,read_at)').order('created_at', { ascending: false }),
      supabase.from('et_assignment_history').select('*').order('changed_at', { ascending: false }).limit(100),
      supabase.from('et_staff_coverage').select('*'),
    ])
    const failed = [s,c,a,r,t,b,h,cp].find(result => result.error)
    if (failed?.error) { setLoadError('No se han podido actualizar todos los datos. Pulsa Reintentar.'); return }
    setLoadError('')
    if (cp.data) setCoverageProfiles(cp.data as CoverageProfile[])
    if (h.data) setHistory(h.data as AssignmentHistory[])
    if (s.data) { setStaff(s.data as Staff[]); setProfile((s.data as Staff[]).find(p => p.user_id === session.user.id) ?? null) }
    if (c.data) setConsultations(c.data as Consultation[])
    if (a.data) setAssignments(a.data as Assignment[])
    if (r.data) setRequests(r.data as ShiftRequest[])
    if (t.data) setTasks(t.data as PersonalTask[])
    if (b.data) setBroadcasts(b.data as TeamBroadcast[])
    setSyncedAt(new Date())
    setDataLoaded(true)
  }, [demo, session])

  useEffect(() => { loadData() }, [loadData])
  useEffect(() => {
    if (!supabase || demo || !session) return
    const client = supabase
    const channel = client.channel('endoturnos-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'et_assignments' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'et_consultations' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'et_staff' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'et_staff_coverage' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'et_assignment_history' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'et_requests' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'et_tasks' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'et_broadcasts' }, loadData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'et_broadcast_recipients' }, loadData)
      .subscribe()
    return () => { client.removeChannel(channel) }
  }, [demo, loadData, session])

  const broadcastNotificationIds = profile ? broadcasts.filter(b => b.et_broadcast_recipients.some(r => r.staff_id === profile.id && !r.read_at)).map(b => b.id) : []
  const requestNotificationIds = profile ? requests.filter(request => profile.role === 'supervisor'
    ? !request.supervisor_seen_at
    : request.professional_id === profile.id && !request.professional_seen_at).map(request => request.id) : []
  const notificationIds = [...broadcastNotificationIds.map(id => `broadcast:${id}`), ...requestNotificationIds.map(id => `request:${id}`)]
  useEffect(() => {
    if (!dataLoaded) return
    const current = new Set(notificationIds)
    const hasNew = notificationIds.some(id => !previousUnread.current.has(id))
    let cancelled = false
    let retry: (() => void) | undefined
    if (hasNew) {
      void playBell().then(played => {
        if (played || cancelled) return
        retry = () => { void playBell(); window.removeEventListener('pointerdown', retry!); window.removeEventListener('keydown', retry!) }
        window.addEventListener('pointerdown', retry, { once: true })
        window.addEventListener('keydown', retry, { once: true })
      })
    }
    previousUnread.current = current
    return () => { cancelled = true; if (retry) { window.removeEventListener('pointerdown', retry); window.removeEventListener('keydown', retry) } }
  }, [dataLoaded, notificationIds.join('|')])

  if (!dataLoaded) return loadError ? <main className="center-page"><section className="panel"><p>{loadError}</p><button className="primary" onClick={loadData}>Reintentar</button></section></main> : <Splash />
  if (!profile && !demo) return <PendingAccess onLogout={() => supabase?.auth.signOut()} />
  const activeProfile = profile!
  const isSupervisor = activeProfile.role === 'supervisor'
  const mascot = MASCOTS.find(m => m.key === activeProfile.mascot_key) ?? MASCOTS[0]
  const todayAssignments = assignments.filter(a => a.professional_id === activeProfile.id && a.work_date === todayIso)
  const unreadBroadcasts = broadcastNotificationIds.length
  const unreadRequests = requestNotificationIds.length
  const unreadTotal = unreadBroadcasts + unreadRequests
  const coverageIssues = isSupervisor ? buildCoverageIssues(assignments, consultations, requests) : []
  const topNotificationTotal = unreadTotal + coverageIssues.length
  const nav = [
    ...(isSupervisor ? [['home', Home, 'Inicio']] : []),
    ['calendar', CalendarDays, 'Cuadrante'], ['broadcasts', Megaphone, 'Avisos'], ['requests', Bell, 'Solicitudes'], ['tasks', ClipboardList, 'Mis tareas'], ['profile', CircleUserRound, 'Mi ficha'],
    ...(isSupervisor ? [['team', Users, 'Equipo y consultas'], ['history', History, 'Historial']] : []),
  ] as Array<[View, typeof CalendarDays, string]>

  const addHistory = (before: Assignment | null, after: Assignment | null) => setHistory(rows => [{id:crypto.randomUUID(), assignment_id:(after??before)!.id,action:!before?'INSERT':!after?'DELETE':'UPDATE',actor_name:activeProfile.display_name,changed_at:new Date().toISOString(),before_data:before,after_data:after},...rows])
  const saveAssignment = async (next: AssignmentDraft): Promise<string | null> => {
    if (demo) { const before=assignments.find(a=>a.id===next.id)??null; const row={...next,id:next.id??crypto.randomUUID(),updated_at:new Date().toISOString()}; setAssignments(prev=>before?prev.map(a=>a.id===row.id?row:a):[...prev,row]);addHistory(before,row);return null }
    const {error}=await supabase!.rpc('et_save_assignment',{p_data:next,p_id:next.id??null,p_expected_updated_at:next.updated_at??null});if(error)return error.code==='23505'?'Ya existe ese turno para esta persona. Edita la asignación existente.':error.message;await loadData();return null
  }
  const removeAssignment = async (a: Assignment): Promise<string | null> => {
    if (demo) {setAssignments(prev=>prev.filter(row=>row.id!==a.id));addHistory(a,null);return null}
    const {error}=await supabase!.rpc('et_delete_assignment',{p_id:a.id,p_expected_updated_at:a.updated_at});if(error)return error.message;await loadData();return null
  }
  const undoAssignment = async (h: AssignmentHistory, reason: string | null): Promise<string | null> => {
    if(demo){const current=assignments.find(a=>a.id===h.assignment_id)??null;const restored=h.before_data?{...h.before_data,override_reason:reason}:null;setAssignments(rows=>[...rows.filter(a=>a.id!==h.assignment_id),...(restored?[restored]:[])]);addHistory(current,restored);return null}
    const {error}=await supabase!.rpc('et_undo_assignment',{p_history_id:h.id,p_reason:reason});if(error)return error.message;await loadData();return null
  }
  const copyAssignments = async (rows: CopyPreviewRow[], reviewed: boolean): Promise<string | null> => {
    if(demo){const next=rows.map(r=>({...r.target,id:crypto.randomUUID(),updated_at:new Date().toISOString()}));setAssignments(items=>[...items,...next]);next.forEach(a=>addHistory(null,a));return null}
    const {error}=await supabase!.rpc('et_copy_assignments',{p_rows:rows.map(r=>({source_id:r.source.id,source_updated_at:r.source.updated_at,target_date:r.target.work_date,accept_review:reviewed}))});if(error)return error.message;await loadData();return null
  }
  const openCalendar = (date:string) => {setCalendarFocusDate(date);setView('calendar')}
  const openRequest = (id?:string) => {setRequestFocus(id??null);setView('requests')}

  return <div className="app-shell">
    <aside className={mobileNav ? 'sidebar open' : 'sidebar'}>
      <div className="brand"><span className="brand-icon"><Clock3 /></span><div><strong>EndoTurnos</strong><small>Endonutrición</small></div></div>
      <nav>{nav.map(([key, Icon, label]) => <button key={key} className={(view === 'home' && !isSupervisor ? 'calendar' : view) === key ? 'active' : ''} onClick={() => { setView(key); setMobileNav(false) }}><Icon size={19} />{label}{key === 'broadcasts' && unreadBroadcasts > 0 && <b>{unreadBroadcasts}</b>}{key === 'requests' && unreadRequests > 0 && <b>{unreadRequests}</b>}</button>)}</nav>
      <div className="sidebar-bottom"><div className="mini-profile"><img src={mascot.src} alt="" /><div><strong>{activeProfile.display_name}</strong><small>{isSupervisor ? 'Supervisora' : 'Profesional'}</small></div></div><button className="icon-button" title="Cerrar sesión" onClick={() => demo ? onExitDemo() : supabase?.auth.signOut()}><LogOut size={18} /></button></div>
    </aside>
    <main className={`main-content ${isSupervisor ? 'supervisor-workspace' : ''}`}>
      {loadError && <div role="alert" className="form-message">{loadError}<button className="soft-button" onClick={loadData}>Reintentar</button></div>}
      <header className="topbar"><button aria-label="Abrir menú" className="menu-button" onClick={() => setMobileNav(v => !v)}><Menu /></button><div className="sync"><span></span>Actualizado al instante · {format(syncedAt, 'HH:mm')}</div><div className="top-actions"><button className="icon-button notification-button" title="Notificaciones" onClick={() => { if (isSupervisor) { setView('home') } else setView(unreadRequests > 0 && unreadBroadcasts === 0 ? 'requests' : 'broadcasts') }}><Bell size={19} />{topNotificationTotal > 0 && <b>{topNotificationTotal}</b>}</button><button className="avatar-button" title="Mi perfil" onClick={() => setView('profile')}><img src={mascot.src} alt={mascot.name} /></button></div></header>
      <Welcome profile={activeProfile} mascot={mascot} todayAssignments={todayAssignments} consultations={consultations} onAddTask={() => { setTaskComposerNonce(value => value + 1); setView('tasks') }} />
      {isSupervisor && view !== 'home' && coverageIssues.length > 0 && <CoverageAlert issues={coverageIssues} onOpen={() => setView('home')} />}
      {unreadTotal > 0 && <div className="notification-strip" aria-label="Notificaciones nuevas">{unreadBroadcasts > 0 && view !== 'broadcasts' && <button className="unread-banner" onClick={() => setView('broadcasts')}><Megaphone size={18} /><span>{unreadBroadcasts === 1 ? '1 aviso nuevo' : `${unreadBroadcasts} avisos nuevos`}</span><strong>Ver avisos</strong></button>}{unreadRequests > 0 && view !== 'requests' && <button className="unread-banner request-alert" onClick={() => setView('requests')}><Bell size={18} /><span>{unreadRequests === 1 ? '1 solicitud nueva' : `${unreadRequests} solicitudes nuevas`}</span><strong>Ver solicitudes</strong></button>}</div>}
      {view === 'home' && isSupervisor && <SupervisorHome staff={staff} consultations={consultations} assignments={assignments} requests={requests} issues={coverageIssues} profile={activeProfile} onAssign={setShiftSelection} onCalendar={openCalendar} onRequest={openRequest} onBroadcast={()=>setView('broadcasts')} onTeam={()=>setView('team')} />}
      {(view === 'calendar' || (view === 'home' && !isSupervisor)) && <CalendarPanel staff={staff.filter(s=>s.active&&s.role==='professional')} assignments={assignments} consultations={consultations} profile={activeProfile} isSupervisor={isSupervisor} issues={coverageIssues} focusDate={calendarFocusDate} onSelect={setShiftSelection} requests={requests} coverageProfiles={coverageProfiles} syncedAt={syncedAt} onCopy={copyAssignments} onRequest={id=>openRequest(id)} />}
      {view === 'broadcasts' && <BroadcastsView broadcasts={broadcasts} staff={staff} profile={activeProfile} isSupervisor={isSupervisor} demo={demo} onChange={setBroadcasts} reload={loadData} />}
      {view === 'requests' && <RequestsPanel requests={requests} unreadIds={requestNotificationIds} staff={staff} profile={activeProfile} isSupervisor={isSupervisor} demo={demo} onChange={setRequests} reload={loadData} assignments={assignments} focusId={requestFocus} />}
      {view === 'history' && isSupervisor && <HistoryPanel history={history} staff={staff} consultations={consultations} assignments={assignments} requests={requests} onUndo={undoAssignment} />}
      {shiftSelection && <ShiftEditor selection={shiftSelection} staff={staff} assignments={assignments} requests={requests} consultations={consultations} editable={isSupervisor} coverageProfiles={coverageProfiles} onClose={()=>setShiftSelection(null)} onSave={saveAssignment} onRemove={removeAssignment} />}
      {view === 'tasks' && <TasksView tasks={tasks} profile={activeProfile} demo={demo} focusNonce={taskComposerNonce} onChange={setTasks} reload={loadData} />}
      {view === 'team' && isSupervisor && <TeamView coverageProfiles={coverageProfiles} onCoverageChange={setCoverageProfiles} staff={staff} consultations={consultations} demo={demo} onChange={setStaff} onConsultationsChange={setConsultations} reload={loadData} />}
      {view === 'profile' && <ProfileView coverageProfile={coverageProfiles.find(p=>p.staff_id===activeProfile.id)} onCoverageChange={setCoverageProfiles} consultations={consultations} profile={activeProfile} demo={demo} onUpdated={(key) => { setProfile(p => p ? { ...p, mascot_key: key } : p); setStaff(p => p.map(s => s.id === activeProfile.id ? { ...s, mascot_key: key } : s)) }} reload={loadData} />}
    </main>
  </div>
}

function Welcome({ profile, mascot, todayAssignments, consultations, onAddTask }: { profile: Staff; mascot: (typeof MASCOTS)[number]; todayAssignments: Assignment[]; consultations: Consultation[]; onAddTask: () => void }) {
  const summary = todayAssignments.length ? todayAssignments.map(a => `${consultations.find(c => c.id === a.consultation_id)?.label ?? a.consultation_id} · ${a.start_time.slice(0, 5)}–${a.end_time.slice(0, 5)}`).join(' · ') : 'Hoy no tienes consulta asignada.'
  return <section className="welcome-card"><img src={mascot.src} alt={mascot.name} /><div><span>{mascot.greeting}</span><h2>Hola, {profile.display_name.split(' ')[0].toLocaleLowerCase('es').replace(/^./, s => s.toUpperCase())}</h2><p>{profile.role === 'supervisor' ? 'Tu equipo, sus turnos y lo pendiente de resolver.' : <><strong>Hoy:</strong> {summary}</>}</p></div><button className="soft-button" onClick={onAddTask}><Plus size={17} /> Añadir tarea</button></section>
}

function CoverageAlert({ issues, onOpen }: { issues: CoverageIssue[]; onOpen: (date: string) => void }) {
  const critical = issues.filter(issue => issue.severity === 'critical').length
  const first = issues[0]
  return <button className="coverage-banner" onClick={() => onOpen(first.date)}><span className="coverage-banner-icon"><AlertTriangle size={20} /></span><span><strong>{issues.length} {issues.length === 1 ? 'incidencia de cobertura' : 'incidencias de cobertura'}</strong><small>{critical ? `${critical} consultas sin cubrir. ` : ''}{first.title} · {format(parseISO(first.date), 'd MMM', { locale: es })}</small></span><b>Ver pendientes</b></button>
}

function BroadcastsView({ broadcasts, staff, profile, isSupervisor, demo, onChange, reload }: { broadcasts: TeamBroadcast[]; staff: Staff[]; profile: Staff; isSupervisor: boolean; demo: boolean; onChange: React.Dispatch<React.SetStateAction<TeamBroadcast[]>>; reload: () => void }) {
  const professionals = staff.filter(person => person.role === 'professional' && person.active)
  const [title, setTitle] = useState('Recordatorio')
  const [message, setMessage] = useState('')
  const [selected, setSelected] = useState<Set<string>>(() => new Set(professionals.map(person => person.id)))
  const [feedback, setFeedback] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)

  const toggleRecipient = (id: string) => setSelected(current => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const selectEveryone = () => setSelected(new Set(professionals.map(person => person.id)))
  const resetForm = () => { setEditingId(null); setTitle('Recordatorio'); setMessage(''); setSelected(new Set(professionals.map(person => person.id))); setFeedback('') }
  const editBroadcast = (item: TeamBroadcast) => { setEditingId(item.id); setTitle(item.title); setMessage(item.message); setSelected(new Set(item.et_broadcast_recipients.map(recipient => recipient.staff_id))); setFeedback(''); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setFeedback('')
    const recipientIds = [...selected]
    if (!recipientIds.length) { setFeedback('Elige al menos a una persona.'); return }
    if (demo) {
      if (editingId) onChange(current => current.map(item => item.id === editingId ? { ...item, title: title.trim(), message: message.trim(), et_broadcast_recipients: recipientIds.map(staff_id => ({ staff_id, read_at: null })) } : item))
      else { const next: TeamBroadcast = { id: crypto.randomUUID(), title: title.trim() || 'Recordatorio', message: message.trim(), created_by: profile.user_id ?? 'demo', created_at: new Date().toISOString(), et_broadcast_recipients: recipientIds.map(staff_id => ({ staff_id, read_at: null })) }; onChange(current => [next, ...current]) }
    } else {
      const { error } = editingId
        ? await supabase!.rpc('et_update_broadcast', { p_broadcast_id: editingId, p_title: title, p_message: message, p_recipient_ids: recipientIds })
        : await supabase!.rpc('et_create_broadcast', { p_title: title, p_message: message, p_recipient_ids: recipientIds })
      if (error) { setFeedback('No se ha podido enviar el aviso. Inténtalo de nuevo.'); return }
      await reload()
    }
    resetForm()
  }
  const markRead = async (broadcastId: string) => {
    if (demo) onChange(current => current.map(item => item.id === broadcastId ? { ...item, et_broadcast_recipients: item.et_broadcast_recipients.map(recipient => recipient.staff_id === profile.id ? { ...recipient, read_at: new Date().toISOString() } : recipient) } : item))
    else { await supabase!.from('et_broadcast_recipients').update({ read_at: new Date().toISOString() }).eq('broadcast_id', broadcastId).eq('staff_id', profile.id); await reload() }
  }
  const removeBroadcast = async (broadcastId: string) => {
    if (!window.confirm(PERMANENT_DELETE_PROMPT)) return
    if (demo) onChange(current => current.filter(item => item.id !== broadcastId))
    else {
      const { error } = isSupervisor
        ? await supabase!.from('et_broadcasts').delete().eq('id', broadcastId)
        : await supabase!.from('et_broadcast_recipients').delete().eq('broadcast_id', broadcastId).eq('staff_id', profile.id)
      if (!error) await reload()
    }
    if (editingId === broadcastId) resetForm()
  }

  return <section className="content-section"><div className="section-heading"><div><span className="eyebrow">Comunicación del equipo</span><h1>Avisos y recordatorios</h1><p>Los mensajes aparecen al instante y la campanita suena cuando EndoTurnos está abierto.</p></div><button className="soft-button" onClick={playBell}><Volume2 size={17} /> Probar campanita</button></div>{isSupervisor && <form className={`panel broadcast-form ${editingId ? 'editing' : ''}`} onSubmit={submit}><div className="request-form-heading"><div><h2><Megaphone /> {editingId ? 'Editar aviso' : 'Nuevo aviso'}</h2><p>Selecciona a todo el equipo o sólo a las personas que deban recibirlo.</p></div>{editingId && <button type="button" className="text-button inline" onClick={resetForm}><X size={16} /> Cancelar</button>}</div><div className="broadcast-fields"><label>Título<input required maxLength={120} value={title} onChange={event => setTitle(event.target.value)} /></label><label>Mensaje<textarea required minLength={3} maxLength={1200} value={message} onChange={event => setMessage(event.target.value)} placeholder="Escribe aquí el recordatorio…" /></label></div><div className="recipient-heading"><strong>Destinatarios · {selected.size}</strong><button type="button" className="text-button inline" onClick={selectEveryone}>Todo el equipo</button></div><div className="recipient-picker">{professionals.map(person => <label key={person.id} className={selected.has(person.id) ? 'selected' : ''}><input type="checkbox" checked={selected.has(person.id)} onChange={() => toggleRecipient(person.id)} /><img src={MASCOTS.find(mascot => mascot.key === person.mascot_key)?.src} alt="" /><span>{person.display_name}</span></label>)}</div>{feedback && <p className="form-message">{feedback}</p>}<button className="primary" disabled={!message.trim() || !selected.size}>{editingId ? <Pencil size={17} /> : <Megaphone size={17} />} {editingId ? 'Guardar cambios' : 'Enviar aviso'}</button></form>}<div className="broadcast-list">{broadcasts.map(item => { const ownRecipient = item.et_broadcast_recipients.find(recipient => recipient.staff_id === profile.id); const unread = Boolean(ownRecipient && !ownRecipient.read_at); const recipients = item.et_broadcast_recipients.map(recipient => staff.find(person => person.id === recipient.staff_id)?.display_name).filter(Boolean); return <article className={`panel broadcast-card ${unread ? 'unread' : ''}`} key={item.id}><div className="broadcast-icon"><Bell /></div><div><div className="broadcast-meta"><span>{unread ? 'Nuevo' : 'Aviso'}</span><time>{format(parseISO(item.created_at), "d MMM · HH:mm", { locale: es })}</time></div><h2>{item.title}</h2><p>{item.message}</p>{isSupervisor && <small>Para: {recipients.length === professionals.length ? 'todo el equipo' : recipients.join(', ')}</small>}</div><div className="card-actions">{unread && <button className="soft-button" onClick={() => markRead(item.id)}><Check size={16} /> Leído</button>}{isSupervisor && <button className="icon-action edit" title="Editar aviso" onClick={() => editBroadcast(item)}><Pencil size={16} /> Editar</button>}<button className="icon-action delete" title={isSupervisor ? 'Eliminar aviso para todos' : 'Eliminar aviso'} onClick={() => removeBroadcast(item.id)}><Trash2 size={16} /> Eliminar</button></div></article> })}{!broadcasts.length && <div className="empty-state panel"><Megaphone /><p>Todavía no hay avisos.</p></div>}</div></section>
}

function TasksView({ tasks, profile, demo, focusNonce, onChange, reload }: { tasks: PersonalTask[]; profile: Staff; demo: boolean; focusNonce: number; onChange: React.Dispatch<React.SetStateAction<PersonalTask[]>>; reload: () => void }) {
  const [title, setTitle] = useState(''); const [date, setDate] = useState(todayIso); const [editingId, setEditingId] = useState<string | null>(null)
  const taskInput = useRef<HTMLInputElement>(null)
  useEffect(() => { if (focusNonce > 0) taskInput.current?.focus() }, [focusNonce])
  const own = tasks.filter(t => t.professional_id === profile.id)
  const reset = () => { setTitle(''); setDate(todayIso); setEditingId(null) }
  const save = async (e: React.FormEvent) => { e.preventDefault(); if (editingId) { const content = { task_date: date, title: title.trim() }; if (demo) onChange(p => p.map(task => task.id === editingId ? { ...task, ...content } : task)); else { await supabase?.from('et_tasks').update(content).eq('id', editingId); await reload() } reset(); return } const row = { professional_id: profile.id, task_date: date, title: title.trim(), completed: false }; if (demo) onChange(p => [...p, { ...row, id: crypto.randomUUID() }]); else { await supabase?.from('et_tasks').insert(row); await reload() } reset() }
  const editTask = (task: PersonalTask) => { setEditingId(task.id); setTitle(task.title); setDate(task.task_date); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  const removeTask = async (id: string) => { if (!window.confirm(PERMANENT_DELETE_PROMPT)) return; if (demo) onChange(p => p.filter(task => task.id !== id)); else { await supabase?.from('et_tasks').delete().eq('id', id); await reload() } if (editingId === id) reset() }
  const toggle = async (t: PersonalTask) => { if (demo) onChange(p => p.map(x => x.id === t.id ? { ...x, completed: !x.completed } : x)); else { await supabase?.from('et_tasks').update({ completed: !t.completed }).eq('id', t.id); reload() } }
  return <section className="content-section"><div className="section-heading"><div><span className="eyebrow">Tu recordatorio personal</span><h1>Tareas pendientes</h1><p>Sólo tú puedes ver, editar y eliminar estas tareas.</p></div></div><form className={`quick-task panel ${editingId ? 'editing' : ''}`} onSubmit={save}><input ref={taskInput} required value={title} onChange={e => setTitle(e.target.value)} placeholder="Escribe una tarea pendiente…" /><input required type="date" value={date} onChange={e => setDate(e.target.value)} /><button className="primary">{editingId ? <Pencil /> : <Plus />} {editingId ? 'Guardar' : 'Añadir'}</button>{editingId && <button type="button" className="soft-button" onClick={reset}><X size={16} /> Cancelar</button>}</form><div className="task-days">{[...new Set(own.map(t => t.task_date))].sort().map(day => <section className="panel" key={day}><h2>{format(parseISO(day), "EEEE d 'de' MMMM", { locale: es })}</h2>{own.filter(t => t.task_date === day).map(t => <div className={`task-row ${t.completed ? 'done' : ''}`} key={t.id}><input aria-label={`Completar ${t.title}`} type="checkbox" checked={t.completed} onChange={() => toggle(t)} /><span>{t.title}</span><div className="inline-actions"><button className="icon-action edit" title="Editar tarea" onClick={() => editTask(t)}><Pencil size={15} /> Editar</button><button className="icon-action delete" title="Eliminar tarea" onClick={() => removeTask(t.id)}><Trash2 size={15} /> Eliminar</button></div></div>)}</section>)}{!own.length && <div className="empty-state"><ClipboardList /><p>Añade tu primera tarea del mes.</p></div>}</div></section>
}

function TeamView({ coverageProfiles, onCoverageChange, staff, consultations, demo, onChange, onConsultationsChange, reload }: { coverageProfiles: CoverageProfile[]; onCoverageChange: React.Dispatch<React.SetStateAction<CoverageProfile[]>>; staff: Staff[]; consultations: Consultation[]; demo: boolean; onChange: React.Dispatch<React.SetStateAction<Staff[]>>; onConsultationsChange: React.Dispatch<React.SetStateAction<Consultation[]>>; reload: () => void }) {
  const [selectedPerson, setSelectedPerson] = useState<Staff | null>(null)
  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Staff['role']>('professional')
  const [mascot, setMascot] = useState<MascotKey>('apple')
  const [pendingAccounts, setPendingAccounts] = useState<Array<{ user_id: string; email: string; full_name: string | null; username: string | null; created_at: string }>>([])
  const [teamFeedback, setTeamFeedback] = useState('')

  const loadPendingAccounts = useCallback(async () => {
    if (demo || !supabase) return
    const { data, error } = await supabase.rpc('et_list_unlinked_accounts')
    if (error) {
      setTeamFeedback('No se han podido cargar las cuentas pendientes.')
      return
    }
    setPendingAccounts((data ?? []) as typeof pendingAccounts)
  }, [demo])

  useEffect(() => { void loadPendingAccounts() }, [loadPendingAccounts])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    setTeamFeedback('')
    const id = crypto.randomUUID()
    const row = { id, display_name: name.toUpperCase(), username, role, mascot_key: mascot, active: true, weekly_minutes: role === 'supervisor' ? 0 : 2100, user_id: null }
    if (demo) onChange(p => [...p, row])
    else {
      const { error } = await supabase!.from('et_staff').insert(row)
      if (error) {
        setTeamFeedback('No se ha podido añadir el perfil. Revisa que el usuario no esté repetido.')
        return
      }
      await supabase!.from('et_invitations').insert({ email: email.toLowerCase(), staff_id: id })
      await reload()
      await loadPendingAccounts()
    }
    setName('')
    setUsername('')
    setEmail('')
    setRole('professional')
  }

  const linkAccount = async (person: Staff, userId: string) => {
    if (demo) return
    setTeamFeedback('')
    const { error } = await supabase!.rpc('et_link_account', { p_staff_id: person.id, p_user_id: userId })
    if (error) {
      setTeamFeedback(error.message)
      return
    }
    await reload()
    await loadPendingAccounts()
    setTeamFeedback('Cuenta vinculada con ' + person.display_name + '.')
  }

  const removePerson = async (person: Staff) => {
    if (!window.confirm('¿Eliminar permanentemente el perfil de ' + person.display_name + '? Esta opción solo se permite si todavía no tiene una cuenta vinculada ni datos de trabajo asociados.')) return
    setTeamFeedback('')
    if (demo) {
      onChange(rows => rows.filter(row => row.id !== person.id))
      return
    }
    const { error } = await supabase!.rpc('et_delete_staff_profile', { p_staff_id: person.id })
    if (error) {
      setTeamFeedback(error.message)
      return
    }
    if (selectedPerson?.id === person.id) setSelectedPerson(null)
    await reload()
    await loadPendingAccounts()
    setTeamFeedback('Perfil de ' + person.display_name + ' eliminado.')
  }

  const toggleActive = async (person: Staff) => {
    setTeamFeedback('')
    if (demo) {
      onChange(rows => rows.map(row => row.id === person.id ? { ...row, active: !row.active } : row))
      return
    }
    const { error } = await supabase!.rpc('et_set_staff_active', { p_staff_id: person.id, p_active: !person.active })
    if (error) {
      setTeamFeedback(error.message)
      return
    }
    await reload()
    setTeamFeedback(person.active ? person.display_name + ' ha quedado fuera del equipo activo.' : person.display_name + ' vuelve a estar activo.')
  }

  return <section className="content-section">
    <div className="section-heading"><div><span className="eyebrow">Administración</span><h1>Equipo y consultas</h1><p>Vincula las cuentas registradas con su ficha, edita coberturas y gestiona quién forma parte del equipo.</p></div></div>
    {teamFeedback && <p className="form-message">{teamFeedback}</p>}

    {!demo && pendingAccounts.length > 0 && <section className="panel">
      <div className="request-form-heading"><div><h2><Users /> Cuentas pendientes de vincular</h2><p>Estas personas ya se han registrado. Elige la ficha correcta para darles acceso sin crear un perfil duplicado.</p></div></div>
      <div className="broadcast-list">
        {pendingAccounts.map(account => <article className="broadcast-card" key={account.user_id}>
          <div><h3>{account.full_name || account.email}</h3><p>{account.email}{account.username ? ' · @' + account.username : ''}</p></div>
          <div className="card-actions">
            <select aria-label={'Vincular ' + account.email} defaultValue="" onChange={event => {
              const person = staff.find(row => row.id === event.target.value)
              if (person) void linkAccount(person, account.user_id)
              event.currentTarget.value = ''
            }}>
              <option value="" disabled>Vincular con…</option>
              {staff.filter(person => !person.user_id && person.active).map(person => <option key={person.id} value={person.id}>{person.display_name} · @{person.username}</option>)}
            </select>
          </div>
        </article>)}
      </div>
    </section>}

    <ConsultationManager consultations={consultations} demo={demo} onChange={onConsultationsChange} reload={reload} />

    <div className="team-grid">{staff.map(s => <article className={'person-card' + (s.active ? '' : ' inactive')} key={s.id}>
      <img src={MASCOTS.find(m => m.key === s.mascot_key)?.src} alt="" />
      <div>
        <h3>{s.display_name}</h3>
        <p>@{s.username}</p>
        <span>{s.role === 'supervisor' ? 'Supervisora' : 'Enfermera/o'} · {s.user_id ? 'Acceso activo' : 'Sin cuenta vinculada'}{!s.active ? ' · Baja del equipo' : ''}</span>
        <div className="inline-actions">
          {s.role === 'professional' && <button className="soft-button" onClick={() => setSelectedPerson(s)}>Ver ficha personal</button>}
          {!s.user_id && s.role !== 'supervisor' && <button className="icon-action delete" title="Eliminar perfil" onClick={() => void removePerson(s)}><Trash2 size={15} /> Eliminar</button>}
          {s.role !== 'supervisor' && <button className="icon-action edit" title={s.active ? 'Desactivar perfil' : 'Reactivar perfil'} onClick={() => void toggleActive(s)}>{s.active ? 'Desactivar' : 'Reactivar'}</button>}
        </div>
      </div>
    </article>)}</div>

    {selectedPerson && <div className="modal-backdrop"><div className="modal wide-modal" role="dialog" aria-modal="true" aria-label="Ficha de profesional"><button className="modal-close" aria-label="Cerrar ficha" onClick={() => setSelectedPerson(null)}><X /></button><h2>{selectedPerson.display_name}</h2><CoveragePreferences key={selectedPerson.id} person={selectedPerson} consultations={consultations} profile={coverageProfiles.find(p => p.staff_id === selectedPerson.id)} demo={demo} onChange={onCoverageChange} reload={reload} /></div></div>}

    <form className="panel add-person" onSubmit={add}>
      <h2><CircleUserRound /> Añadir perfil</h2>
      <p>Úsalo para incorporar a alguien que todavía no se haya registrado. Si ya aparece arriba como cuenta pendiente, vincúlala en lugar de crear otro perfil.</p>
      <div className="form-grid">
        <label>Nombre<input required value={name} onChange={e => setName(e.target.value)} /></label>
        <label>Usuario<input required value={username} onChange={e => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))} /></label>
        <label>Correo de acceso<input required type="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label>Tipo de perfil<select value={role} onChange={e => setRole(e.target.value as Staff['role'])}><option value="professional">Enfermera/o</option><option value="supervisor">Supervisora</option></select></label>
      </div>
      <MascotPicker value={mascot} onChange={setMascot} compact />
      <button className="primary"><Plus /> Añadir e invitar</button>
    </form>
  </section>
}

function ProfileView({ coverageProfile, onCoverageChange, consultations, profile, demo, onUpdated, reload }: { coverageProfile?: CoverageProfile; onCoverageChange: React.Dispatch<React.SetStateAction<CoverageProfile[]>>; consultations: Consultation[]; profile: Staff; demo: boolean; onUpdated: (key: MascotKey) => void; reload: () => void }) {
  const [personalTab, setPersonalTab] = useState<'coverage'|'mascot'>(profile.role==='professional'?'coverage':'mascot')
  const [mascot, setMascot] = useState<MascotKey>(profile.mascot_key)
  const [saved, setSaved] = useState(false)
  const save = async () => {
    if (!demo) {
      const { error } = await supabase!.from('et_staff').update({ mascot_key: mascot, first_login_completed: true }).eq('id', profile.id)
      if (error) return
      await reload()
    }
    onUpdated(mascot); setSaved(true); window.setTimeout(() => setSaved(false), 2200)
  }
  const selected = MASCOTS.find(m => m.key === mascot) ?? MASCOTS[0]
  return <section className="content-section"><div className="section-heading"><div><span className="eyebrow">Tu espacio</span><h1>Mi ficha personal</h1><p>Tu mascota y las consultas que puedes cubrir.</p></div></div>{profile.role==='professional'&&<div className="segmented personal-tabs"><button className={personalTab==='coverage'?'active':''} onClick={()=>setPersonalTab('coverage')}>Mis consultas</button><button className={personalTab==='mascot'?'active':''} onClick={()=>setPersonalTab('mascot')}>Mi mascota</button></div>}{personalTab==='coverage'&&profile.role==='professional'?<CoveragePreferences person={profile} consultations={consultations} profile={coverageProfile} demo={demo} onChange={onCoverageChange} reload={reload}/>:<div className="profile-layout"><div className="panel profile-preview"><img src={selected.src} alt={selected.name} /><span>{selected.greeting}</span><h2>{profile.display_name}</h2><p>@{profile.username} · {profile.role === 'supervisor' ? 'Supervisora' : 'Profesional'}</p></div><div className="panel"><h2>Elige tu compañera</h2><MascotPicker value={mascot} onChange={setMascot} /><button className="primary" onClick={save}>{saved ? <><Check /> Guardado</> : 'Guardar mascota'}</button></div></div>}</section>
}

function MascotPicker({ value, onChange, compact = false }: { value: MascotKey; onChange: (m: MascotKey) => void; compact?: boolean }) {
  return <fieldset className={`mascot-picker ${compact ? 'compact' : ''}`}><legend>Elige tu mascota</legend><div>{MASCOTS.map(m => <button type="button" key={m.key} className={value === m.key ? 'selected' : ''} onClick={() => onChange(m.key)}><img src={m.src} alt="" /><span>{m.name}</span>{value === m.key && <Check size={15} />}</button>)}</div></fieldset>
}

function PendingAccess({ onLogout }: { onLogout: () => void }) {
  return <main className="center-page"><section className="pending-card"><img src={`${import.meta.env.BASE_URL}mascots/puffin.png`} alt="" /><h1>Tu acceso está casi listo</h1><p>La supervisora debe vincular tu cuenta con la plantilla antes de mostrarte el cuadrante.</p><button className="soft-button" onClick={onLogout}><LogOut /> Cerrar sesión</button></section></main>
}

export default App
