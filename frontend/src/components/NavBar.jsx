import { useState, useRef, useEffect } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { BookOpen, Settings, User, LogOut, ChevronDown, Users, Library, Bell, MessageSquare } from "lucide-react"
import { useAuth } from "../context/AuthContext"
import "./NavBar.css"

export default function NavBar() {
  const { usuario, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuAbierto, setMenuAbierto] = useState(false)
  const [adminMenuAbierto, setAdminMenuAbierto] = useState(false)
  const [adminMenuCerrando, setAdminMenuCerrando] = useState(false)
  const [menuCerrando, setMenuCerrando] = useState(false)
  const menuRef = useRef(null)
  const adminMenuRef = useRef(null)
  const adminMenuRefMovil = useRef(null)

  const esAdmin = usuario?.rol === "admin"
  const rutaActual = location.pathname

  function cerrarAdminMenu() {
    setAdminMenuCerrando(true)
    setTimeout(() => {
      setAdminMenuAbierto(false)
      setAdminMenuCerrando(false)
    }, 200)
  }

  function cerrarMenu() {
    setMenuCerrando(true)
    setTimeout(() => {
      setMenuAbierto(false)
      setMenuCerrando(false)
    }, 200)
  }

  useEffect(() => {
    function handleClickFuera(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        if (menuAbierto) cerrarMenu()
      }
      if (
        adminMenuRef.current && !adminMenuRef.current.contains(e.target) &&
        (!adminMenuRefMovil.current || !adminMenuRefMovil.current.contains(e.target))
      ) {
        if (adminMenuAbierto) cerrarAdminMenu()
      }
    }
    document.addEventListener("mousedown", handleClickFuera)
    return () => document.removeEventListener("mousedown", handleClickFuera)
  }, [menuAbierto, adminMenuAbierto])

  function handleLogout() {
    logout()
    navigate("/login")
  }

  function esRutaActiva(ruta) {
    return rutaActual.startsWith(ruta)
  }

  function navegarAdmin(ruta) {
    cerrarAdminMenu()
    setTimeout(() => navigate(ruta), 200)
  }

  function navegarPerfil(ruta) {
    cerrarMenu()
    setTimeout(() => navigate(ruta), 200)
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
                  <div className={`navbar-menu ${adminMenuCerrando ? "navbar-menu--saliendo" : ""}`}>
                    <button
                      className={`navbar-menu-item ${rutaActual.startsWith("/admin/libros") ? "navbar-menu-item--activo" : ""}`}
                      onMouseDown={() => navegarAdmin("/admin/libros")}
                    >
                      <Library size={14} />
                      Libros
                    </button>
                    <div className="navbar-menu-separador" />
                    <button
                      className={`navbar-menu-item ${rutaActual.startsWith("/admin/usuarios") ? "navbar-menu-item--activo" : ""}`}
                      onMouseDown={() => navegarAdmin("/admin/usuarios")}
                    >
                      <Users size={14} />
                      Usuarios
                    </button>
                    <div className="navbar-menu-separador" />
                    <button
                      className={`navbar-menu-item ${rutaActual.startsWith("/admin/solicitudes") ? "navbar-menu-item--activo" : ""}`}
                      onMouseDown={() => navegarAdmin("/admin/solicitudes")}
                    >
                      <MessageSquare size={14} />
                      Solicitudes
                    </button>
                    <div className="navbar-menu-separador" />
                    <button
                      className={`navbar-menu-item ${rutaActual.startsWith("/admin/novedades") ? "navbar-menu-item--activo" : ""}`}
                      onMouseDown={() => navegarAdmin("/admin/novedades")}
                    >
                      <Bell size={14} />
                      Novedades
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
              <div className={`navbar-menu ${menuCerrando ? "navbar-menu--saliendo" : ""}`}>
                <div className="navbar-menu-nombre">{usuario?.nombre}</div>
                <button
                  className="navbar-menu-item"
                  onMouseDown={() => navegarPerfil("/solicitudes")}
                >
                  <MessageSquare size={14} />
                  Mis solicitudes
                </button>
                <div className="navbar-menu-separador" />
                <button
                  className="navbar-menu-salir"
                  onMouseDown={(e) => { e.stopPropagation(); handleLogout() }}
                >
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
          <span>Biblioteca</span>
        </button>

        {esAdmin && (
          <div className="navbar-bottom-admin-wrap" ref={adminMenuRefMovil}>
            <button
              className={`navbar-bottom-item-btn ${esRutaActiva("/admin") ? "navbar-bottom-item--activo" : ""}`}
              onClick={() => adminMenuAbierto ? cerrarAdminMenu() : setAdminMenuAbierto(true)}
            >
              <Settings size={22} />
              <span>Admin</span>
            </button>

            {adminMenuAbierto && (
              <>
                <div
                  className={`navbar-sheet-overlay ${adminMenuCerrando ? "navbar-sheet-overlay--saliendo" : ""}`}
                  onMouseDown={() => cerrarAdminMenu()}
                />
                <div className={`navbar-menu navbar-menu--bottom ${adminMenuCerrando ? "navbar-menu--saliendo" : ""}`}>
                  <div className="navbar-sheet-handle" />
                  <div className="navbar-sheet-titulo">Administración</div>
                  <button
                    className={`navbar-menu-item ${rutaActual.startsWith("/admin/libros") ? "navbar-menu-item--activo" : ""}`}
                    onClick={() => navegarAdmin("/admin/libros")}
                  >
                    <Library size={18} />
                    Libros
                  </button>
                  <div className="navbar-menu-separador" />
                  <button
                    className={`navbar-menu-item ${rutaActual.startsWith("/admin/usuarios") ? "navbar-menu-item--activo" : ""}`}
                    onClick={() => navegarAdmin("/admin/usuarios")}
                  >
                    <Users size={18} />
                    Usuarios
                  </button>
                  <div className="navbar-menu-separador" />
                  <button
                    className={`navbar-menu-item ${rutaActual.startsWith("/admin/solicitudes") ? "navbar-menu-item--activo" : ""}`}
                    onClick={() => navegarAdmin("/admin/solicitudes")}
                  >
                    <MessageSquare size={18} />
                    Solicitudes
                  </button>
                  <div className="navbar-menu-separador" />
                  <button
                    className={`navbar-menu-item ${rutaActual.startsWith("/admin/novedades") ? "navbar-menu-item--activo" : ""}`}
                    onClick={() => navegarAdmin("/admin/novedades")}
                  >
                    <Bell size={18} />
                    Novedades
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        <div className="navbar-bottom-perfil-wrap" ref={menuRef}>
          <button
            className={`navbar-bottom-item-btn ${menuAbierto ? "navbar-bottom-item--activo" : ""}`}
            onClick={() => menuAbierto ? cerrarMenu() : setMenuAbierto(true)}
          >
            <User size={22} />
            <span>Perfil</span>
          </button>

          {menuAbierto && (
            <>
              <div
                className={`navbar-sheet-overlay ${menuCerrando ? "navbar-sheet-overlay--saliendo" : ""}`}
                onMouseDown={() => cerrarMenu()}
              />
              <div className={`navbar-menu navbar-menu--bottom ${menuCerrando ? "navbar-menu--saliendo" : ""}`}>
                <div className="navbar-sheet-handle" />
                <div className="navbar-sheet-titulo">Mi cuenta</div>
                <div className="navbar-menu-nombre">{usuario?.nombre}</div>
                <button
                  className="navbar-menu-item"
                  onClick={() => navegarPerfil("/solicitudes")}
                >
                  <MessageSquare size={18} />
                  Mis solicitudes
                </button>
                <div className="navbar-menu-separador" />
                <button
                  className="navbar-menu-salir"
                  onClick={handleLogout}
                >
                  <LogOut size={18} />
                  Cerrar sesión
                </button>
              </div>
            </>
          )}
        </div>
      </nav>
    </>
  )
}