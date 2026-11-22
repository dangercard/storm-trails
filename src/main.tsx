import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { readUrl } from './data/urlState'
import { startLanguage } from './i18n'

// The language first (a translation loads in a moment), so the site never shows in one language and then another
startLanguage(readUrl().lang).then(() =>
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  ),
)
