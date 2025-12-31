const MensajeFinal = () => {
    return (
      <section 
        className="relative flex h-screen w-full items-center justify-center overflow-hidden bg-[#101010] bg-[url('/img/mquc.png')] bg-center bg-cover bg-no-repeat"
      >
        {/* Overlay oscuro para que se lea el texto */}
        <div className="absolute inset-0 bg-black/20"></div>
        
        {/* Contenido */}
        <div className="relative z-20 max-w-5xl px-6 text-center">
          <h1 className="mb-6 font-poppins text-5xl font-bold leading-tight text-white md:text-6xl lg:text-7xl">
            Más que ropa. Un camino.
          </h1>
          <p className="font-inter text-lg leading-relaxed text-white md:text-xl lg:text-2xl">
            Creemos que vestir es un acto de conciencia... un puente entre un diseño que te representa y una tecnología que te potencia.
          </p>
        </div>
      </section>
    )
  }
  
  export default MensajeFinal