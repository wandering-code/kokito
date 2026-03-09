import { useState } from "react"

const API = "http://localhost:8000"

function App() {
  const [estado, setEstado] = useState("inicial")
  const [proveedor, setProveedor] = useState("edge")
  const [tareaId, setTareaId] = useState(null)
  const [mp3Url, setMp3Url] = useState(null)
  const [error, setError] = useState(null)
  const [progreso, setProgreso] = useState(0)

  async function handleSubmit(e) {
    const archivo = e.target.files[0]
    if (!archivo) return

    setEstado("procesando")
    setError(null)

    const formData = new FormData()
    formData.append("pdf", archivo)
    formData.append("proveedor", proveedor)

    const res = await fetch(`${API}/convertir`, {
      method: "POST",
      body: formData,
    })
    const data = await res.json()
    setTareaId(data.tarea_id)

    const intervalo = setInterval(async () => {
      const res = await fetch(`${API}/resultado/${data.tarea_id}`)

      if (res.headers.get("content-type")?.includes("audio")) {
        clearInterval(intervalo)
        const blob = await res.blob()
        setMp3Url(URL.createObjectURL(blob))
        setEstado("listo")
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
        <p className="text-gray-400 text-sm text-center">
          Convierte un PDF a audio en segundos
        </p>

        {estado === "inicial" && (
          <div className="w-full flex flex-col items-center gap-4">
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
            </div>
          </div>

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
      </div>
    </div>
  )
}

export default App