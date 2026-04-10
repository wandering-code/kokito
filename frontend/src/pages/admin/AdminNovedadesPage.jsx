import { useState, useEffect } from "react"
import API from "../../config"
import "./AdminNovedadesPage.css"

export default function AdminNovedadesPage() {
  const [novedades, setNovedades]       = useState([])
  const [titulo, setTitulo]             = useState("")
  const [contenido, setContenido]       = useState("")
  const [enviando, setEnviando]         = useState(false)
  const [vistaDetalle, setVistaDetalle] = useState(null)
  const [detalle, setDetalle]           = useState(null)

  function cargar() {
    fetch(`${API}/admin/novedades`, { credentials: "include" })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setNovedades(data) })
  }

  useEffect(() => { cargar() }, [])

  async function handlePublicar(e) {
    e.preventDefault()
    if (!titulo.trim() || !contenido.trim()) return
    setEnviando(true)
    const fd = new FormData()
    fd.append("titulo", titulo)
    fd.append("contenido", contenido)
    await fetch(`${API}/admin/novedades`, {
      method: "POST", body: fd, credentials: "include"
    })
    setTitulo("")
    setContenido("")
    setEnviando(false)
    cargar()
  }

  async function handleBorrar(id) {
    if (!confirm("¿Borrar esta novedad?")) return
    await fetch(`${API}/admin/novedades/${id}`, {
      method: "DELETE", credentials: "include"
    })
    if (vistaDetalle === id) setVistaDetalle(null)
    cargar()
  }

  async function toggleDetalle(id) {
    if (vistaDetalle === id) {
      setVistaDetalle(null)
      setDetalle(null)
      return
    }
    setVistaDetalle(id)
    setDetalle(null)
    const data = await fetch(`${API}/admin/novedades/${id}/vistas`, {
      credentials: "include"
    }).then(r => r.json())
    setDetalle(data)
  }

  function formatFecha(f) {
    if (!f) return ""
    return new Date(f).toLocaleDateString("es-ES", {
      day: "numeric", month: "long", year: "numeric"
    })
  }

  return (
    <div className="nov-root">

      {/* Formulario nueva novedad */}
      <div className="nov-card">
        <div className="nov-card-title">Nueva novedad</div>
        <form className="nov-form" onSubmit={handlePublicar}>
          <input
            className="nov-input"
            placeholder="Título"
            value={titulo}
            onChange={e => setTitulo(e.target.value)}
            maxLength={120}
          />
          <textarea
            className="nov-textarea"
            placeholder="Describe los cambios de esta versión..."
            value={contenido}
            onChange={e => setContenido(e.target.value)}
            rows={5}
          />
          <button
            className="nov-btn-publicar"
            type="submit"
            disabled={enviando || !titulo.trim() || !contenido.trim()}
          >
            {enviando ? "Publicando..." : "Publicar novedad"}
          </button>
        </form>
      </div>

      {/* Lista de novedades */}
      <div className="nov-card">
        <div className="nov-card-title">Historial</div>
        {novedades.length === 0 && (
          <div className="nov-empty">No hay novedades publicadas</div>
        )}
        <div className="nov-list">
          {novedades.map(n => (
            <div key={n.id} className="nov-row">
              <div className="nov-row-info">
                <div className="nov-row-titulo">{n.titulo}</div>
                <div className="nov-row-fecha">{formatFecha(n.fecha)}</div>
              </div>
              <div className="nov-row-acciones">
                <button
                  className={`nov-btn-vistas ${vistaDetalle === n.id ? "activo" : ""}`}
                  onClick={() => toggleDetalle(n.id)}
                >
                  {n.vistas} {n.vistas === 1 ? "vista" : "vistas"}
                </button>
                <button
                  className="nov-btn-borrar"
                  onClick={() => handleBorrar(n.id)}
                >
                  Borrar
                </button>
              </div>

              {/* Detalle de vistas */}
              {vistaDetalle === n.id && detalle && (
                <div className="nov-detalle">
                  <div className="nov-detalle-lista">
                    {detalle.usuarios.map(u => (
                      <span
                        key={u.id}
                        className={`nov-detalle-usuario ${u.visto ? "nov-detalle-usuario--visto" : "nov-detalle-usuario--no-visto"}`}
                      >
                        {u.nombre}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}