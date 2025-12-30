"use client"

import React from "react"

const benefits = [
  {
    id: 1,
    image: "/img/ben1.png",
    alt: "Icono Equilibrio",
    title: "Equilibrio Inmediato",
    description: "Siente un aumento inmediato en tu estabilidad física y fuerza, mejorando tu conexión con el suelo.",
  },
  {
    id: 2,
    image: "/img/ben2.png",
    alt: "Icono Descanso",
    title: "Optimiza tu Descanso",
    description: "Ayuda a regular los ciclos de sueño para un descanso más profundo y reparador.",
  },
  {
    id: 3,
    image: "/img/bene3.png",
    alt: "Icono Escudo",
    title: "Escudo Energético",
    description: "Contribuye a mitigar el estrés electromagnético del entorno, fortaleciendo tu aura personal.",
  },
]

const BenefitsSection = () => {
  return (
    <>
      {benefits.map((benefit) => (
        <section 
          key={benefit.id} 
          className="relative h-screen w-full overflow-hidden bg-[#101010] flex flex-col justify-center"
        >
          <div className="container mx-auto h-full flex flex-col items-center justify-center px-6 text-center">
            
            {/* IMAGEN */}
            <div className="mb-6 max-h-[55vh] flex items-center justify-center">
              <img
                src={benefit.image}
                alt={benefit.alt}
                className="max-h-[55vh] w-auto object-contain transition-transform duration-700 hover:scale-105"
              />
            </div>

            {/* TÍTULO */}
            <h3 className="font-poppins text-4xl lg:text-5xl font-bold text-white mb-4 drop-shadow-md">
              {benefit.title}
            </h3>

            {/* DESCRIPCIÓN */}
            <p className="font-inter text-lg lg:text-xl text-gray-300 max-w-lg leading-relaxed">
              {benefit.description}
            </p>
            
          </div>
        </section>
      ))}
    </>
  )
}

export default BenefitsSection