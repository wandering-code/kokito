import { useAuth } from "../../context/AuthContext"
import { useState } from "react"
import SubirPDF from "./SubirPDF"
import ListaLibros from "./ListaLibros"
import "./AdminPage.css"

export default function AdminPage() {
  const [refreshLibros, setRefreshLibros] = useState(0)

  return (
    <div className="adm-root">
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