import { useState, useEffect, useRef } from "react"
import { useParams, useNavigate, useLocation } from "react-router-dom"
import { useAuth } from "../../AuthContext"
import API from "../../config"

export default function LibroPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { usuario, logout } = useAuth()
  const [libro, setLibro] = useState(null)
  const [parteActiva, setParteActiva] = useState(null)
  const [segundoInicial, setSegundoInicial] = useState(0)
  const audioRef = useRef(null)
  const modoAdmin = location.state?.modoAdmin || false

  useEffect(() => {
    // Cargar libro y progreso en paralelo
    Promise.all([
      fetch(`${API}/libros/${id}`, { credentials: "include" }).then(r => r.json()),
      fetch(`${API}/progreso/${id}`, { credentials: "include" }).then(r => r.json())
    ]).then(([libroData, progresoData]) => {
      setLibro(libroData)

      if (progresoData.tiene_progreso) {
        // Retomar desde donde lo dejó
        const parteGuardada = libroData.partes.find(p => p.id === progresoData.parte_id)
        if (parteGuardada && parteGuardada.estado === "listo") {
          setParteActiva(parteGuardada)
          setSegundoInicial(progresoData.segundo_actual)
          return
        }
      }

      // Si no hay progreso, seleccionar la primera parte lista
      const primeraLista = libroData.partes.find(p => p.estado === "listo")
      if (primeraLista) setParteActiva(primeraLista)
    })
  }, [id])

  // Cuando carga el audio, posicionarlo en el segundo correcto
  useEffect(() => {
    if (audioRef.current && segundoInicial > 0) {
      audioRef.current.currentTime = segundoInicial
      setSegundoInicial(0) // Reset para que no se aplique al cambiar de parte
    }
  }, [parteActiva, segundoInicial])

  // Guardar progreso cada 5 segundos
  useEffect(() => {
    if (!parteActiva) return

    const intervalo = setInterval(() => {
      if (!audioRef.current || audioRef.current.paused) return

      const formData = new FormData()
      formData.append("libro_id", id)
      formData.append("parte_id", parteActiva.id)
      formData.append("segundo_actual", Math.floor(audioRef.current.currentTime))

      fetch(`${API}/progreso`, {
        method: "POST",
        body: formData,
        credentials: "include"
      })
    }, 5000)

    return () => clearInterval(intervalo)
  }, [parteActiva, id])

  function seleccionarParte(parte) {
    if (parte.estado !== "listo") return
    setSegundoInicial(0)
    setParteActiva(parte)
  }

  if (!libro) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className={`min-h-screen bg-gray-950 text-white p-8 ${modoAdmin ? "pt-16" : ""}`}>

      {modoAdmin && (
        <div style={{backgroundColor: "#1e3a5f"}} className="fixed top-0 left-0 right-0 px-6 py-2 flex justify-between items-center z-50">
          <span className="text-white text-xs font-medium">👁 Viendo como usuario</span>
          <button
            onClick={() => navigate("/admin", { replace: true })}
            style={{backgroundColor: "#2d5a8e"}}
            className="text-white text-xs px-3 py-1 rounded-lg hover:opacity-80 transition"
          >
            ← Volver al panel de admin
          </button>
        </div>
      )}

      <div className="max-w-2xl mx-auto flex flex-col gap-6">

        <div className="flex justify-between items-center">
          <button
            onClick={() => navigate("/biblioteca", { state: { modoAdmin } })}
            className="text-gray-500 hover:text-gray-300 text-sm transition"
          >
            ← Volver a la biblioteca
          </button>
          <div className="flex items-center gap-3">
            <span className="text-gray-400 text-sm">Hola, {usuario.nombre}</span>
            {!modoAdmin && (
              <button
                onClick={logout}
                className="text-white text-sm px-4 py-2 rounded-lg transition font-medium"
                style={{backgroundColor: "#374151"}}
              >
                Cerrar sesión
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold">{libro.titulo}</h1>
          {libro.autor && <p className="text-gray-400">{libro.autor}</p>}
          <p className="text-gray-600 text-sm">{libro.num_paginas} páginas · {libro.partes.length} partes</p>
        </div>

        {parteActiva && (
          <div className="bg-gray-900 rounded-2xl p-6 flex flex-col gap-3">
            <p className="text-sm text-gray-400">Reproduciendo parte {parteActiva.numero_parte}</p>
            <audio
              ref={audioRef}
              controls
              src={`${API}/partes/${parteActiva.id}/audio`}
              className="w-full"
              onLoadedMetadata={() => {
                if (segundoInicial > 0 && audioRef.current) {
                  audioRef.current.currentTime = segundoInicial
                }
              }}
            />
          </div>
        )}

        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-gray-400 uppercase tracking-wide">Partes</h2>
          {libro.partes.map(parte => (
            <div
              key={parte.id}
              onClick={() => seleccionarParte(parte)}
              className={`rounded-xl px-4 py-3 flex justify-between items-center transition ${
                parte.estado === "listo"
                  ? parteActiva?.id === parte.id
                    ? "bg-blue-600 cursor-pointer"
                    : "bg-gray-900 hover:bg-gray-800 cursor-pointer"
                  : "bg-gray-900 opacity-50 cursor-not-allowed"
              }`}
            >
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Parte {parte.numero_parte}</span>
                <span className="text-xs text-gray-500">
                  Páginas {parte.pagina_inicio + 1} – {parte.pagina_fin + 1}
                </span>
              </div>
              <span className={`text-xs font-medium ${
                parte.estado === "listo" ? "text-green-400" :
                parte.estado === "procesando" ? "text-yellow-400" :
                parte.estado === "error" ? "text-red-400" :
                "text-gray-500"
              }`}>
                {parte.estado === "listo" ? "▶ Listo" :
                 parte.estado === "procesando" ? "⏳ Procesando" :
                 parte.estado === "error" ? "✕ Error" :
                 "⏸ Pendiente"}
              </span>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}