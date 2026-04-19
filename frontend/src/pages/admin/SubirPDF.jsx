import { useState, useEffect, useRef } from "react"
import API from "../../config"
import "./SubirPDF.css"

const VOCES_PREDEFINIDAS = [
  { id: "voz_masculina_grave.mp3", nombre: "Voz 1", descripcion: "Masculina · grave" },
  { id: "voz_masculina_media.mp3", nombre: "Voz 2", descripcion: "Masculina · media" },
  { id: "voz_femenina_suave.mp3",  nombre: "Voz 3", descripcion: "Femenina · suave" },
  { id: "voz_masculina_joven.mp3",  nombre: "Voz 4", descripcion: "Masculina · joven" },
]

const GENEROS = [
  "", "Fantasía", "Ciencia ficción", "Terror", "Thriller / Suspense",
  "Romance", "Historia", "Biografía / Autobiografía", "Ensayo",
  "Aventura", "Misterio / Policiaco", "Infantil / Juvenil",
  "Clásicos", "Humor", "Autoayuda", "Otros"
]

const MAPEO_GENEROS = {
  "fantasy": "Fantasía", "fantasia": "Fantasía", "fantasía": "Fantasía",
  "science fiction": "Ciencia ficción", "ciencia ficcion": "Ciencia ficción",
  "horror": "Terror", "terror": "Terror",
  "thriller": "Thriller / Suspense", "suspense": "Thriller / Suspense",
  "romance": "Romance",
  "history": "Historia", "historia": "Historia",
  "biography": "Biografía / Autobiografía", "biografia": "Biografía / Autobiografía",
  "essays": "Ensayo", "ensayo": "Ensayo",
  "adventure": "Aventura", "aventura": "Aventura",
  "mystery": "Misterio / Policiaco", "detective": "Misterio / Policiaco", "policiaco": "Misterio / Policiaco",
  "children": "Infantil / Juvenil", "juvenile": "Infantil / Juvenil", "infantil": "Infantil / Juvenil",
  "humor": "Humor",
  "self-help": "Autoayuda", "autoayuda": "Autoayuda",
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

export default function SubirPDF({ onLibroSubido, libroEditando, onCancelarEdicion }) {
  const [titulo, setTitulo]                     = useState("")
  const [autor, setAutor]                       = useState("")
  const [serie, setSerie]                       = useState("")
  const [anio, setAnio]                         = useState("")
  const [genero, setGenero]                     = useState("")
  const [editorial, setEditorial]               = useState("")
  const [isbn, setIsbn]                         = useState("")
  const [sinopsis, setSinopsis]                 = useState("")
  const [paginasPorParte, setPaginasPorParte]   = useState(50)
  const [proveedor, setProveedor]               = useState("edge")
  const [vozSeleccionada, setVozSeleccionada]   = useState("voz_1")
  const [vozArchivo, setVozArchivo]             = useState(null)
  const [archivo, setArchivo]                   = useState(null)
  const [formatoArchivo, setFormatoArchivo]     = useState(null)
  const [capitulosEpub, setCapitulosEpub]       = useState([])
  const [capituloInicio, setCapituloInicio]     = useState(0)
  const [analizandoEpub, setAnalizandoEpub]     = useState(false)
  const [error, setError]                       = useState(null)
  const [vozReproduciendo, setVozReproduciendo] = useState(null)
  const [proveedorOcupado, setProveedorOcupado] = useState(false)
  const [busqueda, setBusqueda]                 = useState("")
  const [resultados, setResultados]             = useState([])
  const [buscando, setBuscando]                 = useState(false)
  const [portadaUrl, setPortadaUrl]             = useState("")
  const [portadaPreview, setPortadaPreview]     = useState("")
  const [vocesVoicebox, setVocesVoicebox]       = useState([])
  const [cargandoVoces, setCargandoVoces]       = useState(false)
  const [vozVoiceboxId, setVozVoiceboxId]       = useState(null)
  const audioActivo  = useRef(null)

  useEffect(() => {
    if (!libroEditando) { resetear(); return }
    setTitulo(libroEditando.titulo || "")
    setAutor(libroEditando.autor || "")
    setSerie(libroEditando.serie || "")
    setAnio(libroEditando.anio || "")
    setGenero(libroEditando.genero || "")
    setEditorial(libroEditando.editorial || "")
    setIsbn(libroEditando.isbn || "")
    setSinopsis(libroEditando.sinopsis || "")
    setPortadaUrl(libroEditando.portada_url || "")
    setPortadaPreview(libroEditando.portada_url || "")
    setArchivo(null)
    setError(null)
  }, [libroEditando])

  useEffect(() => {
    async function comprobarProveedor() {
      try {
        const res = await fetch(`${API}/admin/procesando`, { credentials: "include" })
        const data = await res.json()
        setProveedorOcupado(!!data.procesos[proveedor])
      } catch (e) {
        setProveedorOcupado(false)
      }
    }
    comprobarProveedor()
    const intervalo = setInterval(comprobarProveedor, 5000)
    return () => clearInterval(intervalo)
  }, [proveedor])

  useEffect(() => {
    if (proveedor !== "voicebox") return
    setCargandoVoces(true)
    fetch(`${API}/voces/voicebox`, { credentials: "include" })
      .then(r => r.json())
      .then(data => {
        setVocesVoicebox(data)
        if (data.length > 0) setVozVoiceboxId(data[0].id)
      })
      .catch(() => setVocesVoicebox([]))
      .finally(() => setCargandoVoces(false))
  }, [proveedor])

  async function comprobarProveedor() {
    try {
      const res = await fetch(`${API}/admin/procesando`, { credentials: "include" })
      const data = await res.json()
      setProveedorOcupado(!!data.procesos[proveedor])
    } catch (e) {
      setProveedorOcupado(false)
    }
  }

  async function handleArchivoSeleccionado(file) {
    if (!file) return
    const ext = file.name.split(".").pop().toLowerCase()
    const fmt = ext === "epub" ? "epub" : "pdf"
    setArchivo(file)
    setFormatoArchivo(fmt)
    setCapitulosEpub([])
    setCapituloInicio(0)

    if (fmt === "epub") {
      setAnalizandoEpub(true)
      try {
        const fd = new FormData()
        fd.append("epub", file)
        const res = await fetch(`${API}/analizar-epub`, {
          method: "POST", body: fd, credentials: "include"
        })
        const caps = await res.json()
        setCapitulosEpub(caps)
      } catch (e) {
        setError("No se pudo analizar el EPUB")
      } finally {
        setAnalizandoEpub(false)
      }
    }
  }

  function reproducirVoz(vozId, e) {
    e.stopPropagation()
    if (audioActivo.current && audioActivo.current.src.endsWith(vozId)) {
      audioActivo.current.pause()
      audioActivo.current = null
      setVozReproduciendo(null)
      return
    }
    if (audioActivo.current) { audioActivo.current.pause(); audioActivo.current = null }
    const audio = new Audio(`${API}/voces/${vozId}`)
    audio.play()
    audioActivo.current = audio
    setVozReproduciendo(vozId)
    audio.onended = () => { audioActivo.current = null; setVozReproduciendo(null) }
  }

  async function handleSubmit() {
    if (!titulo.trim()) return setError("El título es obligatorio")
    setError(null)

    if (libroEditando) {
      const fd = new FormData()
      fd.append("titulo", titulo)
      fd.append("autor", autor)
      fd.append("serie", serie)
      fd.append("anio", anio || "")
      fd.append("genero", genero)
      fd.append("editorial", editorial)
      fd.append("isbn", isbn)
      fd.append("sinopsis", sinopsis)
      fd.append("portada_url", portadaUrl)
      const res = await fetch(`${API}/libros/${libroEditando.id}/metadatos`, {
        method: "PATCH", body: fd, credentials: "include"
      })
      if (res.ok) {
        if (onLibroSubido) onLibroSubido()
      } else {
        setError("Error al guardar los cambios")
      }
      return
    }

    if (!archivo) return setError("Selecciona un archivo PDF o EPUB")

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
    fd.append("capitulo_inicio", capituloInicio)

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

    if (proveedor === "voicebox" && vozVoiceboxId) {
      fd.append("voicebox_profile_id", vozVoiceboxId)
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
    setArchivo(null); setVozArchivo(null); setFormatoArchivo(null)
    setCapitulosEpub([]); setCapituloInicio(0)
    setVozSeleccionada("voz_1"); setProveedor("edge")
    setPortadaUrl(""); setPortadaPreview("")
    setVocesVoicebox([]); setVozVoiceboxId(null)
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

    if (libro.cover_i) {
      const url = `https://covers.openlibrary.org/b/id/${libro.cover_i}-L.jpg`
      setPortadaUrl(url); setPortadaPreview(url)
    } else if (libro.isbn?.[0]) {
      const url = `https://covers.openlibrary.org/b/isbn/${libro.isbn[0]}-L.jpg`
      setPortadaUrl(url); setPortadaPreview(url)
    }

    const generoInicial = detectarGenero(libro.subject)
    if (generoInicial) setGenero(generoInicial)

    if (libro.key) {
      try {
        const res = await fetch(`https://openlibrary.org${libro.key}.json`)
        const work = await res.json()
        const desc = work.description
        if (desc) setSinopsis(typeof desc === "string" ? desc : desc.value || "")
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

      {/* Buscador */}
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

      {/* Título */}
      <div className="spdf-field">
        <label>Título</label>
        <input type="text" placeholder="Título del libro" value={titulo}
          onChange={e => setTitulo(e.target.value)} />
      </div>

      {/* Autor / Serie */}
      <div className="spdf-row">
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

      {/* Año / Género */}
      <div className="spdf-row-2-1">
        <div className="spdf-field">
          <label>Año</label>
          <input
            type="text" inputMode="numeric" pattern="[0-9]*"
            placeholder="Año de publicación" value={anio || ""}
            onChange={e => setAnio(e.target.value.replace(/\D/g, ""))}
          />
        </div>
        <div className="spdf-field">
          <label>Género</label>
          <select className="spdf-select" value={genero} onChange={e => setGenero(e.target.value)}>
            {GENEROS.map(g => (
              <option key={g} value={g}>{g || "Selecciona un género"}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Editorial / ISBN */}
      <div className="spdf-row">
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

      {/* Sinopsis */}
      <div className="spdf-field">
        <label>Sinopsis</label>
        <textarea
          className="spdf-textarea"
          placeholder="Breve descripción del libro (opcional)"
          value={sinopsis} rows={3}
          onChange={e => setSinopsis(e.target.value)}
        />
      </div>

      {/* Portada */}
      <div className="spdf-field">
        <label>Portada</label>
        <div className="spdf-portada">
          {portadaPreview
            ? <img src={portadaPreview} alt="portada" className="spdf-portada-preview" />
            : <div className="spdf-portada-placeholder" />
          }
          <div className="spdf-portada-acciones">
            {portadaPreview && (
              <button className="spdf-portada-quitar"
                onClick={() => { setPortadaUrl(""); setPortadaPreview("") }}>
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

      {/* Campos solo para creación */}
      {!libroEditando && (
        <>
          {/* Zona de selección de archivo */}
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
              : <span className="spdf-drop-label">
                  <strong style={{ color: "var(--cr-brown)" }}>Selecciona un PDF o EPUB</strong> o arrastra aquí
                </span>
            }
            <input type="file" accept=".pdf,.epub" style={{ display: "none" }}
              onChange={e => handleArchivoSeleccionado(e.target.files[0])} />
          </label>

          {/* Analizando EPUB */}
          {analizandoEpub && (
            <p className="spdf-epub-analizando">Analizando capítulos del EPUB…</p>
          )}

          {/* Selector de capítulo inicial — solo para EPUB */}
          {formatoArchivo === "epub" && capitulosEpub.length > 0 && (
            <div className="spdf-field">
              <label>Empezar desde el capítulo</label>
              <select
                className="spdf-select"
                value={capituloInicio}
                onChange={e => setCapituloInicio(parseInt(e.target.value))}
              >
                {capitulosEpub.map(cap => (
                  <option key={cap.indice} value={cap.indice}>
                    {cap.indice + 1}. {cap.titulo || `Capítulo ${cap.indice + 1}`} ({cap.palabras} pal.)
                  </option>
                ))}
              </select>
              <span className="spdf-epub-info">
                Se procesará desde aquí hasta el final, luego del principio hasta el capítulo anterior
              </span>
            </div>
          )}

          {/* Páginas por parte — solo para PDF */}
          {formatoArchivo === "pdf" && (
            <div className="spdf-field">
              <label>Páginas por parte</label>
              <input type="number" value={paginasPorParte} min={10} max={200}
                onChange={e => setPaginasPorParte(parseInt(e.target.value))} />
            </div>
          )}

          {/* Motor de voz */}
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
              <button className={`spdf-tts-btn ${proveedor === "voicebox" ? "active" : ""}`}
                onClick={() => setProveedor("voicebox")}>
                Voicebox
              </button>
            </div>
          </div>

          {/* Voces Coqui */}
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

          {/* Voces Voicebox */}
          {proveedor === "voicebox" && (
            <div className="spdf-coqui">
              <div className="spdf-coqui-title">Voz</div>
              {cargandoVoces ? (
                <p className="spdf-epub-analizando">Cargando voces…</p>
              ) : vocesVoicebox.length === 0 ? (
                <p className="spdf-epub-analizando">No se pudieron cargar las voces. ¿Está Voicebox abierto?</p>
              ) : (
                <div className="spdf-voces">
                  {vocesVoicebox.map(voz => (
                    <div
                      key={voz.id}
                      className={`spdf-voz ${vozVoiceboxId === voz.id ? "selected" : ""}`}
                      onClick={() => setVozVoiceboxId(voz.id)}
                    >
                      <div className="spdf-voz-name">{voz.nombre}</div>
                      <div className="spdf-voz-desc">{voz.idioma === "es" ? "Español" : voz.idioma}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      {error && <p className="spdf-error">{error}</p>}

      <div className="spdf-actions">
        {libroEditando ? (
          <>
            <button className="spdf-btn-cancel" onClick={() => { resetear(); onCancelarEdicion() }}>
              Cancelar
            </button>
            <button className="spdf-btn-submit" onClick={handleSubmit} disabled={!titulo.trim()}>
              Guardar cambios
            </button>
          </>
        ) : (
          <>
            <button className="spdf-btn-cancel" onClick={resetear}>Limpiar</button>
            <button
              className="spdf-btn-submit"
              onClick={handleSubmit}
              disabled={!archivo || proveedorOcupado || analizandoEpub}
              title={proveedorOcupado ? `El motor ${proveedor} ya está procesando un libro` : ""}
            >
              {proveedorOcupado ? "Motor ocupado" : analizandoEpub ? "Analizando…" : "Procesar libro"}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
