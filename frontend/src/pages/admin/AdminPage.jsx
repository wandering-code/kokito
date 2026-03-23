import { useState } from "react"
import { useAuth } from "../../AuthContext"
import BibliotecaPage from "../usuario/BibliotecaPage"
import SubirPDF from "./SubirPDF"
import ListaLibros from "./ListaLibros"

export default function AdminPage() {
  const { usuario, logout } = useAuth()
  const [vistaUsuario, setVistaUsuario] = useState(false)
  const [refreshLibros, setRefreshLibros] = useState(0)

  if (vistaUsuario) {
    return (
      <div>
        <div style={{backgroundColor: "#1e3a5f"}} className="px-6 py-2 flex justify-between items-center">
          <span className="text-white text-xs font-medium">👁 Viendo como usuario</span>
          <button
            onClick={() => setVistaUsuario(false)}
            style={{backgroundColor: "#2d5a8e"}}
            className="text-white text-xs px-3 py-1 rounded-lg hover:opacity-80 transition"
          >
            ← Volver al panel de admin
          </button>
        </div>
        <BibliotecaPage modoAdmin={true} />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Panel de administración</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setVistaUsuario(true)}
              style={{backgroundColor: "#2d5a8e"}}
              className="text-white text-sm px-4 py-2 rounded-lg hover:opacity-80 transition font-medium"
            >
              Ver como usuario
            </button>
            <span className="text-gray-400 text-sm">Hola, {usuario.nombre}</span>
            <button
              onClick={logout}
              className="text-white text-sm px-4 py-2 rounded-lg transition font-medium"
              style={{backgroundColor: "#374151"}}
            >
              Cerrar sesión
            </button>
          </div>
        </div>

        <SubirPDF onLibroSubido={() => setRefreshLibros(r => r + 1)} />
        <ListaLibros refresh={refreshLibros} />
      </div>
    </div>
  )
}