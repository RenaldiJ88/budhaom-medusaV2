"use client"

import { useState } from "react"
import Link from "next/link" // Usamos Link nativo para evitar errores de servidor

// 1. AQUÍ ESTÁ LA CLAVE: Definimos que este componente acepta 'countryCode'
type DesignCarouselProps = {
  countryCode: string
}

const slides = [
  {
    id: 1,
    title: "Remera Wairua 432",
    description: "Este diseño es nuestro manifiesto: la conexión entre la tierra y el espíritu.",
    image: "/img/wairua.jpg",
    price: "18.500",
    handle: "wairua-432" 
  },
  {
    id: 2,
    title: "Remera Esencia",
    description: "La pureza del diseño. Líneas limpias y confort absoluto.",
    image: "/img/reme-tatei.jpg",
    price: "17.500",
    handle: "remera-esencia"
  }
]

// 2. Y AQUÍ LO RECIBIMOS: ({ countryCode }: DesignCarouselProps)
const DesignCarousel = ({ countryCode }: DesignCarouselProps) => {
  const [current, setCurrent] = useState(0)

  const nextSlide = () => {
    setCurrent(current === slides.length - 1 ? 0 : current + 1)
  }

  const prevSlide = () => {
    setCurrent(current === 0 ? slides.length - 1 : current - 1)
  }

  return (
    <section className="flex min-h-screen flex-col items-center justify-center bg-[#101010] px-4 py-20 relative">
      <h2 className="mb-8 text-center font-poppins text-3xl font-bold text-white md:text-5xl lg:mb-16 lg:text-6xl">
        Encontrá el diseño que resuena con vos
      </h2>

      <div className="relative w-full max-w-6xl">
        {/* Flecha Izquierda */}
        <button onClick={prevSlide} className="absolute left-0 top-1/2 z-20 -translate-y-1/2 p-4 text-white hover:text-cyan-400 md:-left-12 outline-none">
           <svg className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        </button>
        
        {/* Flecha Derecha */}
        <button onClick={nextSlide} className="absolute right-0 top-1/2 z-20 -translate-y-1/2 p-4 text-white hover:text-cyan-400 md:-right-12 outline-none">
           <svg className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
        </button>

        <div className="relative min-h-[500px] w-full overflow-hidden flex justify-center">
          {slides.map((slide, index) => (
            <div key={slide.id} className={`absolute top-0 w-full transition-all duration-700 ease-in-out transform ${index === current ? "opacity-100 translate-x-0 relative" : "opacity-0 translate-x-8 pointer-events-none absolute"}`}>
              <div className="flex flex-col-reverse items-center justify-center gap-10 md:flex-row md:gap-16">
                
                {/* IMAGEN */}
                <div className="relative aspect-square w-64 md:w-96 overflow-hidden rounded-3xl bg-gradient-to-br from-cyan-400/20 to-teal-600/20 shadow-2xl">
                  <img src={slide.image} alt={slide.title} className="h-full w-full object-cover" />
                </div>
                
                {/* INFO */}
                <div className="flex max-w-lg flex-col items-center text-center md:items-start md:text-left">
                  <h3 className="mb-4 font-poppins text-3xl font-bold text-white md:text-4xl">{slide.title}</h3>
                  <p className="mb-8 font-inter text-lg text-gray-300">{slide.description}</p>
                  
                  {/* 3. USAMOS countryCode PARA ARMAR EL LINK CORRECTAMENTE */}
                  <Link
                    href={`/${countryCode}/products/${slide.handle}`}
                    className="inline-flex items-center justify-center rounded-full border border-teal-400 px-8 py-3 font-inter text-lg font-semibold text-white shadow-[0_0_15px_rgba(45,212,191,0.3)] transition-all hover:bg-teal-400/20 hover:shadow-[0_0_25px_rgba(45,212,191,0.5)] uppercase"
                  >
                    COMPRAR - ${slide.price}
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {/* Indicadores */}
        <div className="mt-8 flex justify-center gap-3">
            {slides.map((_, index) => (
                <button key={index} onClick={() => setCurrent(index)} className={`h-3 w-3 rounded-full transition-all ${index === current ? "bg-cyan-400 w-8" : "bg-gray-600 hover:bg-gray-400"}`} />
            ))}
        </div>
      </div>

      {/* 4. TAMBIÉN AQUÍ USAMOS countryCode */}
      <Link
        href={`/${countryCode}/store`}
        className="mt-16 bg-[#00FFFF] text-[#101010] hover:bg-[#00FFFF]/90 font-inter text-base font-medium px-8 py-3 rounded-full inline-flex items-center justify-center transition-transform hover:scale-105"
      >
        VER TODOS LOS DISEÑOS
      </Link>
    </section>
  )
}

export default DesignCarousel