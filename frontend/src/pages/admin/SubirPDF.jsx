import { useState, useEffect, useRef } from "react"
import API from "../../config"
import "./SubirPDF.css"

const VOCES_PREDEFINIDAS = [
  { id: "voz_masculina_grave.mp3", nombre: "Voz 1", descripcion: "Masculina · grave" },
  { id: "voz_masculina_media.mp3", nombre: "Voz 2", descripcion: "Masculina · media" },
  { id: "voz_femenina_suave.mp3", nombre: "Voz 3", descripcion: "Femenina · suave" },
]

const GENEROS = [
  "", "Fantasía", "Ciencia ficción", "Terror", "Thriller / Suspense",
  "Romance", "Historia", "Biografía / Autobiografía", "Ensayo",
  "Aventura", "Misterio / Policiaco", "Infantil / Juvenil",
  "Clásicos", "Humor", "Autoayuda", "Otros"
]

const MAPEO_GENEROS = {
  "fantasy": "Fantasía",
  "fantasia": "Fantasía",
  "fantasía": "Fantasía",
  "science fiction": "Ciencia ficción",
  "ciencia ficcion": "Ciencia ficción",
  "horror": "Terror",
  "terror": "Terror",
  "thriller": "Thriller / Suspense",
  "suspense": "Thriller / Suspense",
  "romance": "Romance",
  "history": "Historia",
  "historia": "Historia",
  "biography": "Biografía / Autobiografía",
  "biografia": "Biografía / Autobiografía",
  "essays": "Ensayo",
  "ensayo": "Ensayo",
  "adventure": "Aventura",
  "aventura": "Aventura",
  "mystery": "Misterio / Policiaco",
  "detective": "Misterio / Policiaco",
  "policiaco": "Misterio / Policiaco",
  "children": "Infantil / Juvenil",
  "juvenile": "Infantil / Juvenil",
  "infantil": "Infantil / Juvenil",
  "humor": "Humor",
  "self-help": "Autoayuda",
  "autoayuda": "Autoayuda",
}

function detectarGenero(subjects) {
  if (!subjects?.length) return ""
  for (const subject of subjects) {
    const lower = subject.toLowerCase()
    for (const [clave, genero] of Object.entries(MAPEO_GENEROS)) {
      if (lower.includes(clave)) return genero
    }
  }
  return ""
}

export default function SubirPDF({ onLibroSubido }) {
  const [titulo, setTitulo]                   = useState("")
  const [autor, setAutor]                     = useState("")
  const [serie, setSerie]                     = useState("")
  const [anio, setAnio]                       = useState("")
  const [genero, setGenero]                   = useState("")
  const [editorial, setEditorial]             = useState("")
  const [isbn, setIsbn]                       = useState("")
  const [sinopsis, setSinopsis]               = useState("")
  const [paginasPorParte, setPaginasPorParte] = useState(50)
  const [proveedor, setProveedor]             = useState("edge")
  const [vozSeleccionada, setVozSeleccionada] = useState("voz_1")
  const [vozArchivo, setVozArchivo]           = useState(null)
  const [archivo, setArchivo]                 = useState(null)
  const [error, setError]                     = useState(null)
  const [vozReproduciendo, setVozReproduciendo] = useState(null)
  const [proveedorOcupado, setProveedorOcupado] = useState(false)
  const [busqueda, setBusqueda]           = useState("")
  const [resultados, setResultados]       = useState([])
  const [buscando, setBuscando]           = useState(false)
  const [portadaUrl, setPortadaUrl] = useState("")
  const [portadaPreview, setPortadaPreview] = useState("")
  const audioActivo = useRef(null)
  const intervaloRef = useRef(null)

  async function comprobarProveedor() {
    try {
      const res = await fetch(`${API}/admin/procesando`, { credentials: "include" })
      const data = await res.json()
      setProveedorOcupado(!!data.procesos[proveedor])
    } catch (e) {
      setProveedorOcupado(false)
    }
  }

  useEffect(() => {
    async function comprobarYPolling() {
      try {
        const res = await fetch(`${API}/admin/procesando`, { credentials: "include" })
        const data = await res.json()
        const ocupado = !!data.procesos[proveedor]
        setProveedorOcupado(ocupado)
        if (!ocupado && intervaloRef.current) {
          clearInterval(intervaloRef.current)
          intervaloRef.current = null
        }
      } catch (e) {
        setProveedorOcupado(false)
      }
    }

    comprobarYPolling()
    intervaloRef.current = setInterval(comprobarYPolling, 5000)
    return () => {
      clearInterval(intervaloRef.current)
      intervaloRef.current = null
    }
  }, [proveedor])

  function reproducirVoz(vozId, e) {
    e.stopPropagation()
    if (audioActivo.current && audioActivo.current.src.endsWith(vozId)) {
      audioActivo.current.pause()
      audioActivo.current = null
      setVozReproduciendo(null)
      return
    }
    if (audioActivo.current) {
      audioActivo.current.pause()
      audioActivo.current = null
    }
    const audio = new Audio(`${API}/voces/${vozId}`)
    audio.play()
    audioActivo.current = audio
    setVozReproduciendo(vozId)
    audio.onended = () => {
      audioActivo.current = null
      setVozReproduciendo(null)
    }
  }

  async function handleSubmit() {
    if (!archivo)       return setError("Selecciona un PDF")
    if (!titulo.trim()) return setError("El título es obligatorio")
    setError(null)

    const fd = new FormData()
    fd.append("pdf", archivo)
    fd.append("titulo", titulo)
    fd.append("autor", autor)
    fd.append("serie", serie)
    fd.append("anio", anio || "")
    fd.append("genero", genero)
    fd.append("editorial", editorial)
    fd.append("isbn", isbn)
    fd.append("sinopsis", sinopsis)
    fd.append("paginas_por_parte", paginasPorParte)
    fd.append("proveedor", proveedor)
    fd.append("portada_url", portadaUrl)

    if (proveedor === "local") {
      if (vozArchivo) {
        fd.append("voz", vozArchivo)
      } else if (vozSeleccionada) {
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
      setError(`Este libro ya existe: "${data.titulo}"`)
      return
    }

    if (onLibroSubido) onLibroSubido()
    await comprobarProveedor()
  }

  function resetear() {
    setError(null)
    setTitulo(""); setAutor(""); setSerie(""); setAnio("")
    setGenero(""); setEditorial(""); setIsbn(""); setSinopsis("")
    setArchivo(null); setVozArchivo(null)
    setVozSeleccionada("voz_1"); setProveedor("edge")
    setPortadaUrl(""); setPortadaPreview("")
  }

  async function buscarLibro() {
    if (!busqueda.trim()) return
    setBuscando(true)
    setResultados([])
    try {
      const res = await fetch(
        `https://openlibrary.org/search.json?title=${encodeURIComponent(busqueda)}&limit=5&lang=spa`
      )
      const data = await res.json()
      setResultados(data.docs || [])
    } catch (e) {
      setResultados([])
    } finally {
      setBuscando(false)
    }
  }

  async function seleccionarResultado(libro) {
    setTitulo(libro.title || "")
    setAutor(libro.author_name?.[0] || "")
    setAnio(libro.first_publish_year?.toString() || "")
    setEditorial(libro.publisher?.[0] || "")
    setIsbn(libro.isbn?.[0] || "")

    // Portada
    if (libro.cover_i) {
      const url = `https://covers.openlibrary.org/b/id/${libro.cover_i}-L.jpg`
      setPortadaUrl(url)
      setPortadaPreview(url)
    } else if (libro.isbn?.[0]) {
      const url = `https://covers.openlibrary.org/b/isbn/${libro.isbn[0]}-L.jpg`
      setPortadaUrl(url)
      setPortadaPreview(url)
    }

    // Intentar género desde subjects de la búsqueda primero
    const generoInicial = detectarGenero(libro.subject)
    if (generoInicial) setGenero(generoInicial)

    // Llamada al work para sinopsis y subjects más completos
    if (libro.key) {
      try {
        const res = await fetch(`https://openlibrary.org${libro.key}.json`)
        const work = await res.json()

        // Sinopsis
        const desc = work.description
        if (desc) setSinopsis(typeof desc === "string" ? desc : desc.value || "")

        // Subjects del work — más completos que los de la búsqueda
        if (!generoInicial) {
          const subjects = [
            ...(work.subjects || []),
            ...(work.subject_places || []),
            ...(work.subject_times || []),
          ]
          const generoWork = detectarGenero(subjects)
          if (generoWork) setGenero(generoWork)
        }
      } catch (e) {}
    }

    setResultados([])
    setBusqueda("")
  }

  async function handlePortada(e) {
    const file = e.target.files[0]
    if (!file) return
    setPortadaPreview(URL.createObjectURL(file))

    const fd = new FormData()
    fd.append("imagen", file)
    try {
      const res = await fetch(`${API}/portadas`, {
        method: "POST", body: fd, credentials: "include"
      })
      const data = await res.json()
      setPortadaUrl(`${API}${data.url}`)
    } catch (e) {}
  }

  return (
    <div className="spdf-grid">
      <div className="spdf-busqueda">
        <div className="spdf-busqueda-row">
          <input
            type="text"
            className="spdf-busqueda-input"
            placeholder="Buscar libro por título para autocompletar…"
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
            onKeyDown={e => e.key === "Enter" && buscarLibro()}
          />
          <button
            className="spdf-busqueda-btn"
            onClick={buscarLibro}
            disabled={buscando || !busqueda.trim()}
          >
            {buscando ? "Buscando…" : "Buscar"}
          </button>
        </div>

        {resultados.length > 0 && (
          <div className="spdf-resultados">
            {resultados.map((libro, i) => (
              <div key={i} className="spdf-resultado" onClick={() => seleccionarResultado(libro)}>
              <div className="spdf-resultado-cover">
                {libro.cover_i
                  ? <img
                      src={`https://covers.openlibrary.org/b/id/${libro.cover_i}-S.jpg`}
                      alt=""
                      onError={e => { e.target.style.display = "none" }}
                    />
                  : <div className="spdf-resultado-nocover" />
                }
              </div>
                <div className="spdf-resultado-info">
                  <div className="spdf-resultado-titulo">{libro.title}</div>
                  <div className="spdf-resultado-meta">
                    {libro.author_name?.[0]}
                    {libro.first_publish_year ? ` · ${libro.first_publish_year}` : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="spdf-row">
        <div className="spdf-field spdf-full">
          <label>Título</label>
          <input type="text" placeholder="Título del libro" value={titulo}
            onChange={e => setTitulo(e.target.value)} />
        </div>
        <div className="spdf-field">
          <label>Autor</label>
          <input type="text" placeholder="Autor" value={autor}
            onChange={e => setAutor(e.target.value)} />
        </div>
        <div className="spdf-field">
          <label>Serie</label>
          <input type="text" placeholder="Nombre de la serie (opcional)" value={serie}
            onChange={e => setSerie(e.target.value)} />
        </div>
      </div>

      <div className="spdf-row">
        <div className="spdf-field">
          <label>Año</label>
          <input type="number" placeholder="Año de publicación" value={anio}
            onChange={e => setAnio(e.target.value)} />
        </div>
        <div className="spdf-field">
          <label>Género</label>
          <select
            className="spdf-select"
            value={genero}
            onChange={e => setGenero(e.target.value)}
          >
            {GENEROS.map(g => (
              <option key={g} value={g}>{g || "Selecciona un género"}</option>
            ))}
          </select>
        </div>
        <div className="spdf-field">
          <label>Editorial</label>
          <input type="text" placeholder="Editorial" value={editorial}
            onChange={e => setEditorial(e.target.value)} />
        </div>
        <div className="spdf-field">
          <label>ISBN</label>
          <input type="text" placeholder="ISBN" value={isbn}
            onChange={e => setIsbn(e.target.value)} />
        </div>
      </div>

      <div className="spdf-field">
        <label>Sinopsis</label>
        <textarea
          className="spdf-textarea"
          placeholder="Breve descripción del libro (opcional)"
          value={sinopsis}
          rows={3}
          onChange={e => setSinopsis(e.target.value)}
        />
      </div>

      <div className="spdf-field">
        <label>Portada</label>
        <div className="spdf-portada">
          {portadaPreview
            ? <img src={portadaPreview} alt="portada" className="spdf-portada-preview" />
            : <div className="spdf-portada-placeholder" />
          }
          <div className="spdf-portada-acciones">
            {portadaPreview && (
              <button
                className="spdf-portada-quitar"
                onClick={() => { setPortadaUrl(""); setPortadaPreview("") }}
              >
                Quitar portada
              </button>
            )}
            <label className="spdf-portada-subir">
              {portadaPreview ? "Cambiar imagen" : "Subir imagen"}
              <input type="file" accept="image/*" style={{ display: "none" }}
                onChange={handlePortada} />
            </label>
          </div>
        </div>
      </div>

      <div className="spdf-row">
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
          <label className="spdf-voz-custom">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"
              stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
              <circle cx="7" cy="5" r="2.5"/>
              <path d="M2 12c0-2.8 2.2-5 5-5s5 2.2 5 5"/>
            </svg>
            <span>{vozArchivo ? vozArchivo.name : "O sube tu propio archivo de voz (MP3 / WAV)"}</span>
            <input type="file" accept=".mp3,.wav" style={{ display: "none" }}
              onChange={e => { setVozArchivo(e.target.files[0]); setVozSeleccionada(null) }} />
          </label>
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
        <button
          className="spdf-btn-submit"
          onClick={handleSubmit}
          disabled={!archivo || proveedorOcupado}
          title={proveedorOcupado ? `El motor ${proveedor} ya está procesando un libro` : ""}
        >
          {proveedorOcupado ? "Motor ocupado" : "Procesar libro"}
        </button>
      </div>
    </div>
  )
}