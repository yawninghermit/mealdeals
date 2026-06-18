import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from '@sentry/react'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import App from './App.jsx'

const dsn = import.meta.env.VITE_SENTRY_DSN
if (dsn) {
  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,
  })
}

const fallback = ({ resetError }) => (
  <div style={{ maxWidth: 480, margin: "80px auto", padding: 24, textAlign: "center", fontFamily: "system-ui, sans-serif" }}>
    <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 10 }}>Something went wrong.</div>
    <div style={{ fontSize: 14, color: "#666", marginBottom: 20, lineHeight: 1.5 }}>
      The error has been logged. Try refreshing — if it keeps happening, email <a href="mailto:mealdeals12@gmail.com">mealdeals12@gmail.com</a>.
    </div>
    <button
      onClick={resetError}
      style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "#e24b4a", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}
    >
      Try again
    </button>
  </div>
)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Sentry.ErrorBoundary fallback={fallback}>
      <App />
      <Analytics />
    </Sentry.ErrorBoundary>
  </StrictMode>,
)
