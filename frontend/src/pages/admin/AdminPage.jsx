import { useAuth } from "../../context/AuthContext"
import { useState } from "react"
import SubirPDF from "./SubirPDF"
import ListaLibros from "./ListaLibros"
import "./AdminPage.css"

export default function AdminPage() {
  const [refreshLibros, setRefreshLibros] = useState(0)
  const [libroEditando, setLibroEditando] = useState(null)

  function handleLibroSubido() {
    setLibroEditando(null)
    setRefreshLibros(r => r + 1)
  }

  function handleEditar(libro) {
    setLibroEditando(libro)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  function handleCancelarEdicion() {
    setLibroEditando(null)
  }

  return (
    <div className="adm-root">
      <div className="adm-content">
        <div className="adm-card">
          <div className="adm-section-title">
            {libroEditando ? `Editando: ${libroEditando.titulo}` : "Nuevo libro"}
          </div>
          <SubirPDF
            onLibroSubido={handleLibroSubido}
            libroEditando={libroEditando}
            onCancelarEdicion={handleCancelarEdicion}
          />
        </div>

        <div className="adm-card">
          <div className="adm-section-title">Libros en el sistema</div>
          <ListaLibros refresh={refreshLibros} onEditar={handleEditar} />
        </div>
      </div>
    </div>
  )
}