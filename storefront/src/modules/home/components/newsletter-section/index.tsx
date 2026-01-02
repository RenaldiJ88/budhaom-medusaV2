"use client"

import { useState } from "react"

const NewsletterSection = () => {
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState("idle") // idle, loading, success

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setStatus("loading")
    // Simulación de envío
    setTimeout(() => {
      setStatus("success")
      setEmail("")
    }, 1500)
  }

  return (
    <section className="relative flex h-[80vh] md:h-screen flex-col justify-end bg-[#101010] text-white">
      <div className="px-6 pt-16 pb-16 md:pb-24 md:pt-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="mb-4 font-poppins text-4xl font-bold leading-tight md:text-5xl">
            Mantenete en Frecuencia
          </h2>
          <p className="mb-8 font-inter text-base leading-relaxed text-gray-300 md:text-lg">
            Suscribite a nuestro newsletter y recibí contenido exclusivo, lanzamientos y novedades.
          </p>

          {status === "success" ? (
            <div className="p-4 bg-[#00FFFF]/10 border border-[#00FFFF] rounded-lg text-[#00FFFF]">
              ¡Gracias! Tu esencia ya está conectada. ✨
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mx-auto flex max-w-md flex-col gap-3 sm:flex-row">
              <input
                type="email"
                required
                placeholder="Tu Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1 rounded-lg border border-gray-700 bg-[#1a1a1a] px-4 py-3 font-inter text-white placeholder:text-gray-500 focus:outline-none focus:border-[#00FFFF] transition-colors"
              />
              <button
                type="submit"
                disabled={status === "loading"}
                className="rounded-lg bg-[#00FFFF] px-8 py-3 font-inter font-medium text-[#101010] hover:bg-[#00FFFF]/90 transition-colors disabled:opacity-50"
              >
                {status === "loading" ? "..." : "Suscribirse"}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  )
}

export default NewsletterSection