"use client"

import Link from "next/link" // 1. Usamos el Link nativo de Next
import { PlaySolid } from "@medusajs/icons" 

// 2. Definimos que este componente va a recibir el código de país
type TransformationVideoProps = {
  countryCode: string
}

const TransformationVideo = ({ countryCode }: TransformationVideoProps) => {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center gap-8 bg-[#101010] px-4 py-20">
      
      <h2 className="mt-14 font-bold text-4xl text-white md:text-5xl lg:text-6xl text-center font-poppins leading-tight z-10">
        Mirá la Transformación en Acción
      </h2>

      {/* CONTENEDOR DE VIDEO */}
      <div className="relative w-full max-w-5xl aspect-video bg-gradient-to-br from-teal-400 to-cyan-500 rounded-lg overflow-hidden shadow-2xl group cursor-pointer z-10">
        
        {/* Capa oscura que se aclara al pasar el mouse */}
        <div className="absolute inset-0 bg-black/20 group-hover:bg-transparent transition-colors duration-300" />

        {/* BOTÓN PLAY - CENTRADO MATEMÁTICO PERFECTO */}
        <button 
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 outline-none focus:outline-none transition-transform duration-300 group-hover:scale-110" 
          aria-label="Play video"
          type="button"
          onClick={() => alert("Aquí iría el modal del video.")}
        >
          {/* Círculo */}
          <div className="flex items-center justify-center w-20 h-20 md:w-24 md:h-24 rounded-full bg-black/40 backdrop-blur-md border border-white/30 shadow-[0_0_30px_rgba(0,0,0,0.5)]">
            {/* Ícono */}
            <PlaySolid className="text-white w-8 h-8 md:w-10 md:h-10 ml-1" />
          </div>
        </button>
      </div>

      {/* BOTÓN CTA - Usamos Link nativo con el countryCode */}
      <Link 
        href={`/${countryCode}/pruebas`} // Construimos la URL manualmente
        className="z-10 bg-[#00FFFF] text-[#101010] hover:bg-[#00FFFF]/90 font-inter text-base font-semibold px-8 py-4 rounded-full inline-flex items-center justify-center transition-transform hover:scale-105 shadow-[0_0_20px_rgba(0,255,255,0.3)] mt-4"
      >
        VER TODAS LAS PRUEBAS
      </Link>

    </section>
  )
}

export default TransformationVideo