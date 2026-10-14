import { useEffect, useRef, useState } from 'react'
import { Check, ImagePlus, Loader2, Plus, X } from 'lucide-react'
import { setFocus } from '@noriginmedia/norigin-spatial-navigation'
import { Layer } from './Layer'
import { Focusable } from './Focusable'
import { Btn } from './AddChannel'
import { getCollections, getImageChoices, getMetadataFresh, imageUrl, type ImageChoice, type PlexMedia, type PlexServer } from '../lib/plex'
import { addImageFromFile, addImageFromUrl, chooseImage, fieldsOf, saveFields, saveTags, type EditFields, type TagKind } from '../lib/edit'

type Tab = 'details' | 'tags' | 'poster' | 'background'

/** A text box for the edit window: OK / click to type, Enter (single line) or Escape to leave. */
function Field({ focusKey, label, value, onChange, placeholder, multiline, onSubmit }: { focusKey: string; label?: string; value: string; onChange: (v: string) => void; placeholder?: string; multiline?: boolean; onSubmit?: () => void }) {
  const el = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const leave = () => { el.current?.blur(); setFocus(focusKey) }
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); leave() }
    else if (e.key === 'Enter' && !multiline) { e.stopPropagation(); if (onSubmit) onSubmit(); else leave() }
    else if (!multiline && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) el.current?.blur()
  }
  const cls = 'w-full bg-transparent text-[1rem] font-medium outline-none placeholder:text-white/30'
  return (
    <div className="mb-4">
      {label && <div className="mb-1.5 px-1 text-[0.72rem] font-bold uppercase tracking-[0.18em] text-white/45">{label}</div>}
      <Focusable focusKey={focusKey} onEnter={() => el.current?.focus()} title={label ?? placeholder}>
        <div className="rounded-2xl bg-white/[0.07] px-4 py-3 ring-1 ring-white/10 transition-all group-data-[hl=true]/f:ring-2 group-data-[hl=true]/f:ring-accent">
          {multiline
            ? <textarea ref={el} rows={7} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} onKeyDown={key} className={`${cls} resize-none leading-relaxed`} />
            : <input ref={el} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} onKeyDown={key} className={cls} />}
        </div>
      </Focusable>
    </div>
  )
}

/** A list of names (genres, collections, tags) you can remove from and add to. */
function TagList({ id, title, hint, values, onChange, suggestions = [] }: { id: string; title: string; hint?: string; values: string[]; onChange: (v: string[]) => void; suggestions?: string[] }) {
  const [text, setText] = useState('')
  const add = () => { const t = text.trim(); if (t && !values.some((v) => v.toLowerCase() === t.toLowerCase())) onChange([...values, t]); setText('') }
  const offer = suggestions.filter((s) => !values.includes(s) && (!text || s.toLowerCase().includes(text.toLowerCase()))).slice(0, 6)
  return (
    <div className="mb-7">
      <div className="mb-1 px-1 text-[0.72rem] font-bold uppercase tracking-[0.18em] text-white/45">{title}</div>
      {hint && <div className="mb-2 px-1 text-sm text-white/40">{hint}</div>}
      <div className="mb-3 flex flex-wrap gap-2">
        {values.length === 0 && <span className="px-1 text-sm text-white/35">None</span>}
        {values.map((v) => (
          <Focusable key={v} onEnter={() => onChange(values.filter((x) => x !== v))} title={`Remove ${v}`}>
            <div className="flex items-center gap-1.5 rounded-full bg-white/12 py-1.5 pl-3.5 pr-2.5 text-sm font-semibold transition-colors group-hover/f:bg-white/22 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black">{v}<X size={14} /></div>
          </Focusable>
        ))}
      </div>
      <div className="flex items-start gap-2">
        <div className="flex-1"><Field focusKey={`${id}-field`} value={text} onChange={setText} placeholder={`Add to ${title.toLowerCase()}…`} onSubmit={add} /></div>
        <Btn focusKey={`${id}-add`} onEnter={add} disabled={!text.trim()}><Plus size={16} />Add</Btn>
      </div>
      {offer.length > 0 && (
        <div className="-mt-1 flex flex-wrap gap-2">
          {offer.map((s) => <Focusable key={s} onEnter={() => { onChange([...values, s]); setText('') }} title={`Add ${s}`}><div className="rounded-full bg-white/6 px-3 py-1 text-xs font-semibold text-white/65 transition-colors group-hover/f:bg-white/15 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black">+ {s}</div></Focusable>)}
        </div>
      )}
    </div>
  )
}

/** Choose a poster or background from what Plex has, or add your own (a file, or a web address). Applies right away. */
function ImagePicker({ server, item, kind, onChanged }: { server: PlexServer; item: PlexMedia; kind: 'posters' | 'arts'; onChanged: () => void }) {
  const [list, setList] = useState<ImageChoice[]>()
  const [busy, setBusy] = useState(false)
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string>()
  const file = useRef<HTMLInputElement>(null)
  const load = () => getImageChoices(server, item.ratingKey, kind).then(setList).catch(() => setList([]))
  useEffect(() => { setList(undefined); load() }, [kind]) // eslint-disable-line react-hooks/exhaustive-deps
  const run = async (f: () => Promise<void>) => { setBusy(true); setError(undefined); try { await f(); await load(); onChanged() } catch (e) { setError((e as Error).message) } finally { setBusy(false) } }
  const wide = kind === 'arts'
  return (
    <div>
      <p className="mb-4 px-1 text-sm text-white/50">Pick one and it is used straight away. Plex keeps your choice when it refreshes the title.</p>
      <div className="mb-5 flex items-start gap-2">
        <div className="flex-1"><Field focusKey="img-url" value={url} onChange={setUrl} placeholder="Add from a web address (https://…)" onSubmit={() => url.trim() && run(async () => { await addImageFromUrl(server, item, kind, url.trim()); setUrl('') })} /></div>
        <Btn focusKey="img-url-add" disabled={!url.trim() || busy} onEnter={() => run(async () => { await addImageFromUrl(server, item, kind, url.trim()); setUrl('') })}><Plus size={16} />Add</Btn>
        <Btn focusKey="img-file" disabled={busy} onEnter={() => file.current?.click()}><ImagePlus size={16} />From a file</Btn>
        <input ref={file} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) run(() => addImageFromFile(server, item, kind, f)) }} />
      </div>
      {error && <p className="mb-3 rounded-xl bg-red-500/15 px-4 py-2.5 text-sm text-red-200">{error}</p>}
      {!list ? <div className="grid place-items-center py-16"><Loader2 className="animate-spin text-white/50" size={30} /></div>
        : list.length === 0 ? <p className="py-10 text-center text-white/50">Plex has nothing to offer here yet. Add one above.</p>
        : (
          <div className={`grid gap-3 ${wide ? 'grid-cols-2' : 'grid-cols-4'} ${busy ? 'pointer-events-none opacity-60' : ''}`}>
            {list.map((c) => (
              <Focusable key={c.key} onEnter={() => !c.selected && run(() => chooseImage(server, item, kind, c.key))} title={c.selected ? 'In use' : 'Use this'}>
                <div className={`relative overflow-hidden rounded-xl bg-surface ring-2 transition-all group-hover/f:ring-white/50 group-data-[hl=true]/f:ring-accent ${c.selected ? 'ring-accent' : 'ring-transparent'} ${wide ? 'aspect-video' : 'aspect-[2/3]'}`}>
                  <img src={imageUrl(server, c.thumb, wide ? 480 : 240, wide ? 270 : 360)} alt="" loading="lazy" draggable={false} className="size-full object-cover" />
                  {c.selected && <span className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-accent text-black"><Check size={16} strokeWidth={3} /></span>}
                  {c.provider && <span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[0.65rem] font-semibold capitalize text-white/80">{c.provider}</span>}
                </div>
              </Focusable>
            ))}
          </div>
        )}
    </div>
  )
}

interface Props { server: PlexServer; item: PlexMedia; onClose: () => void; /** Something changed on the server: refresh what's on screen. */ onSaved: () => void }

/** The server owner's "Edit": title, sort title, release date, description, collections and tags, poster and background. */
export function EditInfo({ server, item, onClose, onSaved }: Props) {
  const [m, setM] = useState<PlexMedia>()
  const [tab, setTab] = useState<Tab>('details')
  const [fields, setFields] = useState<EditFields>({ title: '', titleSort: '', date: '', summary: '' })
  const [tags, setTags] = useState<Record<TagKind, string[]>>({ genre: [], collection: [], label: [] })
  const orig = useRef<{ fields: EditFields; tags: Record<TagKind, string[]> } | undefined>(undefined)
  const [known, setKnown] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const imagesChanged = useRef(false)
  const hasTags = item.type === 'movie' || item.type === 'show'
  const hasBackground = item.type !== 'episode'

  useEffect(() => {
    let alive = true
    getMetadataFresh(server, item.ratingKey).then((full) => {
      if (!alive) return
      const t: Record<TagKind, string[]> = { genre: (full.Genre ?? []).map((x) => x.tag), collection: (full.Collection ?? []).map((x) => x.tag), label: (full.Label ?? []).map((x) => x.tag) }
      const f = fieldsOf(full)
      orig.current = { fields: f, tags: { genre: [...t.genre], collection: [...t.collection], label: [...t.label] } }
      setM(full); setFields(f); setTags(t)
      if (hasTags && full.librarySectionID != null) getCollections(server, String(full.librarySectionID)).then((c) => alive && setKnown(c.map((x) => x.title).filter((x) => !x.startsWith('_')))).catch(() => {})
    }).catch((e) => alive && setError(String(e)))
    return () => { alive = false }
  }, [server, item.ratingKey, hasTags])

  const dateOk = !fields.date || /^\d{4}-\d{2}-\d{2}$/.test(fields.date.trim())
  const changed = !!orig.current && (JSON.stringify(fields) !== JSON.stringify(orig.current.fields) || (['genre', 'collection', 'label'] as TagKind[]).some((k) => JSON.stringify(tags[k]) !== JSON.stringify(orig.current!.tags[k])))
  const close = () => { if (imagesChanged.current) onSaved(); onClose() }
  const save = async () => {
    if (!m || !orig.current || saving || !dateOk) return
    setSaving(true); setError(undefined)
    try {
      await saveFields(server, m, orig.current.fields, fields)
      if (hasTags) for (const k of ['genre', 'collection', 'label'] as TagKind[]) await saveTags(server, m, k, orig.current.tags[k], tags[k])
      onSaved(); onClose()
    } catch (e) { setError((e as Error).message); setSaving(false) }
  }
  const tabs: [Tab, string][] = [['details', 'Details'], ...(hasTags ? [['tags', 'Tags'] as [Tab, string]] : []), ['poster', 'Poster'], ...(hasBackground ? [['background', 'Background'] as [Tab, string]] : [])]
  const showing = item.type === 'episode' ? `${item.grandparentTitle ?? ''} · ${item.title}` : item.title

  return (
    <Layer onClose={close} className="absolute left-1/2 top-1/2 h-[min(720px,90vh)] w-[min(920px,95vw)] -translate-x-1/2 -translate-y-1/2">
      <div className="pop flex h-full overflow-hidden rounded-3xl bg-surface shadow-2xl ring-1 ring-white/10">
        <aside className="flex w-48 shrink-0 flex-col gap-1 border-r border-white/8 bg-black/20 p-4">
          <div className="mb-3 px-2 pt-1"><div className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">Edit</div><div className="mt-1 line-clamp-3 text-[0.95rem] font-bold leading-snug">{showing}</div></div>
          {tabs.map(([id, label]) => (
            <Focusable key={id} focusKey={`edit-tab-${id}`} onEnter={() => setTab(id)} title={label}>
              <div className={`rounded-xl px-3.5 py-3 text-[0.95rem] font-semibold transition-colors group-hover/f:bg-white/10 group-data-[hl=true]/f:bg-white group-data-[hl=true]/f:text-black ${tab === id ? 'bg-accent/20 text-accent' : 'text-white/60'}`}>{label}</div>
            </Focusable>
          ))}
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            {!m ? (error ? <p className="text-red-200">{error}</p> : <div className="grid place-items-center py-24"><Loader2 className="animate-spin text-white/50" size={32} /></div>) : <>
              {tab === 'details' && (
                <>
                  <Field focusKey="edit-title" label="Title" value={fields.title} onChange={(v) => setFields((f) => ({ ...f, title: v }))} />
                  <Field focusKey="edit-sort" label="Sort title" placeholder="Leave empty to sort by the title" value={fields.titleSort} onChange={(v) => setFields((f) => ({ ...f, titleSort: v }))} />
                  <Field focusKey="edit-date" label={item.type === 'episode' ? 'Air date' : 'Release date'} placeholder="YYYY-MM-DD" value={fields.date} onChange={(v) => setFields((f) => ({ ...f, date: v }))} />
                  {!dateOk && <p className="-mt-2 mb-4 px-1 text-sm text-amber-300">Use the form 2024-03-21.</p>}
                  <Field focusKey="edit-summary" label="Description" multiline value={fields.summary} onChange={(v) => setFields((f) => ({ ...f, summary: v }))} />
                </>
              )}
              {tab === 'tags' && (
                <>
                  <TagList id="tag-col" title="Collections" hint="Group titles together. A new name creates a collection." values={tags.collection} onChange={(v) => setTags((t) => ({ ...t, collection: v }))} suggestions={known} />
                  <TagList id="tag-genre" title="Genres" values={tags.genre} onChange={(v) => setTags((t) => ({ ...t, genre: v }))} />
                  <TagList id="tag-label" title="Tags" hint="Your own labels, handy for filtering." values={tags.label} onChange={(v) => setTags((t) => ({ ...t, label: v }))} />
                </>
              )}
              {tab === 'poster' && <ImagePicker server={server} item={m} kind="posters" onChanged={() => { imagesChanged.current = true }} />}
              {tab === 'background' && <ImagePicker server={server} item={m} kind="arts" onChanged={() => { imagesChanged.current = true }} />}
            </>}
          </div>
          <div className="flex items-center gap-3 border-t border-white/8 px-6 py-4">
            {error && m && <span className="min-w-0 flex-1 truncate text-sm text-red-200">{error}</span>}
            <span className="flex-1" />
            <Btn focusKey="edit-cancel" onEnter={close}>{changed ? 'Cancel' : 'Close'}</Btn>
            <Btn focusKey="edit-save" primary disabled={!changed || saving || !dateOk} onEnter={save}>{saving ? <Loader2 size={16} className="animate-spin" /> : null}Save changes</Btn>
          </div>
        </div>
      </div>
    </Layer>
  )
}
