import React from "react"

const Hero = () => {
  return (
    // CAMBIO 1: bg-gray-900 de respaldo. Si ves gris, el video falló. Si ves el video, ganamos.
    <section className="relative h-screen w-full overflow-hidden bg-gray-900 flex flex-col">
      
      {/* --- CAPA 1: VIDEO DE FONDO (Z-0) --- */}
      <div className="absolute inset-0 z-0 w-full h-full">
        <video
          className="object-cover w-full h-full"
          autoPlay
          loop
          muted
          playsInline
          // Agregamos poster transparente o una imagen estática por si tarda en cargar
        >
          {/* Asegúrate que el video esté en: tu-proyecto/public/video/video-home-f2.mp4 */}
          <source src="/video/video-home-f2.mp4" type="video/mp4" />
          Tu navegador no admite el video de fondo.
        </video>
      </div>

      {/* --- CAPA 2: OSCURECIMIENTO (Z-10) --- 
          Esto ayuda a que el texto resalte y oculta parpadeos de carga */}
      <div className="absolute inset-0 z-10 bg-black/30 pointer-events-none" />

      {/* --- CAPA 3: CONTENIDO (Z-20) --- */}
      <div className="relative z-20 flex flex-1 flex-col items-center justify-center px-4 text-center pointer-events-none">
        <h1 className="text-4xl font-bold text-white sm:text-5xl md:text-7xl lg:text-8xl font-poppins drop-shadow-[0_0_12px_rgba(255,255,255,0.35)]">
          Vestí tu esencia.
        </h1>
        
        <p className="mt-6 text-sm tracking-[0.3em] text-white md:text-base font-inter drop-shadow-[0_0_6px_rgba(255,255,255,0.3)]">
          ENIGMA | BUDHA.Om | NATURE & SPIRIT
        </p>
        
        <a
          href="#colecciones"
          className="bg-transparent mt-10 px-8 py-4 text-sm font-medium text-white md:text-base font-inter border border-white/30 rounded-md hover:border-white/60 transition-colors drop-shadow-[0_0_6px_rgba(255,255,255,0.25)] pointer-events-auto"
        >
          DESCUBRIR LAS COLECCIONES
        </a>
      </div>
    </section>
  )
}

export default Hero