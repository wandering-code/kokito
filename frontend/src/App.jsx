import { useState, useEffect } from "react"
import { useAuth } from "./AuthContext"
import LoginPage from "./LoginPage"

const API = "http://localhost:8000"

function App() {
  const { usuario, cargando, logout } = useAuth()

  if (cargando) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!usuario) {
    return <LoginPage />
  }

  const [estado, setEstado] = useState("inicial")
  const [proveedor, setProveedor] = useState("edge")
  const [tareaId, setTareaId] = useState(null)
  const [mp3Url, setMp3Url] = useState(null)
  const [error, setError] = useState(null)
  const [progreso, setProgreso] = useState(0)
  const [estadisticas, setEstadisticas] = useState(null)
  const [vozArchivo, setVozArchivo] = useState(null)
  const [titulo, setTitulo] = useState("")
  const [autor, setAutor] = useState("")
  const [paginasPorParte, setPaginasPorParte] = useState(50)
  const [libros, setLibros] = useState([])

  useEffect(() => {
    fetch(`${API}/estadisticas`)
      .then(res => res.json())
      .then(data => setEstadisticas(data))
    cargarLibros()
  }, [])

  function cargarLibros() {
    fetch(`${API}/libros`)
      .then(res => res.json())
      .then(data => setLibros(data))
  }

  async function borrarLibro(id) {
    await fetch(`${API}/libros/${id}`, { method: "DELETE" })
    cargarLibros()
  }

  async function handleSubmit(e) {
    const archivo = e.target.files[0]
    if (!archivo) return

    if (!titulo.trim()) {
      alert("El título es obligatorio")
      return
    }

    setEstado("procesando")
    setError(null)

    const formData = new FormData()
    formData.append("pdf", archivo)
    formData.append("proveedor", proveedor)
    formData.append("titulo", titulo)
    formData.append("autor", autor)
    formData.append("paginas_por_parte", paginasPorParte)

    if (vozArchivo) formData.append("voz", vozArchivo)

    const res = await fetch(`${API}/convertir`, {
      method: "POST",
      body: formData,
    })
    const data = await res.json()

    if (!data.es_nuevo) {
      setEstado("inicial")
      setError(`Este libro ya existe en el sistema: "${data.titulo}"`)
      return
    }

    setTareaId(data.tarea_id)

    const intervalo = setInterval(async () => {
      const res = await fetch(`${API}/resultado/${data.tarea_id}`)

      if (res.headers.get("content-type")?.includes("audio")) {
        clearInterval(intervalo)
        const blob = await res.blob()
        setMp3Url(URL.createObjectURL(blob))
        setEstado("listo")
        cargarLibros()
        fetch(`${API}/estadisticas`)
          .then(res => res.json())
          .then(data => setEstadisticas(data))
      } else {
        const result = await res.json()
        if (result.estado === "error") {
          clearInterval(intervalo)
          setError(result.detalle)
          setEstado("inicial")
        } else if (result.estado === "progreso") {
          setProgreso(result.porcentaje)
        } else if (result.estado !== "pendiente") {
          clearInterval(intervalo)
          setError("Ha ocurrido un error inesperado")
          setEstado("inicial")
        }
      }
    }, 2000)
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      <div className="bg-gray-900 rounded-2xl p-10 w-full max-w-md shadow-xl flex flex-col items-center gap-6">
        <h1 className="text-3xl font-bold tracking-tight">Kokito</h1>
        <div className="w-full flex justify-between items-center">
          <span className="text-gray-500 text-xs">Hola, {usuario.nombre}</span>
          <button
            onClick={logout}
            className="text-gray-500 hover:text-gray-300 text-xs transition"
          >
            Cerrar sesión
          </button>
        </div>
        <p className="text-gray-400 text-sm text-center">
          Convierte un PDF a audio en segundos
        </p>

        {estado === "inicial" && (
          <div className="w-full flex flex-col items-center gap-4">
            <div className="w-full flex flex-col gap-3">

              <input
                type="text"
                placeholder="Título del libro *"
                value={titulo}
                onChange={e => setTitulo(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />

              <input
                type="text"
                placeholder="Autor (opcional)"
                value={autor}
                onChange={e => setAutor(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />

              <div className="flex items-center gap-3">
                <label className="text-gray-400 text-sm whitespace-nowrap">Páginas por parte:</label>
                <input
                  type="number"
                  value={paginasPorParte}
                  onChange={e => setPaginasPorParte(parseInt(e.target.value))}
                  min={10}
                  max={200}
                  className="w-24 bg-gray-800 border border-gray-700 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="w-full flex flex-col gap-2">
              <span className="text-sm text-gray-400">Selecciona un agente:</span>
              <div className="w-full flex rounded-xl overflow-hidden border border-gray-700">
                <button
                  onClick={() => setProveedor("edge")}
                  className={`flex-1 py-2 text-sm font-medium transition ${
                    proveedor === "edge"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:text-white"
                  }`}
                >
                  Edge TTS
                </button>
                <button
                  onClick={() => setProveedor("google")}
                  className={`flex-1 py-2 text-sm font-medium transition ${
                    proveedor === "google"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:text-white"
                  }`}
                >
                  Google TTS
                </button>
                <button
                  onClick={() => setProveedor("local")}
                  className={`flex-1 py-2 text-sm font-medium transition ${
                    proveedor === "local"
                      ? "bg-blue-600 text-white"
                      : "bg-gray-800 text-gray-400 hover:text-white"
                  }`}
                >
                  Local (GPU)
                </button>
              </div>
            </div>

            {proveedor === "local" && (
              <div className="w-full flex flex-col gap-2">
                <span className="text-sm text-gray-400">Archivo de voz de referencia:</span>
                <label className="w-full cursor-pointer border border-gray-700 hover:border-blue-500 transition rounded-xl px-4 py-3 flex items-center gap-3 text-gray-400 hover:text-blue-400">
                  <span className="text-xl">🎙️</span>
                  <span className="text-sm truncate">
                    {vozArchivo ? vozArchivo.name : "Selecciona un MP3 o WAV"}
                  </span>
                  <input
                    type="file"
                    accept=".mp3,.wav"
                    className="hidden"
                    onChange={e => setVozArchivo(e.target.files[0])}
                  />
                </label>
              </div>
            )}

            <label className="w-full cursor-pointer border-2 border-dashed border-gray-700 hover:border-blue-500 transition rounded-xl p-8 flex flex-col items-center gap-2 text-gray-400 hover:text-blue-400">
              <span className="text-4xl">📄</span>
              <span className="text-sm">Haz clic para seleccionar un PDF</span>
              <input
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={handleSubmit}
              />
            </label>

            {error && (
              <p className="text-red-400 text-sm text-center">{error}</p>
            )}
          </div>
        )}
        
        {estado === "procesando" && (
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-400 text-sm">Generando audio... {progreso}%</p>
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div className="bg-blue-500 h-2 rounded-full transition-all" style={{width: `${progreso}%`}} />
            </div>
            <p className="text-gray-600 text-xs font-mono">{tareaId}</p>
          </div>
        )}

        {estado === "listo" && (
          <div className="flex flex-col items-center gap-4 w-full">
            <span className="text-5xl">✅</span>
            <p className="text-gray-300 text-sm">Audio listo</p>
            <audio controls src={mp3Url} className="w-full mt-2" />
            <a
              href={mp3Url}
              download="kokito.mp3"
              className="w-full text-center bg-blue-600 hover:bg-blue-500 transition text-white font-medium py-2 rounded-xl text-sm"
            >
              Descargar MP3
            </a>
            <button
              onClick={() => { setEstado("inicial"); setMp3Url(null) }}
              className="text-gray-500 hover:text-gray-300 text-xs transition"
            >
              Convertir otro PDF
            </button>
          </div>
        )}

        {estadisticas && (
          <div className="w-full border-t border-gray-800 pt-4 flex flex-col gap-2">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Uso Google TTS este mes</span>
              <span>{estadisticas.caracteres_mes.toLocaleString()} / 1.000.000 caracteres</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-1.5">
              <div
                className="bg-green-500 h-1.5 rounded-full transition-all"
                style={{ width: `${Math.min(estadisticas.porcentaje, 100)}%` }}
              />
            </div>
            <p className="text-xs text-gray-600 text-right">{estadisticas.porcentaje}% usado</p>
          </div>
        )}

        {libros.length > 0 && (
          <div className="w-full border-t border-gray-800 pt-4 flex flex-col gap-2">
            <span className="text-xs text-gray-500 uppercase tracking-wide">Libros en el sistema</span>
            {libros.map(libro => (
              <div key={libro.id} className="flex items-center justify-between bg-gray-800 rounded-xl px-4 py-3">
                <div className="flex flex-col">
                  <span className="text-sm text-white">{libro.titulo}</span>
                  <span className="text-xs text-gray-500">
                    {libro.num_paginas} págs · {libro.partes} partes
                    {libro.autor ? ` · ${libro.autor}` : ""}
                  </span>
                </div>
                <button
                  onClick={() => borrarLibro(libro.id)}
                  className="text-red-500 hover:text-red-400 text-xs transition ml-4"
                >
                  Borrar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default App