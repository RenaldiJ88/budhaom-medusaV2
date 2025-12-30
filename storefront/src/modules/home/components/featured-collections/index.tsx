"use client"

import Link from "next/link" // <--- 1. Usamos Link nativo

// 2. Definimos que necesitamos el countryCode
type FeaturedCollectionsProps = {
  countryCode: string
}

const FeaturedCollections = ({ countryCode }: FeaturedCollectionsProps) => {
  return (
    <section 
      id="colecciones" 
      className="w-full min-h-screen px-4 md:px-6 flex items-center bg-[#101010] py-20" 
    >
      <div className="mx-auto grid max-w-sm md:max-w-6xl grid-cols-1 gap-4 md:gap-12 lg:gap-24 md:grid-cols-2 pt-16">
        
        {/* CARD 1: ENIGMA */}
        <Link 
          href={`/${countryCode}/collections/enigma`} // <--- 3. URL Manual
          className="group relative rounded-3xl bg-[#141414] p-4 md:p-6 shadow-[0_10px_40px_rgba(0,0,0,0.25)] transition-all duration-500 hover:shadow-[0_15px_50px_rgba(0,0,0,0.4)] hover:shadow-cyan-500/20 hover:-translate-y-2"
        >
          <div className="relative overflow-hidden rounded-2xl w-full aspect-video md:aspect-square">
            <img 
              src="/img/reme2.png" 
              alt="Colección Energizada" 
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" 
            />
            
            <div 
              className="absolute top-3 right-3 z-10 h-16 w-16 rounded-full bg-black/50 p-1.5 backdrop-blur-sm flex items-center justify-center border border-white/10" 
              title="Producto Energizado (Enigma)"
            >
              <img 
                src="/img/logo-enigma-blanco.png" 
                alt="Logo Enigma" 
                className="h-full w-full object-contain opacity-80"
              />
            </div>
          </div>

          <div className="pt-6 md:pt-8">
            <h2 className="mb-2 font-poppins text-xl md:text-2xl font-extrabold text-white md:text-3xl lg:text-4xl">
              Colección Enigma
            </h2>
            <p className="font-sans text-sm md:text-base leading-relaxed text-zinc-400">
              La combinación de tecnología cuántica y diseño minimalista para un estilo único y moderno.
              Para elevar tu estilo y potenciar tu energía.
            </p>
          </div>
        </Link>

        {/* CARD 2: NATURE & SPIRIT */}
        <Link 
          href={`/${countryCode}/collections/nature-spirit`} // <--- 3. URL Manual
          className="group relative rounded-3xl bg-[#141414] p-4 md:p-6 shadow-[0_10px_40px_rgba(0,0,0,0.25)] transition-all duration-500 hover:shadow-[0_15px_50px_rgba(0,0,0,0.4)] hover:shadow-emerald-500/20 hover:-translate-y-2"
        >
          <div className="relative overflow-hidden rounded-2xl w-full aspect-video md:aspect-square">
            <img 
              src="/img/reme-tatei.jpg" 
              alt="Colección Nature & Spirit" 
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-110" 
            />
          </div>

          <div className="pt-6 md:pt-8">
            <h2 className="mb-2 font-poppins text-xl md:text-2xl font-extrabold text-white md:text-3xl lg:text-4xl">
              Nature & Spirit
            </h2>
            <p className="font-sans text-sm md:text-base leading-relaxed text-zinc-400">
              Nuestra colección en línea con la espiritualidad Universal, más allá de religiones.
              Diseños que marcan el camino de la conciencia.
            </p>
          </div>
        </Link>

      </div>
    </section>
  )
}

export default FeaturedCollections