"use client"

import LocalizedClientLink from "@modules/common/components/localized-client-link"

const TransformationBlock = () => {
  return (
    <section className="h-screen flex items-center justify-center px-4 md:px-8 lg:px-16 bg-[#101010]">
      <div className="max-w-7xl w-full grid lg:grid-cols-2 gap-4 md:gap-12 lg:gap-16 items-center">
        
        {/* COLUMNA TEXTO */}
        <div className="space-y-4 md:space-y-6 text-center lg:text-left">
          <h1 className="mt-14 lg:mt-0 text-3xl md:text-5xl lg:text-6xl font-bold text-white leading-tight font-poppins">
            Lo que llevás, te transforma.
          </h1>
          
          <p className="text-base sm:text-lg lg:text-xl text-gray-300 leading-relaxed font-inter">
            Nuestras colección Enigma, con tecnología cuántica que potencia y mejora tu bienestar.
            Ofreciendo mejoras y rendimientos inmediatos en tu día a día.
          </p>
          
          <div className="flex justify-center lg:justify-start">
            <LocalizedClientLink
              href="/tecnologia"
              className="text-base font-medium tracking-wide px-4 py-2 md:py-3 md:px-5 rounded transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-cyan-500/50 bg-[#00FFFF] text-[#101010] font-inter uppercase"
            >
              Conocer la tecnología
            </LocalizedClientLink>
          </div>
        </div>

        {/* COLUMNA IMAGEN */}
        <div className="flex items-center justify-center">
          <div className="relative w-full max-w-sm sm:max-w-lg aspect-square">
            {/* Asegúrate de tener la imagen en: /public/img/transformacion.png
               'mix-blend-screen' hace que el fondo negro de la imagen se vuelva transparente 
            */}
            <img 
              src="/img/transformacion.png" 
              alt="Quantum Energy Torus Field"
              className="w-full h-full object-cover mix-blend-screen transition-transform duration-700 ease-out hover:scale-105" 
            />
          </div>
        </div>

      </div>
    </section>
  )
}

export default TransformationBlock