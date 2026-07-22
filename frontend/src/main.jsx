import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import "./styles/theme.css";
import App from './App.jsx'
import { EDITIONS, getActiveEdition } from './editions/editionConfig.js'

const activeEdition = getActiveEdition()

function renderForEdition(edition) {
  if (edition === EDITIONS.DEVELOPER) {
    return <App />
  }

  // No committed frontend exists yet for a non-Developer Edition
  // (ADR-0002 Migration Plan Phase 1/2) — falling through to the
  // Developer app here would leak Task/Runtime/Agent concepts to an
  // Edition that must never see them.
  return <p>This edition ({edition}) does not have a frontend build yet.</p>
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {renderForEdition(activeEdition)}
  </StrictMode>,
)
