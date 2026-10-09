// Decides HOW a file plays in the in-app (webview) player. The goal is to leave the video untouched whenever possible:
//   direct    - the original file, byte for byte
//   stream    - Plex copies the video and only converts audio / container (cheap; still no video re-encode)
//   transcode - the video itself must be re-encoded (last resort)
import { clientId, DEMO_URI, type PlexMedia, type PlexServer, type PlexStream } from './plex'

export type PlaybackKind = 'direct' | 'stream' | 'transcode'
export interface PlaybackPlan { kind: PlaybackKind; url: string; hls: boolean; reason: string; summary: string }
/** audioId: stream id; subtitleId: stream id, or null for "off". undefined = leave at the file's default. */
export interface TrackChoice { audioId?: number; subtitleId?: number | null }

const IMAGE_SUBS = new Set(['pgs', 'hdmv_pgs_subtitle', 'vobsub', 'dvd_subtitle', 'dvb_subtitle', 'dvdsub'])
const VIDEO_MIME: Record<string, string> = { h264: 'avc1.640029', hevc: 'hvc1.1.6.L153.B0', h265: 'hvc1.1.6.L153.B0', vp9: 'vp09.00.10.08', av1: 'av01.0.08M.08' }
const AUDIO_MIME: Record<string, string> = { aac: 'mp4a.40.2', ac3: 'ac-3', eac3: 'ec-3', mp3: 'mp4a.6B', opus: 'opus', flac: 'flac', vorbis: 'vorbis' }
const CONTAINER_MIME: Record<string, string> = { mp4: 'video/mp4', mov: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska' }

let probeEl: HTMLVideoElement | undefined
const can = (type: string) => { probeEl ??= document.createElement('video'); return probeEl.canPlayType(type) !== '' }
const canVideo = (codec?: string) => !!codec && !!VIDEO_MIME[codec] && can(`video/mp4; codecs="${VIDEO_MIME[codec]}"`)
const canAudio = (codec?: string) => !!codec && !!AUDIO_MIME[codec] && can(`video/mp4; codecs="${AUDIO_MIME[codec]}"`)

export function isImageSub(s?: PlexStream) { return !!s?.codec && IMAGE_SUBS.has(s.codec.toLowerCase()) }
export const streamsOf = (m: PlexMedia, type: number) => (m.Media?.[0]?.Part?.[0]?.Stream ?? []).filter((s) => s.streamType === type)

function canDirectPlayFile(m: PlexMedia): boolean {
  const info = m.Media?.[0]
  const mime = info?.container ? CONTAINER_MIME[info.container] : undefined
  if (!mime || !info?.videoCodec || !info.audioCodec || !VIDEO_MIME[info.videoCodec] || !AUDIO_MIME[info.audioCodec]) return false
  return can(`${mime}; codecs="${VIDEO_MIME[info.videoCodec]},${AUDIO_MIME[info.audioCodec]}"`)
}

const label = (c?: string) => (c ?? '?').toUpperCase()

/** Demo-mode sample clip (WebM plays in every embedded browser, even ones without H.264). */
const DEMO_WEBM = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm'
const demoVideo = () => DEMO_WEBM

export function planPlayback(server: PlexServer, m: PlexMedia, choice: TrackChoice = {}, force?: 'stream' | 'transcode'): PlaybackPlan {
  const info = m.Media?.[0]
  const audio = streamsOf(m, 2)
  const subs = streamsOf(m, 3)
  const defaultAudio = audio.find((s) => s.selected) ?? audio[0]
  const defaultSub = subs.find((s) => s.selected)

  const wantAudio = choice.audioId !== undefined ? audio.find((s) => s.id === choice.audioId) : defaultAudio
  const wantSub = choice.subtitleId === undefined ? defaultSub : choice.subtitleId === null ? undefined : subs.find((s) => s.id === choice.subtitleId)
  const audioChanged = !!wantAudio && !!defaultAudio && wantAudio.id !== defaultAudio.id

  let kind: PlaybackKind
  let reason: string
  if (!force && !wantSub && !audioChanged && canDirectPlayFile(m)) {
    kind = 'direct'; reason = `Original file, untouched (${label(info?.container)} · ${label(info?.videoCodec)} · ${label(info?.audioCodec)})`
  } else if (force !== 'transcode' && (canVideo(info?.videoCodec) || force === 'stream')) {
    kind = 'stream'
    const why: string[] = []
    if (!canDirectPlayFile(m)) why.push(`${label(info?.container)}/${label(wantAudio?.codec ?? info?.audioCodec)} isn't playable here, so Plex repackages it`)
    if (audioChanged) why.push('alternate audio track')
    if (wantSub) why.push(isImageSub(wantSub) ? 'image subtitles are burned into the picture' : 'subtitles')
    reason = `Video is copied untouched; ${why.join('; ') || 'container converted'}`
  } else {
    kind = 'transcode'; reason = `${label(info?.videoCodec)} video can't play in this app, so Plex re-encodes it`
  }

  const summary = kind === 'direct' ? 'Direct Play' : kind === 'stream' ? 'Direct Stream' : 'Transcoding'

  if (server.uri === DEMO_URI) return { kind, url: demoVideo(), hls: false, reason, summary }
  if (kind === 'direct') {
    return { kind, hls: false, reason, summary, url: `${server.uri}${info!.Part[0].key}?X-Plex-Token=${server.accessToken}` }
  }

  const vCodecs = ['h264', ...(canVideo('hevc') ? ['hevc'] : []), ...(canVideo('av1') ? ['av1'] : [])]
  const aCodecs = ['aac', ...(canAudio('ac3') ? ['ac3'] : []), ...(canAudio('eac3') ? ['eac3'] : [])]
  const q = new URLSearchParams({
    path: `/library/metadata/${m.ratingKey}`, mediaIndex: '0', partIndex: '0', protocol: 'hls', fastSeek: '1',
    directPlay: '0', directStream: kind === 'stream' ? '1' : '0', directStreamAudio: '1', subtitleSize: '100', audioBoost: '100',
    session: crypto.randomUUID(), 'X-Plex-Client-Identifier': clientId(), 'X-Plex-Product': 'Chezzflix', 'X-Plex-Platform': 'Chrome', 'X-Plex-Token': server.accessToken,
    'X-Plex-Client-Profile-Extra': `append-transcode-target-codec(type=videoProfile&context=streaming&protocol=hls&videoCodec=${vCodecs.join(',')}&audioCodec=${aCodecs.join(',')})`,
  })
  if (wantAudio) q.set('audioStreamID', String(wantAudio.id))
  if (wantSub) { q.set('subtitleStreamID', String(wantSub.id)); q.set('subtitles', isImageSub(wantSub) ? 'burn' : 'auto') }
  else if (choice.subtitleId === null) q.set('subtitleStreamID', '0')
  return { kind, hls: true, reason, summary, url: `${server.uri}/video/:/transcode/universal/start.m3u8?${q}` }
}
