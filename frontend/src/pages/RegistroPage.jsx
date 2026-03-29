import { useState } from "react"
import { useNavigate } from "react-router-dom"
import API from "../config"
import "../LoginPage.css"

export default function RegistroPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ nombre: "", email: "", password: "" })
  const [estado, setEstado] = useState("inicial")
  const [mensajeError, setMensajeError] = useState("")

  function handleChange(e) {
    setForm({ ...form, [e.target.name]: e.target.value })
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.nombre || !form.email || !form.password) {
      setMensajeError("Todos los campos son obligatorios")
      setEstado("error")
      return
    }

    if (!form.nombre || !form.email || !form.password) {
        setMensajeError("Todos los campos son obligatorios")
        setEstado("error")
        return
    }

    if (form.password.length < 8) {
        setMensajeError("La contraseña debe tener al menos 8 caracteres")
        setEstado("error")
        return
    }

    setEstado("cargando")
    setMensajeError("")

    const fd = new FormData()
    fd.append("nombre", form.nombre)
    fd.append("email", form.email)
    fd.append("password", form.password)

    try {
      const res = await fetch(`${API}/registro`, { method: "POST", body: fd })
      const data = await res.json()
      if (!res.ok) {
        setMensajeError(data.detail || "Error al registrarse")
        setEstado("error")
        return
      }
      setEstado("exito")
    } catch {
      setMensajeError("Error de conexión")
      setEstado("error")
    }
  }

  return (
    <div className="lp-root">

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

      <div className="lp-body">

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

        {estado === "exito" ? (
          <div className="lp-form">
            <h1 className="lp-form-title">Solicitud enviada</h1>
            <p className="lp-form-sub">Tu cuenta está pendiente de aprobación por un administrador. Recibirás un email cuando esté lista.</p>
            <button className="lp-btn" onClick={() => navigate("/login")}>
              Volver al login
            </button>
          </div>
        ) : (
          <form className="lp-form" onSubmit={handleSubmit}>
            <h1 className="lp-form-title">Solicitar acceso</h1>
            <p className="lp-form-sub">Crea tu cuenta en kokito</p>

            <div className="lp-field">
              <label htmlFor="reg-nombre">Nombre</label>
              <input
                id="reg-nombre"
                type="text"
                name="nombre"
                placeholder="Tu nombre"
                value={form.nombre}
                onChange={handleChange}
                required
                autoComplete="name"
              />
            </div>

            <div className="lp-field">
              <label htmlFor="reg-email">Correo electrónico</label>
              <input
                id="reg-email"
                type="email"
                name="email"
                placeholder="tu@email.com"
                value={form.email}
                onChange={handleChange}
                required
                autoComplete="email"
              />
            </div>

            <div className="lp-field">
              <label htmlFor="reg-password">Contraseña</label>
              <input
                id="reg-password"
                type="password"
                name="password"
                placeholder="••••••••"
                value={form.password}
                onChange={handleChange}
                required
                autoComplete="new-password"
              />
            </div>

            {estado === "error" && <p className="lp-error">{mensajeError}</p>}

            <button type="submit" className="lp-btn" disabled={estado === "cargando"}>
              {estado === "cargando" ? "Enviando..." : "Solicitar acceso"}
            </button>

            <p className="lp-footer">
              ¿Ya tienes cuenta? <a href="#" onClick={(e) => { e.preventDefault(); navigate("/login") }}>Inicia sesión</a>
            </p>
          </form>
        )}

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