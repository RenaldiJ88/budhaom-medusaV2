"use client"

import { useState } from "react"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

// 1. Aquí definimos tus diapositivas. ¡Más fácil de editar!
const slides = [
  {
    id: 1,
    title: "Remera Wairua 432",
    description: "Este diseño es nuestro manifiesto: la conexión entre la tierra y el espíritu, manifestada en una prenda que vibra con la frecuencia del universo.",
    image: "/img/wairua.jpg", // Asegúrate que la imagen exista
    price: "18.500",
    handle: "/products/wairua-432" // A dónde lleva el botón comprar
  },
  {
    id: 2,
    title: "Remera Esencia",
    description: "La pureza del diseño. Líneas limpias y confort absoluto para un estilo que trasciende el tiempo.",
    image: "/img/reme-tatei.jpg",
    price: "17.500",
    handle: "/products/remera-esencia"
  }
]

const DesignCarousel = () => {
  // Estado para saber cuál slide mostrar (0 es el primero)
  const [current, setCurrent] = useState(0)

  // Funciones para avanzar y retroceder
  const nextSlide = () => {
    setCurrent(current === slides.length - 1 ? 0 : current + 1)
  }

  const prevSlide = () => {
    setCurrent(current === 0 ? slides.length - 1 : current - 1)
  }

  return (
    <section className="flex min-h-screen flex-col items-center justify-center bg-[#101010] px-4 py-20">
      
      {/* TÍTULO */}
      <h2 className="mb-4 text-center font-poppins text-3xl font-bold text-white md:text-5xl lg:mb-16 lg:text-6xl pt-6">
        Encontrá el diseño que resuena con vos
      </h2>

      {/* CONTENEDOR DEL CARRUSEL */}
      <div className="relative mb-4 w-full max-w-6xl lg:mb-16">
        
        {/* BOTÓN ANTERIOR (Flecha Izquierda) */}
        <button 
          onClick={prevSlide}
          className="absolute left-0 top-1/2 z-10 -translate-x-2 md:-translate-x-12 -translate-y-1/2 text-white transition-opacity hover:opacity-70 p-2"
          aria-label="Anterior"
        >
          <svg className="h-8 w-8 md:h-12 md:w-12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* BOTÓN SIGUIENTE (Flecha Derecha) */}
        <button 
          onClick={nextSlide}
          className="absolute right-0 top-1/2 z-10 translate-x-2 md:translate-x-12 -translate-y-1/2 text-white transition-opacity hover:opacity-70 p-2"
          aria-label="Siguiente"
        >
          <svg className="h-8 w-8 md:h-12 md:w-12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* SLIDES (Mapeamos la lista) */}
        <div className="flex items-center justify-center overflow-hidden relative min-h-[500px]">
          {slides.map((slide, index) => (
            <div
              key={slide.id}
              // AQUÍ ESTÁ LA MAGIA: Si el índice coincide con 'current', se muestra. Si no, se oculta.
              className={`transition-opacity duration-500 ease-in-out absolute w-full flex-col items-center justify-center ${
                index === current ? "opacity-100 z-10 relative flex" : "opacity-0 z-0 absolute pointer-events-none"
              }`}
            >
              <div className="flex flex-col-reverse items-center gap-6 md:gap-10 lg:gap-16 md:flex-row md:gap-16">
                
                {/* IMAGEN CON GRADIENTE */}
                <div className="relative aspect-video md:aspect-square w-64 max-w-[60vw] overflow-hidden rounded-3xl bg-gradient-to-br from-cyan-400/20 to-teal-600/20 shadow-xl sm:w-80 md:w-96">
                  <img src={slide.image} alt={slide.title} className="object-cover w-full h-full" />
                </div>

                {/* TEXTO */}
                <div className="flex max-w-xl flex-col items-center md:items-start text-center md:text-left">
                  <h3 className="mb-4 font-poppins text-2xl font-bold text-white md:text-3xl lg:text-4xl">
                    {slide.title}
                  </h3>
                  <p className="mb-8 text-base text-gray-300 md:text-lg lg:text-xl">
                    {slide.description}
                  </p>
                  
                  {/* BOTÓN COMPRAR */}
                  <LocalizedClientLink
                    href={slide.handle} // Usa el link dinámico
                    className="inline-flex items-center justify-center rounded-full border border-teal-400 px-6 py-3 font-inter text-base font-semibold text-white shadow-lg transition-colors hover:bg-teal-400/10 md:px-8 md:py-4 md:text-lg uppercase"
                  >
                    COMPRAR - ${slide.price}
                  </LocalizedClientLink>
                </div>

              </div>
            </div>
          ))}
        </div>

        {/* INDICADORES (Puntitos abajo) */}
        <div className="mt-8 flex justify-center gap-3">
          {slides.map((_, index) => (
            <button
              key={index}
              onClick={() => setCurrent(index)}
              className={`h-3 w-3 rounded-full transition-all ${
                index === current ? "bg-teal-400 w-6" : "bg-teal-300/30 hover:bg-teal-300/50"
              }`}
              aria-label={`Ir a slide ${index + 1}`}
            />
          ))}
        </div>

      </div>

      {/* BOTÓN FINAL */}
      <LocalizedClientLink
        href="/store"
        className="bg-[#00FFFF] text-[#101010] hover:bg-[#00FFFF]/90 font-inter text-base font-normal px-8 py-3 rounded-full inline-flex items-center justify-center mt-8 transition-transform hover:scale-105"
      >
        VER TODOS LOS DISEÑOS
      </LocalizedClientLink>

    </section>
  )
}

export default DesignCarousel