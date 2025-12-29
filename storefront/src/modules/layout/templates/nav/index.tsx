import { Suspense } from "react"

import { listRegions } from "@lib/data/regions"
import { StoreRegion } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import CartButton from "@modules/layout/components/cart-button"
import SideMenu from "@modules/layout/components/side-menu"

export default async function Nav() {
  const regions = await listRegions().then((regions: StoreRegion[]) => regions)

  return (
    // TU CONTENEDOR PRINCIPAL (Con tus clases visuales + z-[1000] para ganarle al video)
    <nav className="fixed top-0 left-0 right-0 z-[1000] flex items-center justify-between px-4 md:px-8 lg:px-16 bg-transparent transition-colors duration-300">
      
      {/* 1. LOGO */}
      <LocalizedClientLink href="/" className="hover:opacity-90 transition-opacity">
        {/* NOTA: En Next.js la carpeta 'public' es la raiz '/'. 
            Asegúrate de que tu imagen esté en: tu-proyecto/public/img/budha-logo2.png
        */}
        <img 
          src="/img/budha-logo2.png" 
          alt="Logo BUDHA.Om" 
          className="h-16 md:h-18 w-auto drop-shadow-[0_0_8px_rgba(0,0,0,0.35)]" 
        />
      </LocalizedClientLink>

      {/* 2. LINKS CENTRALES (Solo Desktop - Visible md:flex) */}
      <div className="hidden items-center gap-8 md:flex">
        <LocalizedClientLink
          href="/store"
          className="text-white transition-colors hover:opacity-80 font-inter drop-shadow-[0_0_4px_rgba(0,0,0,0.3)]"
        >
          Tienda
        </LocalizedClientLink>
        
        <LocalizedClientLink
          href="/tecnologia"
          className="text-white transition-colors hover:opacity-80 font-inter drop-shadow-[0_0_4px_rgba(0,0,0,0.3)]"
        >
          Tecnología Cuántica
        </LocalizedClientLink>
        
        <LocalizedClientLink
          href="/filosofia"
          className="text-white transition-colors hover:opacity-80 font-inter drop-shadow-[0_0_4px_rgba(0,0,0,0.3)]"
        >
          Nuestra Filosofía
        </LocalizedClientLink>
        
        <LocalizedClientLink
          href="/contacto"
          className="text-white transition-colors hover:opacity-80 font-inter drop-shadow-[0_0_4px_rgba(0,0,0,0.3)]"
        >
          Contacto
        </LocalizedClientLink>
      </div>

      {/* 3. PARTE DERECHA (Menú Móvil + Carrito) */}
      <div className="flex items-center gap-4">
        
        {/* MENÚ HAMBURGUESA (Solo Móvil - Visible md:hidden) */}
        {/* Usamos el SideMenu de Medusa pero lo envolvemos para que salga solo en movil */}
        <div className="md:hidden relative z-50 text-white drop-shadow-[0_0_4px_rgba(0,0,0,0.35)]">
            <SideMenu regions={regions} />
        </div>

        {/* CARRITO (Visible siempre) */}
        <div className="text-white hover:opacity-80 transition-colors drop-shadow-[0_0_4px_rgba(0,0,0,0.35)]">
            <Suspense fallback={<div className="w-6 h-6" />}>
                {/* El CartButton de Medusa por defecto muestra texto "Cart(0)". 
                   Si quieres tu icono de bolsita exacto, tendríamos que editar el archivo 'cart-button.tsx'.
                   Por ahora, esto mantendrá la funcionalidad.
                */}
                <CartButton />
            </Suspense>
        </div>

      </div>
    </nav>
  )
}