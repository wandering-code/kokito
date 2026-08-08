import { useState, useEffect, useRef, useCallback } from "react"
import API from "../../config"
import "./AdminLogsPage.css"

const INTERVALO_REFRESCO_MS = 5000
const LINEAS = 300

export default function AdminLogsPage() {
  const [logs, setLogs]           = useState("")
  const [error, setError]         = useState(null)
  const [cargando, setCargando]   = useState(true)
  const [autoRefresco, setAutoRefresco] = useState(true)
  const preRef = useRef(null)

  const cargar = useCallback(async () => {
    try {
      const res = await fetch(`${API}/admin/logs/voicepoweredai?lines=${LINEAS}`, {
        credentials: "include"
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw new Error(data?.detail || "No se pudieron obtener los logs")
      }
      const data = await res.json()
      setLogs(data.logs || "")
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])

  useEffect(() => {
    if (!autoRefresco) return
    const id = setInterval(cargar, INTERVALO_REFRESCO_MS)
    return () => clearInterval(id)
  }, [autoRefresco, cargar])

  useEffect(() => {
    if (preRef.current) {
      preRef.current.scrollTop = preRef.current.scrollHeight
    }
  }, [logs])

  return (
    <div className="alog-root">
      <div className="alog-card">
        <div className="alog-header">
          <div className="alog-header-titulo">
            <div className="alog-card-title">Logs — VoicePoweredAI (sobremesa)</div>
            <div className="alog-subtitulo">192.168.1.51:8003 · IP de LAN por DHCP, puede cambiar</div>
          </div>
          <div className="alog-acciones">
            <label className="alog-toggle">
              <input
                type="checkbox"
                checked={autoRefresco}
                onChange={e => setAutoRefresco(e.target.checked)}
              />
              Auto (5s)
            </label>
            <button className="alog-btn-refrescar" onClick={cargar} disabled={cargando}>
              {cargando ? "Cargando…" : "Actualizar"}
            </button>
          </div>
        </div>

        {error ? (
          <div className="alog-error">
            No se pudo conectar con el servidor: {error}
          </div>
        ) : (
          <pre ref={preRef} className="alog-pre">
            {logs || (cargando ? "Cargando logs…" : "Sin datos")}
          </pre>
        )}
      </div>
    </div>
  )
}
