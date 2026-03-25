import { useAuth } from "../../AuthContext"
import { useNavigate } from "react-router-dom"
import { useState } from "react"
import SubirPDF from "./SubirPDF"
import ListaLibros from "./ListaLibros"
import "./AdminPage.css"

export default function AdminPage() {
  const { usuario, logout } = useAuth()
  const navigate = useNavigate()
  const [refreshLibros, setRefreshLibros] = useState(0)

  return (
    <div className="adm-root">
      <div className="adm-topbar">
        <div className="adm-brand">
          <span className="adm-brand-name">kokito</span>
          <span className="adm-badge">administración</span>
        </div>
        <div className="adm-actions">
          <button
            className="adm-btn"
            onClick={() => navigate("/biblioteca", { state: { modoAdmin: true }, replace: true })}
          >
            Ver como usuario
          </button>
          <span className="adm-user-name">Hola, {usuario.nombre}</span>
          <button className="adm-btn salir" onClick={logout}>Cerrar sesión</button>
        </div>
      </div>

      <div className="adm-content">
        <div className="adm-card">
          <div className="adm-section-title">Nuevo libro</div>
          <SubirPDF onLibroSubido={() => setRefreshLibros(r => r + 1)} />
        </div>

        <div className="adm-card">
          <div className="adm-section-title">Libros en el sistema</div>
          <ListaLibros refresh={refreshLibros} />
        </div>
      </div>
    </div>
  )
}