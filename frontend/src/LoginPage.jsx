import { useState } from "react"
import { useAuth } from "./context/AuthContext"
import "./LoginPage.css"

export default function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail]       = useState("")
  const [password, setPassword] = useState("")
  const [error, setError]       = useState(null)
  const [cargando, setCargando] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setCargando(true)
    setError(null)
    try {
      await login(email, password)
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="lp-root">

      {/* Franja superior — siempre visible */}
      <div className="lp-band">
        <div className="lp-brand">
          <span className="lp-brand-name">kokito</span>
          <span className="lp-brand-tag">tu biblioteca de audiolibros personal</span>
        </div>
        <div className="lp-band-dots" aria-hidden="true">
          {[..."·····"].map((_, i) => (
            <span key={i} className={`lp-dot ${i % 3 === 1 ? "g" : i % 3 === 2 ? "b" : ""}`} />
          ))}
        </div>
      </div>

      {/* Cuerpo principal */}
      <div className="lp-body">

        {/* Panel izquierdo — solo escritorio */}
        <div className="lp-left">
          <div>
            <p className="lp-panel-heading">Leer es un placer.<br />Escuchar, también.</p>
            <p className="lp-panel-body">
              Una biblioteca de audiolibros generados con IA.
              Pide un título, escúchalo cuando esté listo,
              y retoma siempre donde lo dejaste.
            </p>
          </div>
          <ul className="lp-features">
            <li className="lp-feat">
              <span className="lp-feat-icon"><IconPDF /></span>
              <span className="lp-feat-text">
                Pide tu próximo libro
                <small>lo procesamos y te avisamos</small>
              </span>
            </li>
            <li className="lp-feat">
              <span className="lp-feat-icon"><IconPlay /></span>
              <span className="lp-feat-text">
                Escucha por capítulos
                <small>voz natural generada con IA</small>
              </span>
            </li>
            <li className="lp-feat">
              <span className="lp-feat-icon"><IconPos /></span>
              <span className="lp-feat-text">
                Tu progreso, guardado
                <small>retoma en cualquier dispositivo</small>
              </span>
            </li>
          </ul>
        </div>

        {/* Formulario */}
        <form className="lp-form" onSubmit={handleSubmit}>
          <h1 className="lp-form-title">Bienvenido de nuevo</h1>
          <p className="lp-form-sub">Entra en tu biblioteca</p>

          <div className="lp-field">
            <label htmlFor="lp-email">Correo electrónico</label>
            <input
              id="lp-email"
              type="email"
              placeholder="tu@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className="lp-field">
            <label htmlFor="lp-password">Contraseña</label>
            <input
              id="lp-password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          {error && <p className="lp-error">{error}</p>}

          <button type="submit" className="lp-btn" disabled={cargando}>
            {cargando ? "Entrando…" : "Entrar"}
          </button>

          <p className="lp-footer">
            ¿Sin cuenta? <a href="#">Solicitar acceso</a>
          </p>
        </form>

      </div>
    </div>
  )
}

function IconPDF() {
  return (
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none">
      <rect x="2" y="1" width="10" height="12" rx="2" stroke="var(--cr-brown)" strokeWidth="1.2"/>
      <line x1="4.5" y1="5"   x2="9.5" y2="5"   stroke="var(--cr-brown)" strokeWidth="1"/>
      <line x1="4.5" y1="7.5" x2="9.5" y2="7.5" stroke="var(--cr-brown)" strokeWidth="1"/>
      <line x1="4.5" y1="10"  x2="7.5" y2="10"  stroke="var(--cr-brown)" strokeWidth="1"/>
    </svg>
  )
}

function IconPlay() {
  return (
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="5.5" stroke="var(--cr-brown)" strokeWidth="1.2"/>
      <polygon points="5.5,4.5 10,7 5.5,9.5" fill="var(--cr-brown)"/>
    </svg>
  )
}

function IconPos() {
  return (
    <svg width="15" height="15" viewBox="0 0 14 14" fill="none">
      <path d="M2 11 Q7 4 12 11" stroke="var(--cr-brown)" strokeWidth="1.2" fill="none"/>
      <circle cx="7" cy="7" r="1.5" fill="var(--cr-brown)"/>
    </svg>
  )
}