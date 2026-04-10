import { Routes, Route, Navigate } from "react-router-dom"
import { useAuth } from "./context/AuthContext"
import LoginPage from "./LoginPage"
import AdminPage from "./pages/admin/AdminPage"
import BibliotecaPage from "./pages/usuario/BibliotecaPage"
import LibroPage from "./pages/usuario/LibroPage"
import NavBar from "./components/NavBar"
import RegistroPage from "./pages/RegistroPage"
import AdminUsuariosPage from "./pages/admin/AdminUsuariosPage"
import SpinnerGato from "./components/SpinnerGato"
import AdminNovedadesPage from "./pages/admin/AdminNovedadesPage"
import ModalNovedades from "./components/ModalNovedades"
import SolicitudesPage from "./pages/usuario/SolicitudesPage"
import AdminSolicitudesPage from "./pages/admin/AdminSolicitudesPage"

function RutaProtegida({ children }) {
  const { usuario, cargando } = useAuth()

  if (cargando) {
    return <SpinnerGato />
  }

  if (!usuario) return <Navigate to="/login" />

  return (
    <>
      <ModalNovedades />
      <NavBar />
      <div className="contenido-principal">
        {children}
      </div>
    </>
  )
}

function RutaAdmin({ children }) {
  const { usuario } = useAuth()
  if (usuario?.rol !== "admin") return <Navigate to="/biblioteca" />
  return children
}

export default function App() {
  const { usuario, cargando } = useAuth()

  if (cargando) {
    return <SpinnerGato />
  }

  return (
    <Routes>
      <Route path="/login" element={
        usuario
          ? <Navigate to={usuario.rol === "admin" ? "/admin/libros" : "/biblioteca"} />
          : <LoginPage />
      } />

      <Route path="/registro" element={
        usuario ? <Navigate to="/biblioteca" /> : <RegistroPage />
      } />

      <Route path="/admin/usuarios" element={
        <RutaProtegida>
          <RutaAdmin>
            <AdminUsuariosPage />
          </RutaAdmin>
        </RutaProtegida>
      } />

      <Route path="/admin/libros" element={
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

      <Route path="/libro/:id" element={
        <RutaProtegida>
          <LibroPage />
        </RutaProtegida>
      } />

      <Route path="/admin/novedades" element={
        <RutaProtegida>
          <RutaAdmin>
            <AdminNovedadesPage />
          </RutaAdmin>
        </RutaProtegida>
      } />

      <Route path="/solicitudes" element={
        <RutaProtegida>
          <SolicitudesPage />
        </RutaProtegida>
      } />

      <Route path="/admin/solicitudes" element={
        <RutaProtegida>
          <RutaAdmin>
            <AdminSolicitudesPage />
          </RutaAdmin>
        </RutaProtegida>
      } />

      <Route path="/" element={
        usuario
          ? <Navigate to={usuario.rol === "admin" ? "/admin/libros" : "/biblioteca"} />
          : <Navigate to="/login" />
      } />
    </Routes>
  )
}