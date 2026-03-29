import { useState, useEffect } from "react"
import API from "../../config"
import SpinnerGato from "../../components/SpinnerGato"
import "./AdminUsuariosPage.css"

export default function AdminUsuariosPage() {
  const [usuarios, setUsuarios] = useState([])
  const [cargando, setCargando] = useState(true)
  const [procesando, setProcesando] = useState(false)

  useEffect(() => {
    cargarUsuarios()
  }, [])

  async function cargarUsuarios() {
    setCargando(true)
    const res = await fetch(`${API}/admin/usuarios`, { credentials: "include" })
    const data = await res.json()
    setUsuarios(Array.isArray(data) ? data : [])
    setCargando(false)
  }

  async function cambiarAprobacion(id, aprobado) {
    setProcesando(true)
    await fetch(`${API}/admin/usuarios/${id}/aprobado?aprobado=${aprobado}`, {
      method: "PATCH",
      credentials: "include"
    })
    await cargarUsuarios()
    setProcesando(false)
  }

  async function borrarUsuario(id) {
    if (!confirm("¿Seguro que quieres eliminar este usuario?")) return
    setProcesando(true)
    await fetch(`${API}/admin/usuarios/${id}`, {
      method: "DELETE",
      credentials: "include"
    })
    await cargarUsuarios()
    setProcesando(false)
  }

  const pendientes = usuarios.filter(u => !u.aprobado && u.rol !== "admin")
  const aprobados  = usuarios.filter(u => u.aprobado && u.rol !== "admin")
  const admins     = usuarios.filter(u => u.rol === "admin")

  return (
    <div className="usu-root">
      <SpinnerGato visible={cargando || procesando} />

      {!cargando && (
        <>
          {pendientes.length > 0 && (
            <section className="usu-section">
              <h2 className="usu-section-title">
                Pendientes de aprobación
                <span className="usu-badge-count">{pendientes.length}</span>
              </h2>
              <div className="usu-list">
                {pendientes.map(u => (
                  <div key={u.id} className="usu-row usu-row--pendiente">
                    <div className="usu-info">
                      <div className="usu-nombre">{u.nombre}</div>
                      <div className="usu-email">{u.email}</div>
                      <div className="usu-fecha">
                        {new Date(u.fecha_registro).toLocaleDateString("es-ES", {
                          day: "numeric", month: "long", year: "numeric"
                        })}
                      </div>
                    </div>
                    <div className="usu-acciones">
                      <button
                        className="usu-btn usu-btn--aprobar"
                        onClick={() => cambiarAprobacion(u.id, true)}
                      >
                        Aprobar
                      </button>
                      <button
                        className="usu-btn usu-btn--borrar"
                        onClick={() => borrarUsuario(u.id)}
                      >
                        Rechazar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="usu-section">
            <h2 className="usu-section-title">Usuarios activos</h2>
            {aprobados.length === 0 ? (
              <div className="usu-empty">No hay usuarios aprobados todavía</div>
            ) : (
              <div className="usu-list">
                {aprobados.map(u => (
                  <div key={u.id} className="usu-row">
                    <div className="usu-info">
                      <div className="usu-nombre">{u.nombre}</div>
                      <div className="usu-email">{u.email}</div>
                      <div className="usu-fecha">
                        {new Date(u.fecha_registro).toLocaleDateString("es-ES", {
                          day: "numeric", month: "long", year: "numeric"
                        })}
                      </div>
                    </div>
                    <div className="usu-acciones">
                      <button
                        className="usu-btn usu-btn--secundario"
                        onClick={() => cambiarAprobacion(u.id, false)}
                      >
                        Desactivar
                      </button>
                      <button
                        className="usu-btn usu-btn--borrar"
                        onClick={() => borrarUsuario(u.id)}
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="usu-section">
            <h2 className="usu-section-title">Administradores</h2>
            <div className="usu-list">
              {admins.map(u => (
                <div key={u.id} className="usu-row usu-row--admin">
                  <div className="usu-info">
                    <div className="usu-nombre">{u.nombre}</div>
                    <div className="usu-email">{u.email}</div>
                  </div>
                  <span className="usu-badge-admin">Admin</span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}