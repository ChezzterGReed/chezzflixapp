import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './lib/perf'
import './index.css'
import App from './App.tsx'

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
