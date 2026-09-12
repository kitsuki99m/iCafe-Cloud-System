import { useState } from 'react'
import { Megaphone, Plus, Trash2, Pencil, CalendarClock } from 'lucide-react'
import Button from '../common/Button.jsx'
import Modal from '../common/Modal.jsx'
import ConfirmModal from '../common/ConfirmModal.jsx'
import { useAppData } from '../../context/AppDataContext.jsx'

const blank = { title:'', message:'', kind:'update', audience:'all' }

export default function AnnouncementCenter() {
  const { announcements = [], createAnnouncement, updateAnnouncement, deleteAnnouncement } = useAppData()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(blank)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  async function publish() {
    if (!draft.title.trim() || !draft.message.trim()) { setError('Add a title and message before publishing.'); return }
    setSaving(true); setError('')
    try { if(editingId) await updateAnnouncement(editingId, draft); else await createAnnouncement(draft); setDraft(blank); setEditingId(null); setOpen(false) } catch (err) { setError(err?.message || 'Unable to save announcement.') } finally { setSaving(false) }
  }

  function edit(item) {
    setDraft({ title:item.title, message:item.message, kind:item.kind, audience:item.audience, startsAt:item.startsAt ? item.startsAt.slice(0,16) : '', endsAt:item.endsAt ? item.endsAt.slice(0,16) : '' })
    setEditingId(item.id)
  }

  function remove(item) {
    setDeleteTarget(item)
  }

  async function confirmRemove() {
    if (!deleteTarget || deleting) return
    setDeleting(true); setError('')
    try {
      await deleteAnnouncement(deleteTarget.id)
      setDeleteTarget(null)
    } catch (err) {
      setError(err?.message || 'Unable to delete announcement.')
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  return <>
    <button type="button" onClick={() => setOpen(true)} className="relative rounded-full p-2 text-slate-soft hover:bg-surface-raised hover:text-ink-900" aria-label="Announcements" title="Announcements">
      <Megaphone size={17} />
      {announcements.length > 0 && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-gold" />}
    </button>
    <Modal open={open} busy={saving} onClose={() => !saving && setOpen(false)} eyebrow="Broadcast Center" title="Announcements" maxWidth="max-w-xl" footer={<><Button variant="ghost" disabled={saving} onClick={() => {setOpen(false);setEditingId(null);setDraft(blank)}}>Close</Button><Button icon={editingId ? Pencil : Plus} variant="primary" disabled={saving} onClick={publish}>{saving ? 'Saving…' : editingId ? 'Save changes' : 'Publish Announcement'}</Button></>}>
      <div className="space-y-4">
        {error && <p className="rounded-lg border border-ember/30 bg-ember/10 px-3 py-2 text-xs text-ember-dim">{error}</p>}
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <input value={draft.title} onChange={(e) => setDraft({ ...draft, title:e.target.value })} placeholder="Announcement title" maxLength={120} className="w-full rounded-lg border border-surface-line bg-ink px-3 py-2.5 text-sm text-ink-900 focus:border-gold/50 focus:outline-none" />
          <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind:e.target.value })} className="rounded-lg border border-surface-line bg-ink px-3 py-2.5 text-sm text-ink-900 focus:border-gold/50 focus:outline-none"><option value="update">Update</option><option value="promo">Promo</option><option value="notice">Notice</option></select>
        </div>
        <textarea value={draft.message} onChange={(e) => setDraft({ ...draft, message:e.target.value })} placeholder="Write the message customers or staff should see…" maxLength={1000} rows={4} className="w-full resize-y rounded-lg border border-surface-line bg-ink px-3 py-2.5 text-sm text-ink-900 focus:border-gold/50 focus:outline-none" />
        <select value={draft.audience} onChange={(e) => setDraft({ ...draft, audience:e.target.value })} className="w-full rounded-lg border border-surface-line bg-ink px-3 py-2.5 text-sm text-ink-900 focus:border-gold/50 focus:outline-none"><option value="all">Everyone</option><option value="customers">Customers only</option><option value="staff">Staff only</option></select>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-xs text-slate-soft">Starts at<input type="datetime-local" value={draft.startsAt||''} onChange={e=>setDraft({...draft,startsAt:e.target.value})} className="mt-1 w-full rounded-lg border border-surface-line bg-ink px-3 py-2 text-xs text-ink-900"/></label><label className="text-xs text-slate-soft">Ends at<input type="datetime-local" value={draft.endsAt||''} onChange={e=>setDraft({...draft,endsAt:e.target.value})} className="mt-1 w-full rounded-lg border border-surface-line bg-ink px-3 py-2 text-xs text-ink-900"/></label></div>
        <div className="border-t border-surface-line pt-3"><p className="eyebrow mb-2">Scheduled and active announcements</p>{announcements.length === 0 ? <p className="text-xs text-slate-soft">No announcements published yet.</p> : <div className="space-y-2">{announcements.map((item) => <div key={item.id} className="flex items-start gap-3 rounded-lg border border-surface-line bg-surface-raised/40 px-3 py-2.5"><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold-dim">{item.kind}</span><p className="truncate text-sm font-semibold text-ink-900">{item.title}</p></div><p className="mt-1 text-xs leading-5 text-slate-soft">{item.message}</p>{(item.startsAt||item.endsAt)&&<p className="mt-1 flex items-center gap-1 text-[10px] text-gold-dim"><CalendarClock size={11}/>{item.startsAt ? new Date(item.startsAt).toLocaleString() : 'Now'} → {item.endsAt ? new Date(item.endsAt).toLocaleString() : 'Open ended'}</p>}</div><div className="flex shrink-0 gap-1"><button type="button" onClick={() => edit(item)} className="rounded-md p-1.5 text-slate-soft hover:bg-surface-line hover:text-ink-900" aria-label={`Edit ${item.title}`}><Pencil size={14} /></button><button type="button" onClick={() => remove(item)} className="rounded-md p-1.5 text-slate-soft hover:bg-ember/10 hover:text-ember-dim" aria-label={`Delete ${item.title}`}><Trash2 size={14} /></button></div></div>)}</div>}</div>
      </div>
    </Modal>
    <ConfirmModal
      open={!!deleteTarget}
      onClose={() => !deleting && setDeleteTarget(null)}
      onConfirm={confirmRemove}
      busy={deleting}
      eyebrow="Delete announcement"
      title="Delete this announcement?"
      confirmLabel="Delete announcement"
      message={`This removes “${deleteTarget?.title || 'this announcement'}” from the broadcast list. Customers and staff will no longer see it.`}
    />
  </>
}
