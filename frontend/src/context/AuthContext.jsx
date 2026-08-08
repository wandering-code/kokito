import { createContext, useContext, useState, useEffect } from "react"
import API from "../config"

const AuthContext = createContext(null)

// El backend siempre responde JSON, pero un proxy/tunnel de por medio (nginx,
// cloudflared) puede devolver una página HTML de error (502/504) si el
// backend está caído o reiniciándose. res.json() en ese caso lanza un parse
// error cuyo texto varía según el navegador ("Unexpected token '<'" en
// Chrome/Firefox, "The string did not match the expected pattern." en
// Safari) — lo evitamos comprobando el content-type antes de parsear.
async function parseJsonSeguro(res) {
  const contentType = res.headers.get("content-type") || ""
  if (!contentType.includes("application/json")) return null
  try {
    return await res.json()
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    fetch(`${API}/me`, { credentials: "include" })
      .then(res => res.ok ? parseJsonSeguro(res) : null)
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

    let res
    try {
      res = await fetch(`${API}/login`, {
        method: "POST",
        body: formData,
        credentials: "include"
      })
    } catch {
      throw new Error("No se pudo conectar con el servidor. Inténtalo de nuevo.")
    }

    if (!res.ok) {
      const data = await parseJsonSeguro(res)
      throw new Error(data?.detail || "Error al iniciar sesión")
    }

    const data = await parseJsonSeguro(res)
    if (!data) {
      throw new Error("No se pudo conectar con el servidor. Inténtalo de nuevo.")
    }
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