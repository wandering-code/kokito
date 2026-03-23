import { useState } from "react"

const API = "http://localhost:8000"

export default function SubirPDF({ onLibroSubido }) {
  const [titulo, setTitulo] = useState("")
  const [autor, setAutor] = useState("")
  const [paginasPorParte, setPaginasPorParte] = useState(50)
  const [proveedor, setProveedor] = useState("edge")
  const [estado, setEstado] = useState("inicial")
  const [progreso, setProgreso] = useState(0)
  const [error, setError] = useState(null)
  const [mp3Url, setMp3Url] = useState(null)
  const [vozArchivo, setVozArchivo] = useState(null)
  const [archivo, setArchivo] = useState(null)

  async function handleArchivo() {
    if (!archivo) return

    if (!titulo.trim()) {
      setError("El título es obligatorio")
      return
    }

    setEstado("procesando")
    setError(null)
    setProgreso(0)

    const formData = new FormData()
    formData.append("pdf", archivo)
    formData.append("titulo", titulo)
    formData.append("autor", autor)
    formData.append("paginas_por_parte", paginasPorParte)
    formData.append("proveedor", proveedor)
    if (vozArchivo) formData.append("voz", vozArchivo)

    const res = await fetch(`${API}/convertir`, {
      method: "POST",
      body: formData,
      credentials: "include"
    })
    const data = await res.json()

    if (!data.es_nuevo) {
      setEstado("inicial")
      setError(`Este libro ya existe en el sistema: "${data.titulo}"`)
      return
    }

    const intervalo = setInterval(async () => {
      const res = await fetch(`${API}/resultado/${data.tarea_id}`, {
        credentials: "include"
      })

      if (res.headers.get("content-type")?.includes("audio")) {
        clearInterval(intervalo)
        const blob = await res.blob()
        setMp3Url(URL.createObjectURL(blob))
        setEstado("listo")
        if (onLibroSubido) onLibroSubido()
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
          setError("Error inesperado")
          setEstado("inicial")
        }
      }
    }, 2000)
  }

  function resetear() {
    setEstado("inicial")
    setMp3Url(null)
    setError(null)
    setProgreso(0)
    setTitulo("")
    setAutor("")
    setArchivo(null)
    setVozArchivo(null)
  }

  return (
    <div className="bg-gray-900 rounded-2xl p-6 flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Subir nuevo libro</h2>

      {estado === "inicial" && (
        <div className="flex flex-col gap-3">
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

          <div className="w-full flex rounded-xl overflow-hidden border border-gray-700">
            {["edge", "google", "local"].map(p => (
              <button
                key={p}
                onClick={() => setProveedor(p)}
                className={`flex-1 py-2 text-sm font-medium transition ${
                  proveedor === p
                    ? "bg-blue-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:text-white"
                }`}
              >
                {p === "edge" ? "Edge TTS" : p === "google" ? "Google TTS" : "Local (GPU)"}
              </button>
            ))}
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

          <label className="w-full cursor-pointer border-2 border-dashed border-gray-700 hover:border-blue-500 transition rounded-xl p-6 flex flex-col items-center gap-2 text-gray-400 hover:text-blue-400">
            <span className="text-3xl">📄</span>
            <span className="text-sm">
              {archivo ? archivo.name : "Haz clic para seleccionar un PDF"}
            </span>
            <input
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={e => setArchivo(e.target.files[0])}
            />
          </label>

          {archivo && (
            <button
              onClick={handleArchivo}
              className="w-full bg-blue-600 hover:bg-blue-500 transition text-white font-medium py-2 rounded-xl text-sm"
            >
              Procesar PDF
            </button>
          )}

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        </div>
      )}

      {estado === "procesando" && (
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400 text-sm">Procesando primera parte... {progreso}%</p>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all"
              style={{ width: `${progreso}%` }}
            />
          </div>
        </div>
      )}

      {estado === "listo" && (
        <div className="flex flex-col items-center gap-4">
          <span className="text-4xl">✅</span>
          <p className="text-gray-300 text-sm">Primera parte lista. El resto se procesa en segundo plano.</p>
          <audio controls src={mp3Url} className="w-full" />
          <a
            href={mp3Url}
            download="kokito.mp3"
            className="w-full text-center bg-blue-600 hover:bg-blue-500 transition text-white font-medium py-2 rounded-xl text-sm"
          >
            Descargar MP3
          </a>
          <button
            onClick={resetear}
            className="text-gray-500 hover:text-gray-300 text-xs transition"
          >
            Subir otro PDF
          </button>
        </div>
      )}
    </div>
  )
}