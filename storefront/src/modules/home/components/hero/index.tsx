"use client"

import Link from "next/link" // <--- Usamos Link nativo (El arreglo técnico)

// 1. Recibimos countryCode (El arreglo técnico)
type HeroProps = {
  countryCode: string
}

const Hero = ({ countryCode }: HeroProps) => {
  return (
    // 2. RESTAURAMOS TU DISEÑO: h-screen, fondo negro, overflow hidden
    <div className="relative h-screen w-full bg-black overflow-hidden">
      
      {/* --- VIDEO DE FONDO --- */}
      <div className="absolute inset-0 z-0">
        <video
          autoPlay
          loop
          muted
          playsInline
          className="h-full w-full object-cover opacity-60" // Ajusta la opacidad si lo quieres más oscuro/claro
        >
          {/* ⚠️ ASEGÚRATE DE QUE ESTE SEA EL NOMBRE DE TU VIDEO EN PUBLIC/VIDEO */}
          {/* Si tu video se llama diferente (ej: hero.mp4), cámbialo aquí abajo 👇 */}
          <source src="/video/hero-video.mp4" type="video/mp4" />
        </video>
      </div>

      {/* --- CONTENIDO --- */}
      <div className="absolute inset-0 z-10 flex flex-col justify-center items-center text-center px-4">
        
        <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold text-white mb-4 tracking-tight font-poppins drop-shadow-lg">
          Budha.Om
        </h1>
        
        <h2 className="text-xl md:text-2xl lg:text-3xl text-gray-200 mb-8 font-inter font-light tracking-wide drop-shadow-md">
        ENIGMA | BUDHA.Om | NATURE & SPIRIT
        </h2>
        
        {/* BOTÓN ARREGLADO (Usa Link nativo + countryCode) */}
        <Link
          href={`/${countryCode}/store`}
          className="px-8 py-4 rounded-full bg-white text-black font-bold uppercase tracking-widest hover:bg-cyan-400 hover:scale-105 transition-all duration-300 shadow-[0_0_20px_rgba(255,255,255,0.3)]"
        >
          Ir a la Tienda
        </Link>
      </div>

    </div>
  )
}

export default Hero