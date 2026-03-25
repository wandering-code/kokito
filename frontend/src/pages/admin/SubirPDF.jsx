import { useState, useEffect } from "react"
import API from "../../config"
import "./SubirPDF.css"

const VOCES_PREDEFINIDAS = [
  { id: "voz_masculina_grave.mp3", nombre: "Voz 1", descripcion: "Masculina · grave" },
  { id: "voz_masculina_media.mp3", nombre: "Voz 2", descripcion: "Masculina · media" },
  { id: "voz_femenina_suave.mp3", nombre: "Voz 3", descripcion: "Femenina · suave" },
]

export default function SubirPDF({ onLibroSubido }) {
  const [titulo, setTitulo]               = useState("")
  const [autor, setAutor]                 = useState("")
  const [paginasPorParte, setPaginasPorParte] = useState(50)
  const [proveedor, setProveedor]         = useState("edge")
  const [vozSeleccionada, setVozSeleccionada] = useState("voz_1")
  const [vozArchivo, setVozArchivo]       = useState(null)
  const [archivo, setArchivo]             = useState(null)
  const [estado, setEstado]               = useState("inicial")
  const [progreso, setProgreso]           = useState(0)
  const [error, setError]                 = useState(null)

  function reproducirVoz(vozId, e) {
    e.stopPropagation()
    const audio = new Audio(`${API}/voces/${vozId}`)
    audio.play()
  }

  async function handleSubmit() {
    if (!archivo)       return setError("Selecciona un PDF")
    if (!titulo.trim()) return setError("El título es obligatorio")

    setEstado("procesando")
    setError(null)
    setProgreso(0)

    const fd = new FormData()
    fd.append("pdf", archivo)
    fd.append("titulo", titulo)
    fd.append("autor", autor)
    fd.append("paginas_por_parte", paginasPorParte)
    fd.append("proveedor", proveedor)

    if (proveedor === "local") {
      if (vozArchivo) {
        fd.append("voz", vozArchivo)
      } else if (vozSeleccionada) {
        // Fetchear el archivo de voz predefinida y añadirlo como File
        const vozRes = await fetch(`${API}/voces/${vozSeleccionada}`)
        const vozBlob = await vozRes.blob()
        const vozFile = new File([vozBlob], vozSeleccionada, { type: "audio/mpeg" })
        fd.append("voz", vozFile)
      }
    }

    const res = await fetch(`${API}/convertir`, {
      method: "POST", body: fd, credentials: "include"
    })
    const data = await res.json()

    if (!data.es_nuevo) {
      setEstado("inicial")
      setError(`Este libro ya existe: "${data.titulo}"`)
      return
    }

    const intervalo = setInterval(async () => {
      const r = await fetch(`${API}/resultado/${data.tarea_id}`, { credentials: "include" })
      if (r.headers.get("content-type")?.includes("audio")) {
        clearInterval(intervalo)
        setEstado("listo")
        if (onLibroSubido) onLibroSubido()
      } else {
        const result = await r.json()
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
    setEstado("inicial"); setError(null); setProgreso(0)
    setTitulo(""); setAutor(""); setArchivo(null); setVozArchivo(null)
    setVozSeleccionada("voz_1"); setProveedor("edge")
  }

  function reproducirVoz(vozId, e) {
    e.stopPropagation()
    const audio = new Audio(`${API}/voces/${vozId}`)
    audio.play()
  }

  if (estado === "procesando") return (
    <div className="spdf-progreso">
      <div className="spdf-spinner" />
      <div className="spdf-prog-label">Procesando primera parte… {progreso}%</div>
      <div className="spdf-prog-bar-wrap">
        <div className="spdf-prog-bar" style={{ width: `${progreso}%` }} />
      </div>
    </div>
  )

  if (estado === "listo") return (
    <div className="spdf-listo">
      <div className="spdf-listo-icon">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M4 10l4 4 8-8" stroke="var(--cr-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
      <div className="spdf-listo-msg">Primera parte lista</div>
      <div className="spdf-listo-sub">El resto se procesa en segundo plano.</div>
      <button className="spdf-btn-otro" onClick={resetear}>Subir otro libro</button>
    </div>
  )

  return (
    <div className="spdf-grid">
      <div className="spdf-row">
        <div className="spdf-field spdf-full">
          <label>Título</label>
          <input type="text" placeholder="Título del libro" value={titulo}
            onChange={e => setTitulo(e.target.value)} />
        </div>
        <div className="spdf-field">
          <label>Autor</label>
          <input type="text" placeholder="Autor (opcional)" value={autor}
            onChange={e => setAutor(e.target.value)} />
        </div>
        <div className="spdf-field">
          <label>Páginas por parte</label>
          <input type="number" value={paginasPorParte} min={10} max={200}
            onChange={e => setPaginasPorParte(parseInt(e.target.value))} />
        </div>
      </div>

      <div className="spdf-field">
        <label>Motor de voz</label>
        <div className="spdf-tts">
          <button className={`spdf-tts-btn ${proveedor === "edge" ? "active" : ""}`}
            onClick={() => setProveedor("edge")}>
            Edge TTS
          </button>
          <button className={`spdf-tts-btn ${proveedor === "local" ? "active" : ""}`}
            onClick={() => setProveedor("local")}>
            Coqui (IA local)
          </button>
        </div>
      </div>

      {proveedor === "local" && (
        <div className="spdf-coqui">
          <div className="spdf-coqui-title">Voz</div>
          <div className="spdf-voces">
            {VOCES_PREDEFINIDAS.map(voz => (
              <div
                key={voz.id}
                className={`spdf-voz ${!vozArchivo && vozSeleccionada === voz.id ? "selected" : ""}`}
                onClick={() => { setVozSeleccionada(voz.id); setVozArchivo(null) }}
              >
                <div className="spdf-voz-name">{voz.nombre}</div>
                <div className="spdf-voz-desc">{voz.descripcion}</div>
                <button className="spdf-voz-play" onClick={e => reproducirVoz(voz.id, e)}>
                  <svg width="8" height="10" viewBox="0 0 8 10" fill="var(--cr-brown)">
                    <polygon points="0,0 8,5 0,10"/>
                  </svg>
                </button>
              </div>
            ))}
          </div>

          <label className="spdf-voz-custom">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
              stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
              <circle cx="7" cy="5" r="2.5"/>
              <path d="M2 12c0-2.8 2.2-5 5-5s5 2.2 5 5"/>
            </svg>
            <span>{vozArchivo ? vozArchivo.name : "O sube tu propio archivo de voz (MP3 / WAV)"}</span>
            <input type="file" accept=".mp3,.wav" className="hidden" style={{ display: "none" }}
              onChange={e => { setVozArchivo(e.target.files[0]); setVozSeleccionada(null) }} />
          </label>
          {vozArchivo && (
            <div className="spdf-voz-nombre">{vozArchivo.name}</div>
          )}
        </div>
      )}

      <label className={`spdf-drop ${archivo ? "con-archivo" : ""}`}>
        <svg width="28" height="28" viewBox="0 0 28 28" fill="none"
          stroke={archivo ? "var(--cr-green)" : "var(--cr-tan)"} strokeWidth="1.5" strokeLinecap="round">
          <rect x="4" y="2" width="20" height="24" rx="3"/>
          <line x1="8" y1="9"  x2="20" y2="9"/>
          <line x1="8" y1="14" x2="20" y2="14"/>
          <line x1="8" y1="19" x2="15" y2="19"/>
        </svg>
        {archivo
          ? <span className="spdf-drop-nombre">{archivo.name}</span>
          : <span className="spdf-drop-label"><strong style={{color:"var(--cr-brown)"}}>Selecciona un PDF</strong> o arrastra aquí</span>
        }
        <input type="file" accept=".pdf" style={{ display: "none" }}
          onChange={e => setArchivo(e.target.files[0])} />
      </label>

      {error && <p className="spdf-error">{error}</p>}

      <div className="spdf-actions">
        <button className="spdf-btn-cancel" onClick={resetear}>Limpiar</button>
        <button className="spdf-btn-submit" onClick={handleSubmit} disabled={!archivo}>
          Procesar libro
        </button>
      </div>
    </div>
  )
}