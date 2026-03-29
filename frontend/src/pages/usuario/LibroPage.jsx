import { useState, useEffect, useRef } from "react"
import { useParams, useNavigate, useLocation } from "react-router-dom"
import { useAuth } from "../../context/AuthContext"
import API from "../../config"
import "./LibroPage.css"

export default function LibroPage() {
  const { id }       = useParams()
  const navigate     = useNavigate()
  const location     = useLocation()
  const { usuario, logout } = useAuth()
  const modoAdmin    = location.state?.modoAdmin || false

  const [libro, setLibro]                   = useState(null)
  const [parteActiva, setParteActiva]       = useState(null)
  const [segundoInicial, setSegundoInicial] = useState(0)
  const [reproduciendo, setReproduciendo]   = useState(false)
  const [tiempoActual, setTiempoActual]     = useState(0)
  const [duracion, setDuracion]             = useState(0)
  const audioRef = useRef(null)
  const [progresoPorParte, setProgresoPorParte] = useState({})

  useEffect(() => {
    const fetchLibro = fetch(`${API}/libros/${id}`, { credentials: "include" })
      .then(r => r.json())

    const fetchProgreso = fetch(`${API}/progreso/libro/${id}`, { credentials: "include" })
      .then(r => r.ok ? r.json() : { tiene_progreso: false, progreso_por_parte: {} })
      .catch(() => ({ tiene_progreso: false, progreso_por_parte: {} }))

    Promise.all([fetchLibro, fetchProgreso])
      .then(([libroData, progresoData]) => {
        if (!libroData || !libroData.partes) {
          console.error("Respuesta inesperada del libro:", libroData)
          return
        }
        setLibro(libroData)
        setProgresoPorParte(progresoData.progreso_por_parte || {})

        if (progresoData.tiene_progreso && progresoData.ultima_parte_id) {
          const parteGuardada = libroData.partes.find(
            p => p.id === progresoData.ultima_parte_id
          )
          if (parteGuardada?.estado === "listo") {
            setParteActiva(parteGuardada)
            setSegundoInicial(progresoData.ultimo_segundo)
            return
          }
        }
        const primeraLista = libroData.partes.find(p => p.estado === "listo")
        if (primeraLista) setParteActiva(primeraLista)
      })
      .catch(err => console.error("Error al cargar libro:", err))
  }, [id])

  // Posicionar el audio solo cuando hay un segundo guardado (progreso retomado)
  useEffect(() => {
    if (!audioRef.current || segundoInicial <= 0) return
    const handler = () => {
      audioRef.current.currentTime = segundoInicial
      setSegundoInicial(0)
    }
    if (audioRef.current.readyState >= 1) {
      handler()
    } else {
      audioRef.current.addEventListener("loadedmetadata", handler, { once: true })
    }
  }, [parteActiva])

  // Guardar progreso cada 5 segundos mientras reproduce
  useEffect(() => {
    if (!parteActiva) return
    const intervalo = setInterval(() => {
      if (!audioRef.current || audioRef.current.paused) return
      guardarProgreso(parteActiva.id, audioRef.current.currentTime)
    }, 5000)
    return () => clearInterval(intervalo)
  }, [parteActiva, id])

  function guardarProgreso(parteId, segundo) {
    const fd = new FormData()
    fd.append("parte_id", parteId)
    fd.append("segundo_actual", Math.floor(segundo))
    fetch(`${API}/progreso/parte`, { method: "POST", body: fd, credentials: "include" })
  }

  function marcarParteEscuchada(parteId) {
    fetch(`${API}/partes/${parteId}/escuchada`, {
      method: "POST",
      credentials: "include"
    })
  }

  function seleccionarParte(parte) {
    if (parte.estado !== "listo") return
    if (parteActiva && audioRef.current) {
      guardarProgreso(parteActiva.id, audioRef.current.currentTime)
    }
    const segundoGuardado = progresoPorParte[parte.id] || 0
    setSegundoInicial(segundoGuardado)
    setReproduciendo(false)
    setTiempoActual(0)
    setDuracion(0)
    setParteActiva(parte)
  }

  function togglePlay() {
    if (!audioRef.current) return
    audioRef.current.paused ? audioRef.current.play() : audioRef.current.pause()
  }

  function saltar(segundos) {
    if (!audioRef.current) return
    audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime + segundos)
  }

  function porcentajeLibro() {
    if (!libro || libro.partes.length === 0) return 0
    const escuchadas = libro.partes.filter(p => p.escuchada).length
    return Math.round((escuchadas / libro.partes.length) * 100)
  }

  function parteActivaIndex() {
    if (!libro || !parteActiva) return 0
    return libro.partes.findIndex(p => p.id === parteActiva.id) + 1
  }

  function formatTiempo(s) {
    const m  = Math.floor(s / 60)
    const ss = Math.floor(s % 60)
    return `${m}:${ss.toString().padStart(2, "0")}`
  }

  if (!libro) return (
    <div className="libro-loading">
      <div className="libro-spinner" />
    </div>
  )

  const pct = duracion > 0 ? (tiempoActual / duracion) * 100 : 0

  return (
    <div className="libro-root">
      <div className="libro-content">
        <div className="libro-left">
          <div className="libro-cover">
            {libro.portada_url
              ? <img src={libro.portada_url} alt={libro.titulo} />
              : <CoverPlaceholder />
            }
          </div>
          <div className="libro-meta">
            <div className="libro-titulo">{libro.titulo}</div>
            {libro.autor && <div className="libro-autor">{libro.autor}</div>}
            <div className="libro-stats">{libro.num_paginas} páginas · {libro.partes.length} partes</div>
          </div>
          <div className="libro-prog">
            <div className="libro-prog-label">Tu progreso</div>
            <div className="libro-prog-bar-wrap">
              <div className="libro-prog-bar" style={{ width: `${porcentajeLibro()}%` }} />
            </div>
            <div className="libro-prog-text">
              {porcentajeLibro() === 0
                ? "Sin empezar"
                : porcentajeLibro() === 100
                  ? "Completado"
                  : `Parte ${parteActivaIndex()} de ${libro.partes.length}`
              }
            </div>
          </div>
        </div>

        <div className="libro-right">
          {parteActiva ? (
            <div className="player-card">
              <div>
                <div className="player-label">Reproduciendo ahora</div>
                <div className="player-title">
                  Parte {parteActiva.numero_parte} · Páginas {parteActiva.pagina_inicio + 1}–{parteActiva.pagina_fin + 1}
                </div>
              </div>

              <audio
                ref={audioRef}
                src={`${API}/partes/${parteActiva.id}/audio`}
                onLoadedMetadata={() => {
                  setDuracion(audioRef.current.duration)
                  if (segundoInicial > 0) {
                    audioRef.current.currentTime = segundoInicial
                    setSegundoInicial(0)
                  }
                }}
                onTimeUpdate={() => setTiempoActual(audioRef.current.currentTime)}
                onPlay={() => setReproduciendo(true)}
                onPause={() => {
                  setReproduciendo(false)
                  if (audioRef.current) guardarProgreso(parteActiva.id, audioRef.current.currentTime)
                }}
                onEnded={() => {
                  setReproduciendo(false)
                  marcarParteEscuchada(parteActiva.id)
                  guardarProgreso(parteActiva.id, audioRef.current?.duration || 0)
                }}
              />

              <div className="player-scrubber">
                <span className="player-time">{formatTiempo(tiempoActual)}</span>
                <div
                  className="scrubber-track"
                  onClick={e => {
                    const rect = e.currentTarget.getBoundingClientRect()
                    const ratio = (e.clientX - rect.left) / rect.width
                    if (audioRef.current) audioRef.current.currentTime = ratio * duracion
                  }}
                >
                  <div className="scrubber-fill" style={{ width: `${pct}%` }} />
                  <div className="scrubber-thumb" style={{ left: `${pct}%` }} />
                </div>
                <span className="player-time">{formatTiempo(duracion)}</span>
              </div>

              <div className="player-btns">
                <button className="pbtn" onClick={() => saltar(-15)} title="Retroceder 15s">
                  <IconSkipBack />
                </button>
                <button className="pbtn-play" onClick={togglePlay}>
                  {reproduciendo ? <IconPause /> : <IconPlay />}
                </button>
                <button className="pbtn" onClick={() => saltar(15)} title="Avanzar 15s">
                  <IconSkipFwd />
                </button>
              </div>
            </div>
          ) : (
            <div className="player-card" style={{ alignItems: "center", padding: "32px", color: "var(--cr-muted)", fontSize: "14px" }}>
              No hay partes listas todavía
            </div>
          )}

          <div>
            <div className="partes-header" style={{ marginBottom: "12px" }}>Partes</div>
            <div className="partes-list">
              {libro.partes.map(parte => {
                const activa = parteActiva?.id === parte.id
                const bloq   = parte.estado !== "listo"
                return (
                  <div
                    key={parte.id}
                    className={`parte-row ${activa ? "parte-active" : ""} ${bloq ? "parte-locked" : ""}`}
                    onClick={() => seleccionarParte(parte)}
                  >
                    <div className="parte-num">{parte.numero_parte}</div>
                    <div className="parte-info">
                      <div className="parte-nombre">Parte {parte.numero_parte}</div>
                      <div className="parte-pages">
                        Páginas {parte.pagina_inicio + 1}–{parte.pagina_fin + 1}
                      </div>
                    </div>
                    <span className={`parte-badge ${
                      activa                        ? "badge-active"     :
                      parte.escuchada               ? "badge-escuchada"  :
                      parte.estado === "listo"      ? "badge-listo"      :
                      parte.estado === "procesando" ? "badge-procesando" :
                      parte.estado === "error"      ? "badge-error"      :
                      "badge-pendiente"
                    }`}>
                      {activa                        ? "▶ Reproduciendo" :
                      parte.escuchada               ? "Escuchada"       :
                      parte.estado === "listo"      ? "Listo"           :
                      parte.estado === "procesando" ? "Procesando"      :
                      parte.estado === "error"      ? "Error"           :
                      "Pendiente"}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function CoverPlaceholder() {
  return (
    <svg width="60" height="80" viewBox="0 0 28 36" fill="none">
      <rect x="2" y="2" width="24" height="32" rx="3"
        fill="rgba(139,107,74,0.15)" stroke="rgba(139,107,74,0.3)" strokeWidth="1.5"/>
      <line x1="7" y1="11" x2="21" y2="11" stroke="rgba(139,107,74,0.3)" strokeWidth="1.5"/>
      <line x1="7" y1="16" x2="21" y2="16" stroke="rgba(139,107,74,0.3)" strokeWidth="1.5"/>
      <line x1="7" y1="21" x2="16" y2="21" stroke="rgba(139,107,74,0.3)" strokeWidth="1.5"/>
    </svg>
  )
}

function IconPlay() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <polygon points="5,3 19,12 5,21"/>
    </svg>
  )
}

function IconPause() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16" rx="1"/>
      <rect x="14" y="4" width="4" height="16" rx="1"/>
    </svg>
  )
}

function IconSkipBack() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10"/>
      <path d="M3.51 15a9 9 0 1 0 .49-4.5"/>
      <text x="7.5" y="15.5" style={{fontSize:"6px", fill:"currentColor", stroke:"none", fontFamily:"sans-serif", fontWeight:"600"}}>15</text>
    </svg>
  )
}

function IconSkipFwd() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10"/>
      <path d="M20.49 15a9 9 0 1 1-.49-4.5"/>
      <text x="7.5" y="15.5" style={{fontSize:"6px", fill:"currentColor", stroke:"none", fontFamily:"sans-serif", fontWeight:"600"}}>15</text>
    </svg>
  )
}