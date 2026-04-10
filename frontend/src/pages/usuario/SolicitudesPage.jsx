import { useState, useEffect, useRef } from "react"
import API from "../../config"
import "./SolicitudesPage.css"

const VOCES_PREDEFINIDAS = [
  { id: "voz_masculina_grave.mp3", nombre: "Voz 1", descripcion: "Masculina · grave" },
  { id: "voz_masculina_media.mp3", nombre: "Voz 2", descripcion: "Masculina · media" },
  { id: "voz_femenina_suave.mp3",  nombre: "Voz 3", descripcion: "Femenina · suave" },
  { id: "voz_masculina_joven.mp3", nombre: "Voz 4", descripcion: "Masculina · joven" },
]

const ESTADOS = {
  pendiente: { label: "Pendiente",   color: "sol-estado--pendiente" },
  aceptada:  { label: "Aceptada",    color: "sol-estado--aceptada"  },
  rechazada: { label: "No aceptada", color: "sol-estado--rechazada" },
}

export default function SolicitudesPage() {
  const [solicitudes, setSolicitudes]     = useState([])
  const [titulo, setTitulo]               = useState("")
  const [autor, setAutor]                 = useState("")
  const [notas, setNotas]                 = useState("")
  const [vozPreferida, setVozPreferida]   = useState("")
  const [enviando, setEnviando]           = useState(false)
  const [enviado, setEnviado]             = useState(false)
  const [vozReproduciendo, setVozReproduciendo] = useState(null)
  const audioActivo = useRef(null)

  function cargar() {
    fetch(`${API}/solicitudes/mias`, { credentials: "include" })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setSolicitudes(data) })
  }

  useEffect(() => { cargar() }, [])

  function reproducirVoz(vozId, e) {
    e.stopPropagation()
    if (audioActivo.current && audioActivo.current._vozId === vozId) {
      audioActivo.current.pause()
      audioActivo.current = null
      setVozReproduciendo(null)
      return
    }
    if (audioActivo.current) { audioActivo.current.pause(); audioActivo.current = null }
    const audio = new Audio(`${API}/voces/${vozId}`)
    audio._vozId = vozId
    audio.play()
    audioActivo.current = audio
    setVozReproduciendo(vozId)
    audio.onended = () => { audioActivo.current = null; setVozReproduciendo(null) }
  }

  async function handleEnviar(e) {
    e.preventDefault()
    if (!titulo.trim()) return
    setEnviando(true)
    const notasCompletas = notas + (vozPreferida ? `\nVoz preferida: ${vozPreferida}` : "")
    const fd = new FormData()
    fd.append("titulo_solicitado", titulo)
    fd.append("autor", autor)
    fd.append("notas", notasCompletas)
    await fetch(`${API}/solicitudes`, {
      method: "POST", body: fd, credentials: "include"
    })
    setTitulo("")
    setAutor("")
    setNotas("")
    setVozPreferida("")
    setEnviando(false)
    setEnviado(true)
    setTimeout(() => setEnviado(false), 3000)
    cargar()
  }

  function formatFecha(f) {
    if (!f) return ""
    return new Date(f).toLocaleDateString("es-ES", {
      day: "numeric", month: "long", year: "numeric"
    })
  }

  return (
    <div className="sol-root">

      {/* Formulario */}
      <div className="sol-card">
        <div className="sol-card-title">Pedir un libro</div>
        <p className="sol-desc">
          ¿Hay algún libro que te gustaría escuchar? Mándanos una solicitud
          y lo tendremos en cuenta.
        </p>
        <form className="sol-form" onSubmit={handleEnviar}>
        <div className="sol-voces-label">
            Título <span className="sol-voces-opcional">(obligatorio)</span>
          </div>
          <input
            className="sol-input"
            placeholder="Título del libro"
            value={titulo}
            onChange={e => setTitulo(e.target.value)}
            maxLength={200}
            required
          />
            <div className="sol-voces-label">
            Autor <span className="sol-voces-opcional">(opcional)</span>
          </div>
          <input
            className="sol-input"
            placeholder="Autor"
            value={autor}
            onChange={e => setAutor(e.target.value)}
            maxLength={120}
          />
        <div className="sol-voces-label">
            Notas adicionales <span className="sol-voces-opcional">(opcional)</span>
          </div>
          <textarea
            className="sol-textarea"
            placeholder="¿Necesitas escuchar un capítulo en concreto? ¿Quieres indicar algo más sobre el libro? ¡Cuéntanos!."
            value={notas}
            onChange={e => setNotas(e.target.value)}
            rows={3}
          />

          {/* Selección de voz */}
          <div className="sol-voces-label">
            Voz preferida <span className="sol-voces-opcional">(opcional)</span>
          </div>
            <p className="sol-desc">
            Ten en cuenta que el resultado final puede variar dependiendo de la 
            calidad del texto original y de la voz seleccionada.
            </p>
          <div className="sol-voces">
            {VOCES_PREDEFINIDAS.map(voz => (
              <div
                key={voz.id}
                className={`sol-voz ${vozPreferida === voz.nombre ? "selected" : ""}`}
                onClick={() => setVozPreferida(
                  vozPreferida === voz.nombre ? "" : voz.nombre
                )}
              >
                <div className="sol-voz-nombre">{voz.nombre}</div>
                <div className="sol-voz-desc">{voz.descripcion}</div>
                <button
                  type="button"
                  className="sol-voz-play"
                  onClick={e => reproducirVoz(voz.id, e)}
                >
                  {vozReproduciendo === voz.id ? (
                    <svg width="8" height="10" viewBox="0 0 8 10" fill="var(--cr-brown)">
                      <rect x="0" y="0" width="2.5" height="10"/>
                      <rect x="5.5" y="0" width="2.5" height="10"/>
                    </svg>
                  ) : (
                    <svg width="8" height="10" viewBox="0 0 8 10" fill="var(--cr-brown)">
                      <polygon points="0,0 8,5 0,10"/>
                    </svg>
                  )}
                </button>
              </div>
            ))}
          </div>

          <button
            className="sol-btn-enviar"
            type="submit"
            disabled={enviando || !titulo.trim()}
          >
            {enviando ? "Enviando..." : enviado ? "¡Solicitud enviada!" : "Enviar solicitud"}
          </button>
        </form>
      </div>

      {/* Mis solicitudes */}
      {solicitudes.length > 0 && (
        <div className="sol-card">
          <div className="sol-card-title">Mis solicitudes</div>
          <div className="sol-list">
            {solicitudes.map(s => {
              const est = ESTADOS[s.estado] || ESTADOS.pendiente
              return (
                <div key={s.id} className="sol-row">
                  <div className="sol-row-info">
                    <div className="sol-row-titulo">{s.titulo_solicitado}</div>
                    {s.autor && <div className="sol-row-autor">{s.autor}</div>}
                    <div className="sol-row-fecha">{formatFecha(s.fecha)}</div>
                  </div>
                  <span className={`sol-estado ${est.color}`}>
                    {est.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

    </div>
  )
}