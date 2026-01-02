import { Suspense } from "react"
import { retrieveCart } from "@lib/data/cart"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import NavClient from "./nav-client"
import Image from "next/image"

export default async function Nav() {
  // 1. Traemos la lógica del carrito (lo que arreglamos antes)
  const cart = await retrieveCart().catch(() => null)

  return (
    <div className="fixed top-0 inset-x-0 z-50 group">
      <header className="relative h-20 mx-auto duration-200 bg-transparent transition-colors">
        <nav className="flex items-center justify-between px-4 py-6 md:px-8 lg:px-16 w-full h-full">
          
          {/* --- LOGO IZQUIERDA --- */}
          <div className="flex-1 basis-0 h-full flex items-center">
            <LocalizedClientLink href="/" className="hover:opacity-80 transition-opacity">
              {/* Asegúrate de que la imagen esté en public/img/budha-logo2.png */}
              <Image 
                src="/img/budha-logo2.png" 
                alt="Logo BUDHA.Om" 
                width={120} 
                height={64}
                className="h-16 w-auto object-contain drop-shadow-[0_0_8px_rgba(0,0,0,0.35)]"
              />
            </LocalizedClientLink>
          </div>

          {/* --- LINKS CENTRO (Tu menú) --- */}
          <div className="hidden md:flex items-center gap-8">
            <LocalizedClientLink
              href="/store"
              className="text-white hover:opacity-80 drop-shadow-[0_0_4px_rgba(0,0,0,0.3)] font-[Inter,sans-serif] text-sm uppercase tracking-widest"
            >
              Tienda
            </LocalizedClientLink>
            <LocalizedClientLink
              href="/tecnologia"
              className="text-white hover:opacity-80 drop-shadow-[0_0_4px_rgba(0,0,0,0.3)] font-[Inter,sans-serif] text-sm uppercase tracking-widest"
            >
              Tecnología Cuántica
            </LocalizedClientLink>
            <LocalizedClientLink
              href="/filosofia"
              className="text-white hover:opacity-80 drop-shadow-[0_0_4px_rgba(0,0,0,0.3)] font-[Inter,sans-serif] text-sm uppercase tracking-widest"
            >
              Filosofía
            </LocalizedClientLink>
            <LocalizedClientLink
              href="/contacto"
              className="text-white hover:opacity-80 drop-shadow-[0_0_4px_rgba(0,0,0,0.3)] font-[Inter,sans-serif] text-sm uppercase tracking-widest"
            >
              Contacto
            </LocalizedClientLink>
          </div>

          {/* --- CARRITO DERECHA (Aquí inyectamos la lógica) --- */}
          <div className="flex items-center gap-x-6 h-full flex-1 basis-0 justify-end">
            <Suspense
              fallback={
                <div className="text-white">Cart (0)</div>
              }
            >
              {/* Le pasamos el carrito real y null en colecciones ya que no las usamos en este diseño */}
              <NavClient cart={cart} collections={null} />
            </Suspense>
          </div>
        </nav>
      </header>
    </div>
  )
}