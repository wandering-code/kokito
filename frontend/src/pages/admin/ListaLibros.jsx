import { useState, useEffect } from "react"
import API from "../../config"
import "./ListaLibros.css"

export default function ListaLibros({ refresh }) {
  const [libros, setLibros] = useState([])

  function cargarLibros() {
    fetch(`${API}/libros`, { credentials: "include" })
      .then(r => r.json())
      .then(data => Array.isArray(data) ? setLibros(data) : setLibros([]))
  }

  useEffect(() => { cargarLibros() }, [refresh])

  async function cambiarVisibilidad(id, visible) {
    await fetch(`${API}/libros/${id}/visible?visible=${visible}`, {
      method: "PATCH", credentials: "include"
    })
    cargarLibros()
  }

  async function borrarLibro(id) {
    if (!window.confirm("¿Seguro que quieres borrar este libro?")) return
    await fetch(`${API}/libros/${id}`, { method: "DELETE", credentials: "include" })
    cargarLibros()
  }

  function estadoBadge(libro) {
    const tienePartes = libro.partes > 0
    const procesando  = false // futuros: comprobar si alguna parte está procesando
    if (!tienePartes)   return "privado"
    if (libro.visible)  return "publicado"
    return "privado"
  }

  if (libros.length === 0) return (
    <p className="ll-empty">No hay libros en el sistema todavía</p>
  )

  return (
    <div className="ll-list">
      {libros.map(libro => {
        const badge = estadoBadge(libro)
        return (
          <div key={libro.id} className="ll-row">
            <div className="ll-cover">
              {libro.portada_url
                ? <img src={libro.portada_url} alt={libro.titulo} />
                : <CoverPlaceholder />
              }
            </div>
            <div className="ll-info">
              <div className="ll-titulo">{libro.titulo}</div>
              <div className="ll-meta">
                {libro.autor ? `${libro.autor} · ` : ""}
                {libro.num_paginas} págs · {libro.partes} partes
              </div>
              <div className="ll-partes">
                {Array.from({ length: libro.partes }).map((_, i) => (
                  <div key={i} className="ll-dot listo" />
                ))}
              </div>
            </div>
            <div className="ll-actions">
              <span className={`ll-badge ${badge}`}>
                {badge === "publicado" ? "Publicado" : "Sin publicar"}
              </span>
              <button
                className="ll-btn-vis"
                onClick={() => cambiarVisibilidad(libro.id, !libro.visible)}
              >
                {libro.visible ? "Despublicar" : "Publicar"}
              </button>
              <button className="ll-btn-del" onClick={() => borrarLibro(libro.id)}>
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none"
                  stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <line x1="2" y1="2" x2="12" y2="12"/>
                  <line x1="12" y1="2" x2="2" y2="12"/>
                </svg>
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CoverPlaceholder() {
  return (
    <svg width="20" height="28" viewBox="0 0 20 28" fill="none">
      <rect x="1" y="1" width="18" height="26" rx="2"
        fill="rgba(139,107,74,0.15)" stroke="rgba(139,107,74,0.3)" strokeWidth="1"/>
    </svg>
  )
}