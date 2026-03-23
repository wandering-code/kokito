import { Routes, Route, Navigate } from "react-router-dom"
import { useAuth } from "./AuthContext"
import LoginPage from "./LoginPage"
import AdminPage from "./pages/admin/AdminPage"
import BibliotecaPage from "./pages/usuario/BibliotecaPage"

function RutaProtegida({ children }) {
  const { usuario, cargando } = useAuth()

  if (cargando) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!usuario) return <Navigate to="/login" />
  return children
}

function RutaAdmin({ children }) {
  const { usuario } = useAuth()
  if (usuario?.rol !== "admin") return <Navigate to="/biblioteca" />
  return children
}

export default function App() {
  const { usuario, cargando } = useAuth()

  if (cargando) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <Routes>
      <Route path="/login" element={
        usuario ? <Navigate to={usuario.rol === "admin" ? "/admin" : "/biblioteca"} /> : <LoginPage />
      } />

      <Route path="/admin/*" element={
        <RutaProtegida>
          <RutaAdmin>
            <AdminPage />
          </RutaAdmin>
        </RutaProtegida>
      } />

      <Route path="/biblioteca" element={
        <RutaProtegida>
          <BibliotecaPage />
        </RutaProtegida>
      } />

      <Route path="/" element={
        usuario
          ? <Navigate to={usuario.rol === "admin" ? "/admin" : "/biblioteca"} />
          : <Navigate to="/login" />
      } />
    </Routes>
  )
}