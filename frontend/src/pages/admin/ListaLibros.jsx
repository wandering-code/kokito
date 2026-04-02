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

function estadoBadge(libro) {
  const estado = estadoPrincipal(libro.partes)
  if (estado === "procesando") return "procesando"
  if (libro.visible && estado === "listo") return "publicado"
  if (libro.visible) return "publicado-parcial"
  return "privado"
}

function hayError(partes) {
  return Array.isArray(partes) && partes.some(p => p.estado === "error")
}

function CoverPlaceholder() {
  return (
    <svg width="20" height="28" viewBox="0 0 20 28" fill="none">
      <rect x="1" y="1" width="18" height="26" rx="2"
        fill="rgba(139,107,74,0.15)" stroke="rgba(139,107,74,0.3)" strokeWidth="1"/>
    </svg>
  )
}

export default function ListaLibros({ refresh, onEditar }) {
  const [libros, setLibros] = useState([])
  const [progresos, setProgresos] = useState({})
  const [hoveredDel, setHoveredDel] = useState(null)
  const [menuAbierto, setMenuAbierto] = useState(null)

  function cargarLibros() {
    fetch(`${API}/libros`, { credentials: "include" })
      .then(r => r.json())
      .then(data => Array.isArray(data) ? setLibros(data) : setLibros([]))
  }

  useEffect(() => {
    const hayProcesando = libros.some(l => estadoPrincipal(l.partes) === "procesando")
    if (!hayProcesando) return

    const intervalo = setInterval(async () => {
      const res = await fetch(`${API}/libros`, { credentials: "include" })
      const data = await res.json()
      if (!Array.isArray(data)) return
      setLibros(data)

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

  useEffect(() => {
    if (menuAbierto === null) return
    function cerrar() { setMenuAbierto(null) }
    document.addEventListener("mousedown", cerrar)
    return () => document.removeEventListener("mousedown", cerrar)
  }, [menuAbierto])

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

  async function reintentar(id) {
    await fetch(`${API}/admin/reintentar/${id}`, {
      method: "POST", credentials: "include"
    })
    cargarLibros()
  }

  async function abrirEditar(libroId) {
    const res = await fetch(`${API}/libros/${libroId}`, { credentials: "include" })
    const data = await res.json()
    onEditar({
      id: data.id,
      titulo: data.titulo || "",
      autor: data.autor || "",
      serie: data.serie || "",
      anio: data.anio || "",
      genero: data.genero || "",
      editorial: data.editorial || "",
      isbn: data.isbn || "",
      sinopsis: data.sinopsis || "",
      portada_url: data.portada_url || ""
    })
  }

  if (libros.length === 0) return (
    <p className="ll-empty">No hay libros en el sistema todavía</p>
  )

  return (
    <div className="ll-list">
      {libros.map(libro => {
        const estado = estadoPrincipal(libro.partes)
        const tieneAlgunaLista = Array.isArray(libro.partes) && libro.partes.some(p => p.estado === "listo")
        const estaListo = estado === "listo" || tieneAlgunaLista
        const badge = estadoBadge(libro)
        const porcentaje = progresos[libro.id] ?? 0

        return (
          <div key={libro.id} className={`ll-row ${estado === "procesando" ? "procesando" : ""}`}>

            {/* Menú tres puntos — solo móvil, esquina superior derecha */}
            <div className="ll-menu-wrap" onMouseDown={e => e.stopPropagation()}>
              <button
                className="ll-btn-dots"
                onClick={() => setMenuAbierto(menuAbierto === libro.id ? null : libro.id)}
              >⋯</button>
              {menuAbierto === libro.id && (
                <div className="ll-dropdown">
                  <button onClick={() => { setMenuAbierto(null); abrirEditar(libro.id) }}>
                    Editar
                  </button>
                  <div className="dd-sep" />
                  <button
                    onClick={() => { setMenuAbierto(null); cambiarVisibilidad(libro.id, !libro.visible) }}
                    disabled={!estaListo}
                  >
                    {libro.visible ? "Despublicar" : "Publicar"}
                  </button>
                  <div className="dd-sep" />
                  <button
                    className="dd-del"
                    onClick={() => { setMenuAbierto(null); borrarLibro(libro.id) }}
                  >
                    Eliminar
                  </button>
                </div>
              )}
            </div>

            {/* Cabecera: portada + info */}
            <div className="ll-header">
              <div className="ll-cover">
                {libro.portada_url
                  ? <img src={libro.portada_url} alt={libro.titulo} />
                  : <CoverPlaceholder />
                }
              </div>
              <div className="ll-info">
                <div className="ll-titulo-row">
                  <div className="ll-titulo">{libro.titulo}</div>
                  <span className={`ll-badge ${badge}`}>
                    {badge === "publicado"           ? "Publicado"
                     : badge === "publicado-parcial" ? "Publicado (parcial)"
                     : badge === "procesando"        ? "Procesando"
                     : "Sin publicar"}
                  </span>
                </div>
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
            </div>

            {/* Acciones — solo escritorio */}
            <div className="ll-actions">
              <button className="ll-btn-edit" onClick={() => abrirEditar(libro.id)}>
                Editar
              </button>
              <button
                className="ll-btn-vis"
                onClick={() => cambiarVisibilidad(libro.id, !libro.visible)}
                disabled={!estaListo}
                title={!estaListo ? "El libro no tiene ninguna parte lista todavía" : ""}
              >
                {libro.visible ? "Despublicar" : "Publicar"}
              </button>
              {hayError(libro.partes) && estado !== "procesando" && (
                <button className="ll-btn-retry" onClick={() => reintentar(libro.id)}>
                  Reintentar
                </button>
              )}
              <button
                className="ll-btn-del-desk"
                onMouseEnter={() => setHoveredDel(libro.id)}
                onMouseLeave={() => setHoveredDel(null)}
                onClick={() => borrarLibro(libro.id)}
              >
                Eliminar
              </button>
            </div>

          </div>
        )
      })}
    </div>
  )
}