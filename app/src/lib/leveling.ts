// Volume leveling: some titles are mixed much quieter than others, so you end up changing the TV volume per movie.
// These mpv audio filters bring every title to a similar loudness (measured on test clips; see the chains' results below).
//   balanced: loudnorm to -16 LUFS keeping natural dynamics. A very quiet title (-40 LUFS) and a normal one (-26) both land at about -15.
//   night:    a gentle compressor first (loud scenes come down, dialogue stays clear), then loudnorm to -18 LUFS with a narrower range (~7 LU).
// Filters can't act on audio passed through untouched to a receiver; Chezzflix decodes audio itself, so they apply.
export type Leveling = 'off' | 'balanced' | 'night'

export const LEVELING: { id: Leveling; label: string; hint: string; af: string }[] = [
  { id: 'off', label: 'Off', hint: 'Play the audio exactly as mastered', af: '' },
  { id: 'balanced', label: 'Balanced', hint: 'Evens out loudness between titles, keeps the natural dynamics', af: 'lavfi=[loudnorm=I=-16:LRA=11:TP=-1.5]' },
  { id: 'night', label: 'Night', hint: 'Also softens loud scenes so you can keep the volume low', af: 'lavfi=[acompressor=threshold=0.08:ratio=4:attack=20:release=250:makeup=2,loudnorm=I=-18:LRA=7:TP=-2]' },
]

export const levelingAf = (l: Leveling) => LEVELING.find((x) => x.id === l)?.af ?? ''
export const nextLeveling = (l: Leveling): Leveling => LEVELING[(LEVELING.findIndex((x) => x.id === l) + 1) % LEVELING.length].id
