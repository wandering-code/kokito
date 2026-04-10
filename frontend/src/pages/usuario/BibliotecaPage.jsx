import { useState, useEffect } from "react"
import { useAuth } from "../../context/AuthContext"
import { useNavigate, useLocation } from "react-router-dom"
import API from "../../config"
import "./BibliotecaPage.css"

const VISTA_KEY = "kokito_vista_biblioteca"

export default function BibliotecaPage() {
  const { usuario } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [libros, setLibros]     = useState([])
  const [progreso, setProgreso] = useState({})
  const [vista, setVista]       = useState(
    () => localStorage.getItem(VISTA_KEY) || "grid"
  )

  useEffect(() => {
    fetch(`${API}/libros/publicos`, { credentials: "include" })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setLibros(data)
        else { console.error("Respuesta inesperada:", data); setLibros([]) }
      })
      .catch(err => { console.error("Error al cargar libros:", err); setLibros([]) })
  }, [])

  useEffect(() => {
    if (libros.length === 0) return
    libros.forEach(libro => {
      fetch(`${API}/progreso/${libro.id}`, { credentials: "include" })
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data) setProgreso(p => ({ ...p, [libro.id]: data })) })
    })
  }, [libros])

  function cambiarVista(v) {
    setVista(v)
    localStorage.setItem(VISTA_KEY, v)
  }

  function esCompleto(libro) {
    if (!Array.isArray(libro.partes_estado) || libro.partes_estado.length === 0) return true
    return libro.partes_estado.every(p => p.estado === "listo")
  }

  function estadoLibro(libro) {
      return libro.estado_usuario || "nuevo"
  }
  function porcentajeProgreso(libro) {
    const p = progreso[libro.id]
    if (!p || !libro.partes || libro.partes === 0) return 0
    return Math.round(((p.parte_actual - 1) / libro.partes) * 100)
  }

  function irAlLibro(libro) {
    navigate(`/libro/${libro.id}`)
  }

  return (
    <div className="bib-root">
      <div className="bib-content">

        {/* Toolbar */}
        <div className="bib-toolbar">
          <div className="bib-toolbar-left">
            <span className="bib-title">Biblioteca</span>
            <span className="bib-filter-hint">filtros próximamente</span>
          </div>
          <div className="bib-view-toggle">
            <button
              className={`bib-vbtn ${vista === "grid" ? "active" : ""}`}
              onClick={() => cambiarVista("grid")}
              title="Cuadrícula"
            >
              <IconGrid />
            </button>
            <button
              className={`bib-vbtn ${vista === "list" ? "active" : ""}`}
              onClick={() => cambiarVista("list")}
              title="Lista"
            >
              <IconList />
            </button>
          </div>
        </div>

        {/* Sin libros */}
        {libros.length === 0 && (
          <div className="bib-empty">
            <IconLibro />
            <p>No hay libros disponibles todavía</p>
          </div>
        )}

        {/* Vista cuadrícula */}
        {libros.length > 0 && vista === "grid" && (
          <div className="bib-grid">
            {libros.map(libro => {
              const estado   = estadoLibro(libro)
              const completo = esCompleto(libro)
              return (
                <div key={libro.id} className="bib-card" onClick={() => irAlLibro(libro)}>
                  {libro.portada_url
                    ? <img className="bib-card-cover" src={libro.portada_url} alt={libro.titulo} />
                    : <CoverPlaceholder />
                  }
                  <div className="bib-card-info">
                    <div className="bib-card-title">{libro.titulo}</div>
                    {libro.autor && <div className="bib-card-author">{libro.autor}</div>}
                    <div className="bib-card-badges">
                      <span className={`bib-badge ${estado}`}>
                        {estado === "progreso"   && "En progreso"}
                        {estado === "nuevo"      && "Sin empezar"}
                        {estado === "completado" && "Completado"}
                      </span>
                      {!completo && (
                        <span className="bib-badge parcial">Incompleto</span>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Vista lista */}
        {libros.length > 0 && vista === "list" && (
          <div className="bib-list">
            {libros.map(libro => {
              const estado   = estadoLibro(libro)
              const completo = esCompleto(libro)
              const pct      = porcentajeProgreso(libro)
              return (
                <div key={libro.id} className="bib-row" onClick={() => irAlLibro(libro)}>
                  <div className="bib-row-cover">
                    {libro.portada_url
                      ? <img src={libro.portada_url} alt={libro.titulo} />
                      : <CoverPlaceholderSmall />
                    }
                  </div>
                  <div className="bib-row-info">
                    <div className="bib-row-title">{libro.titulo}</div>
                    {libro.autor && <div className="bib-row-author">{libro.autor}</div>}
                    <div className="bib-row-meta">
                      {libro.formato === "epub"
                        ? `${libro.num_paginas} ${libro.num_paginas === 1 ? "capítulo" : "capítulos"}`
                        : `${libro.num_paginas} páginas · ${libro.partes} partes`
                      }
                      {!completo && <span className="bib-meta-parcial"> · En proceso</span>}
                    </div>
                    {estado === "progreso" && (
                      <div className="bib-row-prog">
                        <div className="bib-row-prog-bar" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                  <button
                    className={`bib-row-action ${estado === "completado" ? "completado" : ""}`}
                    onClick={e => { e.stopPropagation(); irAlLibro(libro) }}
                  >
                    {estado === "progreso"   && "En progreso"}
                    {estado === "nuevo"      && "Sin empezar"}
                    {estado === "completado" && "Completado"}
                  </button>
                </div>
              )
            })}
          </div>
        )}

      </div>
    </div>
  )
}

function CoverPlaceholder() {
  return (
    <div className="bib-card-cover-placeholder">
      <svg width="32" height="42" viewBox="0 0 28 36" fill="none">
        <rect x="2" y="2" width="24" height="32" rx="3"
          fill="rgba(139,107,74,0.15)" stroke="rgba(139,107,74,0.3)" strokeWidth="1.5"/>
        <line x1="7" y1="11" x2="21" y2="11" stroke="rgba(139,107,74,0.3)" strokeWidth="1.5"/>
        <line x1="7" y1="16" x2="21" y2="16" stroke="rgba(139,107,74,0.3)" strokeWidth="1.5"/>
        <line x1="7" y1="21" x2="16" y2="21" stroke="rgba(139,107,74,0.3)" strokeWidth="1.5"/>
      </svg>
    </div>
  )
}

function CoverPlaceholderSmall() {
  return (
    <svg width="24" height="32" viewBox="0 0 24 32" fill="none">
      <rect x="1" y="1" width="22" height="30" rx="2"
        fill="rgba(139,107,74,0.15)" stroke="rgba(139,107,74,0.3)" strokeWidth="1"/>
    </svg>
  )
}

function IconGrid() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <rect x="1" y="1" width="6" height="6" rx="1.5"/>
      <rect x="9" y="1" width="6" height="6" rx="1.5"/>
      <rect x="1" y="9" width="6" height="6" rx="1.5"/>
      <rect x="9" y="9" width="6" height="6" rx="1.5"/>
    </svg>
  )
}

function IconList() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <rect x="1" y="2" width="4" height="4" rx="1"/>
      <rect x="7" y="3" width="8" height="1.5" rx="0.75"/>
      <rect x="7" y="5" width="5" height="1.2" rx="0.6"/>
      <rect x="1" y="8" width="4" height="4" rx="1"/>
      <rect x="7" y="9" width="8" height="1.5" rx="0.75"/>
      <rect x="7" y="11" width="5" height="1.2" rx="0.6"/>
    </svg>
  )
}

function IconLibro() {
  return (
    <svg width="48" height="48" viewBox="0 0 28 36" fill="none">
      <rect x="2" y="2" width="24" height="32" rx="3"
        fill="none" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="7" y1="11" x2="21" y2="11" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="7" y1="16" x2="21" y2="16" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="7" y1="21" x2="16" y2="21" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  )
}