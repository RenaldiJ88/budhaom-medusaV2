import { Suspense } from "react"
import { retrieveCart } from "@lib/data/cart"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import NavClient from "./nav-client"
import Image from "next/image"
import { listRegions } from "@lib/data/regions"
import { StoreRegion } from "@medusajs/types"
import SideMenu from "@modules/layout/components/side-menu"

export default async function Nav({ countryCode }: { countryCode: string }) {
  const regions = await listRegions().then((regions: StoreRegion[]) => regions)
  const cart = await retrieveCart().catch(() => null)

  return (
    <div className="fixed top-0 inset-x-0 z-50 group">
      <header className="relative h-20 mx-auto duration-200 bg-transparent transition-colors">
        <nav className="flex items-center justify-between px-4 py-6 md:px-8 lg:px-16 w-full h-full">
          
          {/* --- IZQUIERDA: LOGO --- */}
          <div className="flex-shrink-0">
            <LocalizedClientLink href="/" className="hover:opacity-80 transition-opacity block">
              <Image 
                src="/img/budha-logo2.png" 
                alt="Logo BUDHA.Om" 
                width={120} 
                height={64}
                className="h-16 w-auto object-contain drop-shadow-[0_0_8px_rgba(0,0,0,0.35)]"
                priority
              />
            </LocalizedClientLink>
          </div>

          {/* --- CENTRO: LINKS (Solo Desktop) --- */}
          <div className="hidden md:flex items-center gap-8 absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2">
            <LocalizedClientLink
              href="/store"
              className="text-white hover:opacity-80 drop-shadow-[0_0_4px_rgba(0,0,0,0.3)] font-[Inter,sans-serif] text-sm uppercase tracking-widest transition-colors"
            >
              Tienda
            </LocalizedClientLink>
            <LocalizedClientLink
              href="/tecnologia"
              className="text-white hover:opacity-80 drop-shadow-[0_0_4px_rgba(0,0,0,0.3)] font-[Inter,sans-serif] text-sm uppercase tracking-widest transition-colors"
            >
              Tecnología Cuántica
            </LocalizedClientLink>
            <LocalizedClientLink
              href="/filosofia"
              className="text-white hover:opacity-80 drop-shadow-[0_0_4px_rgba(0,0,0,0.3)] font-[Inter,sans-serif] text-sm uppercase tracking-widest transition-colors"
            >
              Filosofía
            </LocalizedClientLink>
            <LocalizedClientLink
              href="/contacto"
              className="text-white hover:opacity-80 drop-shadow-[0_0_4px_rgba(0,0,0,0.3)] font-[Inter,sans-serif] text-sm uppercase tracking-widest transition-colors"
            >
              Contacto
            </LocalizedClientLink>
          </div>

          {/* --- DERECHA: MENU MOBILE + CARRITO --- */}
          <div className="flex items-center gap-4">
            {/* Menú Hamburguesa (Solo Mobile) */}
            <div className="md:hidden">
               <SideMenu regions={regions} countryCode={countryCode} />
            </div>

            {/* Carrito (Siempre visible) */}
            <Suspense fallback={<div className="w-6 h-6" />}>
              <NavClient cart={cart} collections={null} />
            </Suspense>
          </div>

        </nav>
      </header>
    </div>
  )
}