import { useAuth } from "../../AuthContext"

export default function BibliotecaPage({ modoAdmin = false }) {
  const { usuario, logout } = useAuth()

  return (
    <div className="min-h-screen bg-gray-950 text-white p-8">
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
        <p className="text-gray-400">Aquí irá la biblioteca de libros.</p>
      </div>
    </div>
  )
}