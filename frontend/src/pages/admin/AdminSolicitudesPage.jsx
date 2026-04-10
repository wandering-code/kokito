import { useState, useEffect } from "react"
import API from "../../config"
import "./AdminSolicitudesPage.css"

const ESTADOS = {
  pendiente: { label: "Pendiente",   color: "asol-badge--pendiente" },
  aceptada:  { label: "Aceptada",    color: "asol-badge--aceptada"  },
  rechazada: { label: "No aceptada", color: "asol-badge--rechazada" },
}

export default function AdminSolicitudesPage() {
  const [solicitudes, setSolicitudes] = useState([])
  const [procesando, setProcesando]   = useState(null)

  function cargar() {
    fetch(`${API}/admin/solicitudes`, { credentials: "include" })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setSolicitudes(data) })
  }

  useEffect(() => { cargar() }, [])

  async function cambiarEstado(id, estado) {
    setProcesando(id)
    const fd = new FormData()
    fd.append("estado", estado)
    await fetch(`${API}/admin/solicitudes/${id}/estado`, {
      method: "PATCH", body: fd, credentials: "include"
    })
    setProcesando(null)
    cargar()
  }

  async function borrar(id) {
    if (!confirm("¿Borrar esta solicitud?")) return
    await fetch(`${API}/admin/solicitudes/${id}`, {
      method: "DELETE", credentials: "include"
    })
    cargar()
  }

  function formatFecha(f) {
    if (!f) return ""
    return new Date(f).toLocaleDateString("es-ES", {
      day: "numeric", month: "long", year: "numeric"
    })
  }

  const pendientes = solicitudes.filter(s => s.estado === "pendiente")
  const resto      = solicitudes.filter(s => s.estado !== "pendiente")

  function renderSolicitud(s) {
    const est = ESTADOS[s.estado] || ESTADOS.pendiente
    const ocupado = procesando === s.id
    return (
      <div key={s.id} className="asol-row">
        <div className="asol-row-top">
          <div className="asol-row-info">
            <div className="asol-row-titulo">{s.titulo_solicitado}</div>
            {s.autor && <div className="asol-row-autor">{s.autor}</div>}
            <div className="asol-row-meta">
              {s.usuario_nombre} · {s.usuario_email} · {formatFecha(s.fecha)}
            </div>
            {s.notas && <div className="asol-row-notas">"{s.notas}"</div>}
          </div>
          <span className={`asol-badge ${est.color}`}>{est.label}</span>
        </div>
        <div className="asol-row-acciones">
          {s.estado !== "aceptada" && (
            <button
              className="asol-btn asol-btn--aceptar"
              disabled={ocupado}
              onClick={() => cambiarEstado(s.id, "aceptada")}
            >
              Aceptar
            </button>
          )}
          {s.estado !== "pendiente" && (
            <button
              className="asol-btn asol-btn--pendiente"
              disabled={ocupado}
              onClick={() => cambiarEstado(s.id, "pendiente")}
            >
              Marcar pendiente
            </button>
          )}
          {s.estado !== "rechazada" && (
            <button
              className="asol-btn asol-btn--rechazar"
              disabled={ocupado}
              onClick={() => cambiarEstado(s.id, "rechazada")}
            >
              Rechazar
            </button>
          )}
          <button
            className="asol-btn asol-btn--borrar"
            disabled={ocupado}
            onClick={() => borrar(s.id)}
          >
            Borrar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="asol-root">
      <div className="asol-card">
        <div className="asol-card-title">
          Pendientes
          {pendientes.length > 0 && (
            <span className="asol-badge-count">{pendientes.length}</span>
          )}
        </div>
        {pendientes.length === 0
          ? <div className="asol-empty">No hay solicitudes pendientes</div>
          : <div className="asol-list">{pendientes.map(renderSolicitud)}</div>
        }
      </div>

      {resto.length > 0 && (
        <div className="asol-card">
          <div className="asol-card-title">Historial</div>
          <div className="asol-list">{resto.map(renderSolicitud)}</div>
        </div>
      )}
    </div>
  )
}