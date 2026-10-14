// Editing a title's details, tags and artwork on the server (what Plex's own "Edit" window does). For the server's owner, on desktop.
import { plexWrite, type PlexMedia, type PlexServer } from './plex'
import { isAndroid } from './native'

/** Only the server's owner can change things on it, and it's offered on the desktop app (not TVs and phones). */
export const canEdit = (server: PlexServer) => !!server.owned && !isAndroid

const TYPE: Record<string, number> = { movie: 1, show: 2, season: 3, episode: 4 }
const enc = encodeURIComponent
const editPath = (m: PlexMedia) => `/library/sections/${m.librarySectionID}/all?type=${TYPE[m.type]}&id=${m.ratingKey}`

export interface EditFields { title: string; titleSort: string; date: string; summary: string }
export const fieldsOf = (m: PlexMedia): EditFields => ({ title: m.title ?? '', titleSort: m.titleSort ?? '', date: m.originallyAvailableAt ?? '', summary: m.summary ?? '' })

/** Sends only what changed, and locks those fields so a later metadata refresh doesn't overwrite them. */
export async function saveFields(server: PlexServer, m: PlexMedia, from: EditFields, to: EditFields): Promise<void> {
  const parts: string[] = []
  const one = (name: string, a: string, b: string) => { if (a !== b) parts.push(`${name}.value=${enc(b)}&${name}.locked=${b === '' && name === 'titleSort' ? 0 : 1}`) }
  one('title', from.title, to.title.trim() || from.title)
  one('titleSort', from.titleSort, to.titleSort.trim())
  one('originallyAvailableAt', from.date, to.date.trim())
  one('summary', from.summary, to.summary)
  if (parts.length) await plexWrite(server, 'PUT', `${editPath(m)}&${parts.join('&')}`)
}

export type TagKind = 'genre' | 'collection' | 'label'
/** Replaces one kind of tag list: removes what's gone, then sets the list (new names are created). */
export async function saveTags(server: PlexServer, m: PlexMedia, kind: TagKind, before: string[], after: string[]): Promise<void> {
  const removed = before.filter((t) => !after.includes(t))
  if (removed.length) await plexWrite(server, 'PUT', `${editPath(m)}&${kind}[].tag.tag-=${removed.map(enc).join(',')}`)
  const added = after.filter((t) => !before.includes(t))
  if (added.length) await plexWrite(server, 'PUT', `${editPath(m)}&${after.map((t, i) => `${kind}[${i}].tag.tag=${enc(t)}`).join('&')}&${kind}.locked=1`)
}

/** Use one of Plex's posters / backgrounds. */
export const chooseImage = (server: PlexServer, m: PlexMedia, kind: 'posters' | 'arts', key: string) =>
  plexWrite(server, 'PUT', `/library/metadata/${m.ratingKey}/${kind === 'posters' ? 'poster' : 'art'}?url=${enc(key)}`)
/** Add a poster / background from a web address. */
export const addImageFromUrl = (server: PlexServer, m: PlexMedia, kind: 'posters' | 'arts', url: string) =>
  plexWrite(server, 'POST', `/library/metadata/${m.ratingKey}/${kind}?url=${enc(url)}`)
/** Add a poster / background from a file on this computer. */
export async function addImageFromFile(server: PlexServer, m: PlexMedia, kind: 'posters' | 'arts', file: File): Promise<void> {
  await plexWrite(server, 'POST', `/library/metadata/${m.ratingKey}/${kind}`, await file.arrayBuffer(), file.type || 'image/jpeg')
}
