import { useState, useRef, useEffect } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { BookOpen, Settings, User, LogOut, ChevronDown } from "lucide-react"
import { useAuth } from "../context/AuthContext"
import "./NavBar.css"

export default function NavBar() {
  const { usuario, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuAbierto, setMenuAbierto] = useState(false)
  const menuRef = useRef(null)

  const esAdmin = usuario?.rol === "admin"
  const rutaActual = location.pathname
  const [adminMenuAbierto, setAdminMenuAbierto] = useState(false)
  const adminMenuRef = useRef(null)

  // Cierra el menú si se hace click fuera
  useEffect(() => {
    function handleClickFuera(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuAbierto(false)
      }
    }
    document.addEventListener("mousedown", handleClickFuera)
    return () => document.removeEventListener("mousedown", handleClickFuera)
  }, [])

  useEffect(() => {
    function handleClickFuera(e) {
      if (adminMenuRef.current && !adminMenuRef.current.contains(e.target)) {
        setAdminMenuAbierto(false)
      }
    }
    document.addEventListener("mousedown", handleClickFuera)
    return () => document.removeEventListener("mousedown", handleClickFuera)
  }, [])

  function handleLogout() {
    logout()
    navigate("/login")
  }

  function esRutaActiva(ruta) {
    return rutaActual.startsWith(ruta)
  }

  return (
    <>
      {/* Barra superior — escritorio */}
      <nav className="navbar-top">
        <div className="navbar-top-inner">
          <span className="navbar-logo" onClick={() => navigate("/biblioteca")}>
            kokito
          </span>

          <div className="navbar-links">
            <button
              className={`navbar-link ${esRutaActiva("/biblioteca") ? "navbar-link--activo" : ""}`}
              onClick={() => navigate("/biblioteca")}
            >
              <BookOpen size={16} />
              Biblioteca
            </button>

            {esAdmin && (
              <div className="navbar-admin" ref={adminMenuRef}>
                <button
                  className={`navbar-link ${esRutaActiva("/admin") ? "navbar-link--activo" : ""}`}
                  onClick={() => setAdminMenuAbierto(!adminMenuAbierto)}
                >
                  <Settings size={16} />
                  Administración
                  <ChevronDown size={14} className={`navbar-chevron ${adminMenuAbierto ? "navbar-chevron--abierto" : ""}`} />
                </button>

                {adminMenuAbierto && (
                  <div className="navbar-menu">
                    <button className="navbar-menu-item" onClick={() => { navigate("/admin/libros"); setAdminMenuAbierto(false) }}>
                      Libros
                    </button>
                    <button className="navbar-menu-item" onClick={() => { navigate("/admin/usuarios"); setAdminMenuAbierto(false) }}>
                      Usuarios
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="navbar-perfil" ref={menuRef}>
            <button
              className="navbar-perfil-btn"
              onClick={() => setMenuAbierto(!menuAbierto)}
            >
              <User size={16} />
              <ChevronDown size={14} className={`navbar-chevron ${menuAbierto ? "navbar-chevron--abierto" : ""}`} />
            </button>

            {menuAbierto && (
              <div className="navbar-menu">
                <div className="navbar-menu-nombre">{usuario?.nombre}</div>
                <button className="navbar-menu-salir" onClick={handleLogout}>
                  <LogOut size={14} />
                  Cerrar sesión
                </button>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* Barra inferior — móvil */}
      <nav className="navbar-bottom">
        <button
          className={`navbar-bottom-item ${esRutaActiva("/biblioteca") ? "navbar-bottom-item--activo" : ""}`}
          onClick={() => navigate("/biblioteca")}
        >
          <BookOpen size={22} />
        </button>

        {esAdmin && (
          <div className="navbar-bottom-item" ref={adminMenuRef}>
            <button
              className={`navbar-bottom-item-btn ${esRutaActiva("/admin") ? "navbar-bottom-item--activo" : ""}`}
              onClick={() => setAdminMenuAbierto(!adminMenuAbierto)}
            >
              <Settings size={22} />
            </button>

            {adminMenuAbierto && (
              <div className="navbar-menu navbar-menu--bottom">
                <button className="navbar-menu-item" onClick={() => { navigate("/admin/libros"); setAdminMenuAbierto(false) }}>
                  Libros
                </button>
                <button className="navbar-menu-item" onClick={() => { navigate("/admin/usuarios"); setAdminMenuAbierto(false) }}>
                  Usuarios
                </button>
              </div>
            )}
          </div>
        )}

        <div className="navbar-bottom-item" ref={menuRef}>
          <button
            className={`navbar-bottom-item-btn ${menuAbierto ? "navbar-bottom-item--activo" : ""}`}
            onClick={() => setMenuAbierto(!menuAbierto)}
          >
            <User size={22} />
          </button>

          {menuAbierto && (
            <div className="navbar-menu navbar-menu--bottom">
              <div className="navbar-menu-nombre">{usuario?.nombre}</div>
              <button className="navbar-menu-salir" onClick={handleLogout}>
                <LogOut size={14} />
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </nav>
    </>
  )
}