import { useState, useEffect } from "react"
import { useAuth } from "../context/AuthContext"
import API from "../config"
import "./ModalNovedades.css"

export default function ModalNovedades() {
  const { usuario } = useAuth()
  const [novedades, setNovedades] = useState([])
  const [visible, setVisible]     = useState(false)

  useEffect(() => {
    if (!usuario) return
    fetch(`${API}/novedades/pendientes`, { credentials: "include" })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setNovedades(data)
          setVisible(true)
        }
      })
      .catch(() => {})
  }, [usuario])

  async function handleCerrar() {
    const ids = novedades.map(n => n.id)
    await fetch(`${API}/novedades/marcar-vistas`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(ids)
    })
    setVisible(false)
  }

  if (!visible || novedades.length === 0) return null

  function formatFecha(f) {
    if (!f) return ""
    return new Date(f).toLocaleDateString("es-ES", {
      day: "numeric", month: "long", year: "numeric"
    })
  }

  return (
    <div className="mnov-overlay" onClick={handleCerrar}>
      <div className="mnov-modal" onClick={e => e.stopPropagation()}>
        <div className="mnov-header">
          <div className="mnov-icono">✦</div>
          <div className="mnov-header-texto">
            <div className="mnov-titulo">Novedades</div>
            <div className="mnov-subtitulo">Lo nuevo en Kokito</div>
          </div>
        </div>

        <div className="mnov-lista">
          {novedades.map((n, i) => (
            <div key={n.id} className="mnov-item">
              {novedades.length > 1 && (
                <div className="mnov-item-fecha">{formatFecha(n.fecha)}</div>
              )}
              <div className="mnov-item-titulo">{n.titulo}</div>
              <div className="mnov-item-contenido">
                {n.contenido.split("\n").reduce((acc, linea, i) => {
                  const esBullet = linea.trimStart().startsWith("- ")
                  const texto = esBullet ? linea.trimStart().slice(2) : linea

                  if (esBullet) {
                    const ultimo = acc[acc.length - 1]
                    if (ultimo?.type === "ul") {
                      ultimo.items.push(texto)
                    } else {
                      acc.push({ type: "ul", items: [texto] })
                    }
                  } else if (texto.trim()) {
                    acc.push({ type: "p", texto })
                  }
                  return acc
                }, []).map((bloque, i) =>
                  bloque.type === "ul"
                    ? <ul key={i} className="mnov-lista-items">
                        {bloque.items.map((item, j) => <li key={j}>{item}</li>)}
                      </ul>
                    : <p key={i} className="mnov-parrafo">{bloque.texto}</p>
                )}
              </div>
              {i < novedades.length - 1 && <div className="mnov-separador" />}
            </div>
          ))}
        </div>

        <button className="mnov-btn" onClick={handleCerrar}>
          Entendido
        </button>
      </div>
    </div>
  )
}