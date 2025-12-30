"use client"

import Link from "next/link" // <--- 1. Usamos Link nativo
import { Github } from "@medusajs/icons" // O los iconos que uses

// 2. Definimos que recibe countryCode
type HeroProps = {
  countryCode: string
}

const Hero = ({ countryCode }: HeroProps) => {
  return (
    <div className="h-[75vh] w-full border-b border-ui-border-base relative bg-ui-bg-subtle">
      
      {/* VIDEO DE FONDO (Si usas video, esto debe ser Client Side) */}
      <div className="absolute inset-0 z-0">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="h-full w-full object-cover opacity-50"
        >
          {/* Asegúrate de que este video exista o cambia la ruta */}
          <source src="/video/hero-video.mp4" type="video/mp4" />
        </video>
      </div>

      <div className="absolute inset-0 z-10 flex flex-col justify-center items-center text-center small:p-32 gap-6">
        <span>
          <h1 className="text-3xl leading-10 text-ui-fg-base font-normal">
            Budha.Om
          </h1>
          <h2 className="text-3xl leading-10 text-ui-fg-subtle font-normal">
            Vestí tu esencia
          </h2>
        </span>
        
        {/* 3. ENLACE CORREGIDO CON countryCode */}
        <Link
          href={`/${countryCode}/store`}
          className="group flex items-center gap-x-2 px-6 py-3 rounded-full bg-black/80 text-white hover:bg-black transition-all"
        >
          <Github /> {/* O el icono que quieras */}
          Ir a la Tienda
        </Link>
      </div>
    </div>
  )
}

export default Hero