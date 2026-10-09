import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './lib/perf'
import { ACCENTS, PUMPKIN, currentSeason } from './lib/settings'
import './index.css'
import App from './App.tsx'

// Colours before the first paint, so the app never starts in default colours and then switches: the last accent in use (pumpkin orange
// in spooky season) or, on a first run, the seasonal / default one.
try {
  const season = localStorage.getItem('chezzflix_last_season') === '0' ? null : currentSeason()
  document.documentElement.dataset.season = season ?? ''
  document.documentElement.style.setProperty('--accent', localStorage.getItem('chezzflix_last_accent') || (season === 'halloween' ? PUMPKIN : ACCENTS[0].value))
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
