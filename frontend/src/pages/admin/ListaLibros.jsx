import { useState, useEffect } from "react"
import API from "../../config"

export default function ListaLibros({ refresh }) {
  const [libros, setLibros] = useState([])

  function cargarLibros() {
    fetch(`${API}/libros`, { credentials: "include" })
      .then(res => res.json())
      .then(data => setLibros(data))
  }

  useEffect(() => {
    cargarLibros()
  }, [refresh])

  async function borrarLibro(id) {
    await fetch(`${API}/libros/${id}`, {
      method: "DELETE",
      credentials: "include"
    })
    cargarLibros()
  }

  async function cambiarVisibilidad(id, visible) {
    await fetch(`${API}/libros/${id}/visible?visible=${visible}`, {
      method: "PATCH",
      credentials: "include"
    })
    cargarLibros()
  }

  if (libros.length === 0) return null

  return (
    <div className="bg-gray-900 rounded-2xl p-6 flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Libros en el sistema</h2>
      <div className="flex flex-col gap-2">
        {libros.map(libro => (
          <div key={libro.id} className="bg-gray-800 rounded-xl px-4 py-3 flex justify-between items-center">
            <div className="flex flex-col gap-1">
              <span className="text-white text-sm font-medium">{libro.titulo}</span>
              <span className="text-gray-500 text-xs">
                {libro.autor ? `${libro.autor} · ` : ""}
                {libro.num_paginas} págs · {libro.partes} partes
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => cambiarVisibilidad(libro.id, !libro.visible)}
                className={`text-xs px-3 py-1 rounded-lg transition font-medium ${
                  libro.visible
                    ? "bg-green-800 text-green-300 hover:bg-green-700"
                    : "bg-gray-700 text-gray-400 hover:bg-gray-600"
                }`}
              >
                {libro.visible ? "Publicado" : "Publicar"}
              </button>
              <button
                onClick={() => borrarLibro(libro.id)}
                className="text-red-500 hover:text-red-400 text-xs transition"
              >
                Borrar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}