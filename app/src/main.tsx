import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './lib/perf'
import { ensureRemoteLists } from './lib/lists/remote'
import { ACCENTS, FESTIVE_RED, PUMPKIN, currentSeason, textOnAccent } from './lib/settings'
import './index.css'

void ensureRemoteLists()   // fetch the hosted seasonal lists in the background, so they're ready by the time Home asks for them
import App from './App.tsx'

// Colours before the first paint, so the app never starts in default colours and then switches: the last accent in use (pumpkin orange
// in spooky season) or, on a first run, the seasonal / default one.
try {
  const season = localStorage.getItem('chezzflix_last_season') === '0' && !new URLSearchParams(location.search).get('season') ? null : currentSeason()
  const last = localStorage.getItem('chezzflix_last_theme')
  document.documentElement.dataset.season = season === 'christmas' ? (last === 'frost' || last === 'festive' ? last : 'festive') : season ?? ''
  const accent = localStorage.getItem('chezzflix_last_accent') || (season === 'halloween' ? PUMPKIN : season === 'christmas' ? FESTIVE_RED : ACCENTS[0].value)
  document.documentElement.style.setProperty('--accent', accent)
  document.documentElement.dataset.onAccent = textOnAccent(accent)
} catch { /* storage unavailable: defaults apply */ }

// Android (TV and tablets): lay the page out on a wider virtual canvas so the whole UI fits a 10-foot screen.
if (/Android/i.test(navigator.userAgent)) {
  document.documentElement.dataset.platform = 'android'
  document.querySelector('meta[name=viewport]')?.setAttribute('content', 'width=1440, user-scalable=no')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
