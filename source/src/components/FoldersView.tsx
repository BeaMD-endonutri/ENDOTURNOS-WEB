import { useEffect, useMemo, useState } from 'react'
import { Check, CheckCheck, CornerUpLeft, ImagePlus, Paperclip, Send, SlidersHorizontal, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { Staff } from '../types'

type FolderMessage = {
  id: string
  recipient_id: string
  sender_id: string
  title: string
  body: string
  created_at: string
  read_at: string | null
  done_at: string | null
  parent_id: string | null
}

type FolderAttachment = {
  id: string
  message_id: string
  storage_path: string
  file_name: string
  mime_type: string
  signed_url?: string
}

const COLORS = ['#8FA77B', '#D4A63C', '#C9827A', '#6F9DC6', '#8E7BB7', '#B89068']

export default function FoldersView({
  profile,
  staff,
  demo,
}: {
  profile: Staff
  staff: Staff[]
  demo: boolean
}) {
  const [view, setView] = useState<'inbox' | 'sent' | 'history'>('inbox')
  const [replyTo, setReplyTo] = useState<FolderMessage | null>(null)
  const [messages, setMessages] = useState<FolderMessage[]>([])
  const [attachments, setAttachments] = useState<FolderAttachment[]>([])
  const [folderColor, setFolderColor] = useState(COLORS[0])
  const [order, setOrder] = useState<'newest' | 'oldest'>('newest')
  const [senderFilter, setSenderFilter] = useState<string[]>([])
  const [composerOpen, setComposerOpen] = useState(false)
  const [recipientId, setRecipientId] = useState('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const team = useMemo(() => staff.filter(person => person.active && person.id !== profile.id), [staff, profile.id])

  const loadFolder = async () => {
    if (demo || !supabase) {
      const sampleSenders = team.slice(0, 3)
      setMessages(sampleSenders.map((sender, index) => ({
        id: `demo-${index}`,
        recipient_id: profile.id,
        sender_id: sender.id,
        title: ['Revisión de consulta EN1', 'Material pendiente', 'Seguimiento de paciente'][index] ?? 'Mensaje pendiente',
        body: [
          'Te derivo esta incidencia para revisar la cobertura del turno de tarde. Cuando puedas, échale un vistazo.',
          'Adjunto la información del material que falta en la consulta de Nutrición para revisarlo esta semana.',
          'Te paso este seguimiento para que quede recogido en tu carpeta y puedas retomarlo cuando corresponda.',
        ][index] ?? '',
        created_at: new Date(Date.now() - index * 86400000).toISOString(),
        read_at: index === 0 ? new Date().toISOString() : null,
        done_at: null,
        parent_id: null,
      })))
      return
    }

    setError('')
    const [{ data: pref, error: prefError }, { data: rows, error: messageError }] = await Promise.all([
      supabase.from('et_folder_preferences').select('folder_color').eq('staff_id', profile.id).maybeSingle(),
      supabase.from('et_folder_messages').select('*').or(`recipient_id.eq.${profile.id},sender_id.eq.${profile.id}`).order('created_at', { ascending: false }),
    ])
    if (prefError || messageError) {
      setError('No se ha podido abrir la carpeta. Inténtalo de nuevo.')
      return
    }
    if (pref?.folder_color) setFolderColor(pref.folder_color)
    const nextMessages = (rows ?? []) as FolderMessage[]
    setMessages(nextMessages)

    if (!nextMessages.length) {
      setAttachments([])
      return
    }
    const { data: attachmentRows, error: attachmentError } = await supabase
      .from('et_folder_attachments')
      .select('*')
      .in('message_id', nextMessages.map(row => row.id))
    if (attachmentError) { setAttachments([]); return }

    const withUrls = await Promise.all(((attachmentRows ?? []) as FolderAttachment[]).map(async attachment => {
      const { data } = await supabase!.storage.from('et-folder-images').createSignedUrl(attachment.storage_path, 3600)
      return { ...attachment, signed_url: data?.signedUrl }
    }))
    setAttachments(withUrls)
  }

  useEffect(() => { void loadFolder() }, [profile.id, demo])

  const visibleMessages = useMemo(() => {
    const rows = messages.filter(message => view === 'sent'
      ? message.sender_id === profile.id
      : message.recipient_id === profile.id && (view === 'history' ? !!message.read_at : !message.read_at))
    const filtered = senderFilter.length && view !== 'sent'
      ? rows.filter(message => senderFilter.includes(message.sender_id))
      : rows
    return [...filtered].sort((a, b) => order === 'newest'
      ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      : new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
  }, [messages, order, senderFilter, view, profile.id])

  const confirm = async (message: FolderMessage, action: 'read' | 'done') => {
    if (message.recipient_id !== profile.id) return
    const stamp = new Date().toISOString()
    if (demo || !supabase) {
      setMessages(current => current.map(row => row.id === message.id
        ? { ...row, read_at: row.read_at ?? stamp, done_at: action === 'done' ? stamp : row.done_at } : row))
      return
    }
    setBusy(true)
    const values = action === 'done'
      ? { read_at: message.read_at ?? stamp, done_at: stamp }
      : { read_at: stamp }
    const { data, error: updateError } = await supabase.from('et_folder_messages')
      .update(values).eq('id', message.id).eq('recipient_id', profile.id).select('*').single()
    setBusy(false)
    if (updateError || !data) {
      setError('No se ha podido guardar la confirmación.')
      return
    }
    setMessages(current => current.map(row => row.id === message.id ? data as FolderMessage : row))
  }

  const openReply = (message: FolderMessage) => {
    const otherId = message.sender_id === profile.id ? message.recipient_id : message.sender_id
    setReplyTo(message)
    setRecipientId(otherId)
    setTitle(message.title.startsWith('Re: ') ? message.title : `Re: ${message.title}`)
    setBody('')
    setFiles([])
    setComposerOpen(true)
  }

  const saveColor = async (color: string) => {
    setFolderColor(color)
    if (demo || !supabase) return
    await supabase.from('et_folder_preferences').upsert({ staff_id: profile.id, folder_color: color })
  }

  const toggleSender = (id: string) => {
    setSenderFilter(current => current.includes(id) ? current.filter(item => item !== id) : [...current, id])
  }

  const resetComposer = () => {
    setReplyTo(null)
    setRecipientId('')
    setTitle('')
    setBody('')
    setFiles([])
    setComposerOpen(false)
    setError('')
  }

  const sendMessage = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!recipientId || !title.trim() || !body.trim()) return
    setBusy(true)
    setError('')

    if (demo || !supabase) {
      resetComposer()
      setBusy(false)
      return
    }

    const { data: created, error: insertError } = await supabase
      .from('et_folder_messages')
      .insert({ recipient_id: recipientId, sender_id: profile.id, title: title.trim(), body: body.trim(), parent_id: replyTo?.id ?? null })
      .select('*')
      .single()

    if (insertError || !created) {
      setError('No se ha podido derivar el mensaje.')
      setBusy(false)
      return
    }

    for (const file of files) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
      const path = `${created.id}/${crypto.randomUUID()}-${safeName}`
      const { error: uploadError } = await supabase.storage.from('et-folder-images').upload(path, file, { contentType: file.type })
      if (!uploadError) {
        await supabase.from('et_folder_attachments').insert({
          message_id: created.id,
          storage_path: path,
          file_name: file.name,
          mime_type: file.type || 'application/octet-stream',
        })
      }
    }

    setMessages(current => [created as FolderMessage, ...current])
    resetComposer()
    setBusy(false)
  }

  return <section className="content-section folders-view">
    <div className="section-heading folder-section-heading">
      <div>
        <span className="eyebrow">Mensajes entre profesionales</span>
        <h1>Mi carpeta</h1>
        <p>Recibe, confirma y responde las notas de tu equipo.</p>
      </div>
      <button className="primary" onClick={() => setComposerOpen(true)}><Send size={17} /> Derivar mensaje</button>
    </div>

    <div className="folder-view-tabs" role="tablist" aria-label="Secciones de la carpeta">
      {([['inbox', 'Pendientes'], ['sent', 'Enviadas'], ['history', 'Historial']] as const).map(([key, label]) =>
        <button key={key} role="tab" aria-selected={view === key} className={view === key ? 'active' : ''} onClick={() => { setView(key); setSenderFilter([]) }}>{label}</button>)}
    </div>
    <div className="folder-toolbar">
      <button type="button" className="soft-button" onClick={() => void loadFolder()}>Actualizar estados</button>
      <label><SlidersHorizontal size={16} /> Ordenar
        <select value={order} onChange={event => setOrder(event.target.value as 'newest' | 'oldest')}>
          <option value="newest">Más nuevos</option>
          <option value="oldest">Más antiguos</option>
        </select>
      </label>
      {view !== 'sent' && <div className="sender-filter">
        <span>Filtrar por remitente</span>
        <div className="sender-filter-chips">
          {staff.filter(person => person.id !== profile.id && messages.some(message => message.sender_id === person.id && message.recipient_id === profile.id)).map(person =>
            <button key={person.id} className={senderFilter.includes(person.id) ? 'active' : ''} onClick={() => toggleSender(person.id)}>
              {person.display_name.split(' ')[0]}
            </button>)}
          {senderFilter.length > 0 && <button className="clear-filter" onClick={() => setSenderFilter([])}>Todos</button>}
        </div>
      </div>}
    </div>

    {error && <div className="form-message">{error}</div>}

    <div className="office-folder" style={{ '--folder-color': folderColor } as React.CSSProperties}>
      <div className="folder-back">
        <div className="folder-tab">Carpeta de {profile.display_name.split(' ')[0]}</div>
        <div className="folder-colors">
          <span>Color</span>
          {COLORS.map(color => <button key={color} aria-label={`Elegir color ${color}`} className={folderColor === color ? 'selected' : ''} style={{ background: color }} onClick={() => void saveColor(color)} />)}
        </div>
      </div>

      <div className="folder-paper-stack" aria-live="polite">
        {visibleMessages.length === 0 ? <div className="folder-empty">
          <strong>{view === 'sent' ? 'Aún no has enviado notas' : view === 'history' ? 'Aún no hay notas confirmadas' : 'No tienes notas pendientes'}</strong>
          <span>{view === 'sent' ? 'Las notas que derives quedarán aquí con su estado.' : view === 'history' ? 'Las notas leídas aparecerán aquí.' : 'Las notas nuevas aparecerán aquí.'}</span>
        </div> : visibleMessages.map((message, index) => {
          const sender = staff.find(person => person.id === message.sender_id)
          const recipient = staff.find(person => person.id === message.recipient_id)
          const parent = messages.find(row => row.id === message.parent_id)
          const messageAttachments = attachments.filter(item => item.message_id === message.id)
          return <article className="folder-sheet" key={message.id} style={{ '--sheet-index': index } as React.CSSProperties}>
            <div className="sheet-date">{new Date(message.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
            <h2>{message.title}</h2>
            <div className="sheet-sender"><span>{sender?.display_name.slice(0, 1) ?? '?'}</span><div><strong>{sender?.display_name ?? 'Profesional'}</strong><small>Para {recipient?.display_name ?? 'Profesional'}</small></div></div>
            {parent && <div className="sheet-reply-context"><CornerUpLeft size={14} /> Respuesta a «{parent.title}»</div>}
            <p>{message.body}</p>
            {messageAttachments.length > 0 && <div className="sheet-attachments">
              {messageAttachments.map(attachment => <figure key={attachment.id}>
                {attachment.signed_url && <img src={attachment.signed_url} alt={attachment.file_name} />}
                <figcaption><Paperclip size={14} /> {attachment.file_name}</figcaption>
              </figure>)}
            </div>}
            <div className="sheet-status">
              <span>{message.done_at ? <><CheckCheck size={16} /> Tarea hecha</> : message.read_at ? <><Check size={16} /> Leída</> : 'Sin leer'}</span>
              {message.read_at && <small>Leída el {new Date(message.read_at).toLocaleString('es-ES')}</small>}
              {message.done_at && <small>Hecha el {new Date(message.done_at).toLocaleString('es-ES')}</small>}
            </div>
            <div className="sheet-actions">
              {message.recipient_id === profile.id && !message.read_at && <button type="button" className="soft-button" disabled={busy} onClick={() => void confirm(message, 'read')}><Check size={16} /> Confirmar lectura</button>}
              {message.recipient_id === profile.id && !message.done_at && <button type="button" className="soft-button" disabled={busy} onClick={() => void confirm(message, 'done')}><CheckCheck size={16} /> Marcar tarea hecha</button>}
              <button type="button" className="soft-button" onClick={() => openReply(message)}><CornerUpLeft size={16} /> Responder</button>
            </div>
          </article>
        })}
      </div>
      <div className="folder-front" />
    </div>

    {composerOpen && <div className="modal-backdrop" role="presentation">
      <form className="folder-composer panel" onSubmit={sendMessage}>
        <button type="button" className="modal-close icon-button" onClick={resetComposer}><X /></button>
        <span className="eyebrow">{replyTo ? 'Respuesta' : 'Nueva hoja'}</span>
        <h2>{replyTo ? `Responder a «${replyTo.title}»` : 'Derivar mensaje'}</h2>
        <label>Enviar a
          <select required disabled={!!replyTo} value={recipientId} onChange={event => setRecipientId(event.target.value)}>
            <option value="">Selecciona profesional</option>
            {team.map(person => <option key={person.id} value={person.id}>{person.display_name}</option>)}
          </select>
        </label>
        <label>Título<input required maxLength={120} value={title} onChange={event => setTitle(event.target.value)} placeholder="Ej. Material pendiente" /></label>
        <label>Mensaje<textarea required maxLength={4000} rows={7} value={body} onChange={event => setBody(event.target.value)} placeholder="Escribe aquí la información que quieres dejar en su carpeta..." /></label>
        <label className="image-picker"><ImagePlus size={18} /> Adjuntar imágenes desde la galería
          <input type="file" accept="image/*" multiple onChange={event => setFiles(Array.from(event.target.files ?? []))} />
        </label>
        {files.length > 0 && <div className="selected-files">{files.map(file => <span key={file.name}>{file.name}</span>)}</div>}
        {error && <p className="form-message">{error}</p>}
        <button className="primary wide" disabled={busy}><Send size={17} /> {busy ? 'Enviando…' : replyTo ? 'Enviar respuesta' : 'Derivar a su carpeta'}</button>
      </form>
    </div>}
  </section>
}
