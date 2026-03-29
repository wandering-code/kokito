import { useState, useEffect } from "react"
import { Player } from "@lottiefiles/react-lottie-player"
import gatoAnimation from "../assets/gato-loading.json"
import "./SpinnerGato.css"

export default function SpinnerGato({ visible = true }) {
  const [montado, setMontado] = useState(visible)
  const [animando, setAnimando] = useState(false)

    useEffect(() => {
    console.log("visible cambió a:", visible, "animando:", animando, "montado:", montado)
    if (visible) {
        setMontado(true)
        requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            setAnimando(true)
            console.log("setAnimando(true)")
        })
        })
    } else {
        setAnimando(false)
        console.log("setAnimando(false), esperando 350ms...")
        const timer = setTimeout(() => {
        console.log("desmontando")
        setMontado(false)
        }, 350)
        return () => clearTimeout(timer)
    }
    }, [visible])

  if (!montado) return null

  return (
    <div className={`sg-overlay ${animando ? "sg-visible" : ""}`}>
      <div className="sg-card">
        <Player
          autoplay
          loop
          src={gatoAnimation}
          style={{ width: 220, height: 220 }}
        />
      </div>
    </div>
  )
}