import { Suspense } from "react"
import { retrieveCart } from "@lib/data/cart"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import NavClient from "./nav-client"
import Image from "next/image"
import { listRegions } from "@lib/data/regions"
import { StoreRegion } from "@medusajs/types"
import SideMenu from "@modules/layout/components/side-menu"

// 👇 1. Definimos que este componente recibe countryCode
export default async function Nav({ countryCode }: { countryCode: string }) {
  
  const regions = await listRegions().then((regions: StoreRegion[]) => regions)
  const cart = await retrieveCart().catch(() => null)

  return (
    <div className="fixed top-0 inset-x-0 z-50 group">
      <header className="relative h-20 mx-auto duration-200 bg-transparent transition-colors">
        <nav className="flex items-center justify-between px-4 py-6 md:px-8 lg:px-16 w-full h-full">
          
          {/* --- MENU HAMBURGUESA IZQUIERDA (SideMenu) --- */}
          {/* Aquí usábamos "ar" fijo, ahora usamos el real */}
          <div className="flex-1 basis-0 h-full flex items-center">
             <div className="h-full">
                <SideMenu regions={regions} countryCode={countryCode} />
             </div>
          </div>

          {/* --- LOGO CENTRO --- */}
          <div className="flex items-center justify-center h-full">
            <LocalizedClientLink href="/" className="hover:opacity-80 transition-opacity">
              <Image 
                src="/img/budha-logo2.png" 
                alt="Logo BUDHA.Om" 
                width={120} 
                height={64}
                className="h-16 w-auto object-contain drop-shadow-[0_0_8px_rgba(0,0,0,0.35)]"
              />
            </LocalizedClientLink>
          </div>

          {/* --- LINKS CENTRO (Tu menú de escritorio) --- */}
          <div className="hidden md:flex items-center gap-8 absolute left-1/2 transform -translate-x-1/2">
             {/* Nota: Si quieres mantener los links centrados visualmente, el logo debería ir a la izquierda o los links no ser absolutos.
                 En tu diseño original el logo estaba a la izq. Si prefieres logo izq y links centro, descomenta abajo y quita el div del logo de arriba.
             */}
          </div>
          
          {/* --- MENÚ DE TEXTO (Desktop) --- */}
          <div className="hidden md:flex items-center gap-8 mr-auto ml-16"> 
             {/* Ajusta la posición según prefieras */}
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

          {/* --- CARRITO DERECHA --- */}
          <div className="flex items-center gap-x-6 h-full flex-1 basis-0 justify-end">
            <Suspense
              fallback={
                <div className="text-white">Cart (0)</div>
              }
            >
              <NavClient cart={cart} collections={null} />
            </Suspense>
          </div>
        </nav>
      </header>
    </div>
  )
}