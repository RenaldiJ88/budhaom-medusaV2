"use client"

import React from "react"

// ⚠️ ¡IMPORTANTE: NO PONER 'async' AQUÍ TAMPOCO! ⚠️
const NatureSpiritSection = () => {
  return (
    <section className="relative flex h-screen w-full items-center justify-center overflow-hidden bg-[#101010]">
      
      {/* VIDEO FONDO */}
      <div className="absolute inset-0 z-0 w-full h-full">
        <video 
          className="object-cover w-full h-full" 
          autoPlay 
          loop 
          muted 
          playsInline
        >
          <source src="/video/nys-video.mp4" type="video/mp4" />
        </video>
      </div>

      {/* OVERLAY */}
      <div className="absolute inset-0 bg-black/40 z-10" />

      {/* TEXTO */}
      <div className="relative z-20 max-w-5xl px-6 text-center">
        <h1 className="mb-6 font-poppins text-4xl md:text-5xl lg:text-7xl font-bold leading-tight text-white drop-shadow-lg">
          Nature & Spirit
        </h1>
        <p className="font-inter text-lg md:text-xl lg:text-2xl leading-relaxed text-white drop-shadow-md max-w-3xl mx-auto">
          Conexión más allá de religiones, culturas o fronteras.
        </p>
      </div>

    </section>
  )
}

export default NatureSpiritSection