"use client"

import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { PlaySolid } from "@medusajs/icons" 

const TransformationVideo = () => {
  return (
    <section className="flex min-h-screen flex-col items-center justify-center gap-8 bg-[#101010] px-4 py-20">
      
      <h2 className="mt-14 font-bold text-4xl text-white md:text-5xl lg:text-6xl text-center font-poppins leading-tight">
        Mirá la Transformación en Acción
      </h2>

      <div className="relative w-full max-w-5xl aspect-video bg-gradient-to-br from-teal-400 to-cyan-500 rounded-lg overflow-hidden shadow-2xl group cursor-pointer">
        
        {/* BOTÓN DE PLAY */}
        <button 
          className="absolute inset-0 z-10 flex items-center justify-center w-full h-full outline-none focus:outline-none" 
          aria-label="Play video"
          onClick={() => alert("Aquí se reproduciría el video.")}
        >
          {/* Círculo de fondo */}
          <div className="flex items-center justify-center w-24 h-24 rounded-full bg-black/40 backdrop-blur-sm transition-transform duration-300 group-hover:scale-110 border border-white/20 shadow-lg">
            {/* ICONO: Aumenté tamaño y aseguré el centrado */}
            <PlaySolid className="text-white w-12 h-12" />
          </div>
        </button>
      </div>

      <LocalizedClientLink 
        href="/pruebas"
        className="bg-[#00FFFF] text-[#101010] hover:bg-[#00FFFF]/90 font-inter text-base font-semibold px-8 py-4 rounded-full inline-flex items-center justify-center transition-transform hover:scale-105 shadow-[0_0_20px_rgba(0,255,255,0.3)] mt-4"
      >
        VER TODAS LAS PRUEBAS
      </LocalizedClientLink>

    </section>
  )
}

export default TransformationVideo