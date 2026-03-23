import { useState, useEffect } from "react"
import { useAuth } from "../../AuthContext"
import { useNavigate, useLocation } from "react-router-dom"
import API from "../../config"

export default function BibliotecaPage({ modoAdmin: modoAdminProp = false }) {
  const { usuario, logout } = useAuth()
  const navigate = useNavigate()
  const [libros, setLibros] = useState([])
  const location = useLocation()
  const modoAdmin = modoAdminProp || location.state?.modoAdmin || false

  useEffect(() => {
    fetch(`${API}/libros/publicos`, { credentials: "include" })
      .then(res => res.json())
      .then(data => setLibros(data))
  }, [])

  return (
    <div className={`min-h-screen bg-gray-950 text-white p-8 ${modoAdmin ? "pt-16" : ""}`}>

      {modoAdmin && (
        <div style={{backgroundColor: "#1e3a5f"}} className="fixed top-0 left-0 right-0 px-6 py-2 flex justify-between items-center z-50">
          <span className="text-white text-xs font-medium">👁 Viendo como usuario</span>
        <button
          onClick={() => navigate("/admin", { replace: true })}
          style={{backgroundColor: "#2d5a8e"}}
          className="text-white text-xs px-3 py-1 rounded-lg hover:opacity-80 transition"
        >
          ← Volver al panel de admin
        </button>
        </div>
      )}

      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Biblioteca</h1>
          <div className="flex items-center gap-3">
            <span className="text-gray-400 text-sm">Hola, {usuario.nombre}</span>
            {!modoAdmin && (
              <button
                onClick={logout}
                className="text-white text-sm px-4 py-2 rounded-lg transition font-medium"
                style={{backgroundColor: "#374151"}}
              >
                Cerrar sesión
              </button>
            )}
          </div>
        </div>

        {libros.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-gray-600">
            <span className="text-5xl">📚</span>
            <p className="text-sm">No hay libros disponibles todavía</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {libros.map(libro => (
              <div
                key={libro.id}
                className="bg-gray-900 rounded-2xl px-6 py-4 flex justify-between items-center cursor-pointer hover:bg-gray-800 transition"
                onClick={() => navigate(`/libro/${libro.id}`, { state: { modoAdmin } })}
              >
                <div className="flex flex-col gap-1">
                  <span className="text-white font-medium">{libro.titulo}</span>
                  {libro.autor && (
                    <span className="text-gray-500 text-sm">{libro.autor}</span>
                  )}
                  <span className="text-gray-600 text-xs">{libro.num_paginas} páginas · {libro.partes} partes</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}