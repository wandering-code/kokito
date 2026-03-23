import { createContext, useContext, useState, useEffect } from "react"
import API from "./config"

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    fetch(`${API}/me`, { credentials: "include" })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        setUsuario(data)
        setCargando(false)
      })
      .catch(() => setCargando(false))
  }, [])

  async function login(email, password) {
    const formData = new FormData()
    formData.append("email", email)
    formData.append("password", password)

    const res = await fetch(`${API}/login`, {
      method: "POST",
      body: formData,
      credentials: "include"
    })

    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.detail || "Error al iniciar sesión")
    }

    const data = await res.json()
    setUsuario(data)
    return data
  }

  async function logout() {
    await fetch(`${API}/logout`, {
      method: "POST",
      credentials: "include"
    })
    setUsuario(null)
  }

  return (
    <AuthContext.Provider value={{ usuario, cargando, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}