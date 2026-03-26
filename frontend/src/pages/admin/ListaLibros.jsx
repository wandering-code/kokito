import { useState, useEffect } from "react"
import API from "../../config"
import "./ListaLibros.css"

function estadoPrincipal(partes) {
  if (!Array.isArray(partes) || partes.length === 0) return "pendiente"
  if (partes.some(p => p.estado === "procesando")) return "procesando"
  if (partes.some(p => p.estado === "pendiente"))  return "pendiente"
  if (partes.every(p => p.estado === "listo"))     return "listo"
  return "parcial"
}

export default function ListaLibros({ refresh }) {
  const [libros, setLibros] = useState([])
  const [progresos, setProgresos] = useState({}) // libro_id → porcentaje

  function cargarLibros() {
    fetch(`${API}/libros`, { credentials: "include" })
      .then(r => r.json())
      .then(data => Array.isArray(data) ? setLibros(data) : setLibros([]))
  }

  // Polling de progreso — solo mientras haya libros procesando
  useEffect(() => {
    const hayProcesando = libros.some(l => estadoPrincipal(l.partes) === "procesando")
    if (!hayProcesando) return

    const intervalo = setInterval(async () => {
      // Recargar lista para actualizar estados de partes
      const res = await fetch(`${API}/libros`, { credentials: "include" })
      const data = await res.json()
      if (!Array.isArray(data)) return
      setLibros(data)

      // Para cada libro procesando, consultar el porcentaje
      const nuevosProgresos = {}
      for (const libro of data) {
        if (estadoPrincipal(libro.partes) === "procesando") {
          try {
            const r = await fetch(`${API}/libros/${libro.id}/progreso`, { credentials: "include" })
            const prog = await r.json()
            const parteActiva = prog.partes?.find(p => p.estado === "procesando")
            nuevosProgresos[libro.id] = parteActiva?.porcentaje ?? 0
          } catch (e) {}
        }
      }
      setProgresos(nuevosProgresos)
    }, 3000)

    return () => clearInterval(intervalo)
  }, [libros])

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
    const estado = estadoPrincipal(libro.partes)
    if (estado === "procesando" || estado === "pendiente") return "procesando"
    if (libro.visible) return "publicado"
    return "privado"
  }

  if (libros.length === 0) return (
    <p className="ll-empty">No hay libros en el sistema todavía</p>
  )

  return (
    <div className="ll-list">
      {libros.map(libro => {
        const estado = estadoPrincipal(libro.partes)
        const estaListo = estado === "listo"
        const badge = estadoBadge(libro)
        const porcentaje = progresos[libro.id] ?? 0

        return (
          <div key={libro.id} className={`ll-row ${estado === "procesando" ? "procesando" : ""}`}>
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
                {libro.num_paginas} págs · {libro.partes.length} partes
              </div>
              <div className="ll-partes">
                {libro.partes.map((p, i) => (
                  <div key={i} className={`ll-dot ${p.estado}`} />
                ))}
              </div>
              {estado === "procesando" && (
                <div className="ll-progreso-wrap">
                  <div className="ll-progreso-barra-fondo">
                    <div className="ll-progreso-barra" style={{ width: `${porcentaje}%` }} />
                  </div>
                  <span className="ll-progreso-label">{porcentaje}%</span>
                </div>
              )}
            </div>
            <div className="ll-actions">
              <span className={`ll-badge ${badge}`}>
                {badge === "publicado" ? "Publicado" : badge === "procesando" ? "Procesando" : "Sin publicar"}
              </span>
              <button
                className="ll-btn-vis"
                onClick={() => cambiarVisibilidad(libro.id, !libro.visible)}
                disabled={!estaListo}
                title={!estaListo ? "El libro aún no está listo" : ""}
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