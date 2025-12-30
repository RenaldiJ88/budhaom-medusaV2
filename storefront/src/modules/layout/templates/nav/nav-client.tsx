"use client"

import { useEffect, useState } from "react"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import CartButton from "@modules/layout/components/cart-button"

// Tip: Si necesitas las regiones para un selector de país, las recibes aquí, 
// pero tu diseño HTML original no tenía selector de país, así que lo omito para respetar tu diseño.
export default function NavClient() {
  
  // ESTADO 1: Controla si el usuario hizo scroll
  const [isScrolled, setIsScrolled] = useState(false)
  
  // ESTADO 2: Controla si el menú móvil está abierto o cerrado
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  // Lógica del Scroll
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50)
    }
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  // Función para cerrar el menú al hacer clic en un link (UX básica)
  const closeMenu = () => setIsMobileMenuOpen(false)

  return (
    <>
      {/* --- NAVBAR PRINCIPAL --- */}
      <nav
        className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 md:px-8 lg:px-16 transition-all duration-300 ${
          isScrolled 
            ? "bg-black/95 py-3 shadow-lg" // Fondo negro al bajar
            : "bg-transparent py-5"        // Transparente arriba
        }`}
      >
        
        {/* 1. LOGO */}
        <LocalizedClientLink href="/" className="hover:opacity-90 transition-opacity" onClick={closeMenu}>
          <img
            src="/img/budha-logo2.png"
            alt="Logo BUDHA.Om"
            className={`${isScrolled ? "h-14" : "h-16 md:h-18"} w-auto transition-all duration-300 drop-shadow-[0_0_8px_rgba(0,0,0,0.35)]`}
          />
        </LocalizedClientLink>

        {/* 2. LINKS DE ESCRITORIO (Ocultos en móvil) */}
        <div className="hidden items-center gap-8 md:flex">
          <NavLink href="/store">Tienda</NavLink>
          <NavLink href="/tecnologia">Tecnología Cuántica</NavLink>
          <NavLink href="/filosofia">Nuestra Filosofía</NavLink>
          <NavLink href="/contacto">Contacto</NavLink>
        </div>

        {/* 3. BOTONES DERECHA (Hamburguesa + Carrito) */}
        <div className="flex items-center gap-4">
          
          {/* Botón Hamburguesa (Solo móvil) */}
          <button 
            type="button"
            onClick={() => setIsMobileMenuOpen(true)} // ABRIR MENÚ
            className="md:hidden text-white transition-colors hover:opacity-80 drop-shadow-[0_0_4px_rgba(0,0,0,0.35)] relative z-50 cursor-pointer"
          >
            <svg className="h-6 w-6 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          </button>

          {/* Botón Carrito (Medusa) */}
          <div className="text-white transition-colors hover:opacity-80 cursor-pointer drop-shadow-[0_0_4px_rgba(0,0,0,0.35)]">
            <CartButton />
          </div>
        </div>
      </nav>

      {/* --- MENÚ DESPLEGABLE MÓVIL --- */}
      {/* Usamos renderizado condicional o clases para mostrarlo */}
      <div 
        className={`
          md:hidden fixed top-0 left-0 right-0 bg-[#101010] border-t border-gray-800 z-40 pt-20 transition-transform duration-300 ease-in-out
          ${isMobileMenuOpen ? "translate-y-0 shadow-2xl" : "-translate-y-full"}
        `}
        style={{ height: 'auto', minHeight: '50vh' }} // Asegura que tenga altura
      >
        <div className="flex flex-col px-4 py-4 gap-4">
          
          {/* Cabecera del menú móvil con botón cerrar */}
          <div className="flex items-center justify-between mb-2">
            <span className="text-white font-inter font-semibold">Menú</span>
            <button 
              onClick={() => setIsMobileMenuOpen(false)} // CERRAR MENÚ
              className="text-cyan-500 transition-colors hover:opacity-80 cursor-pointer"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Links del menú móvil */}
          <MobileLink href="/store" onClick={closeMenu}>Tienda</MobileLink>
          <MobileLink href="/tecnologia" onClick={closeMenu}>Tecnología Cuántica</MobileLink>
          <MobileLink href="/filosofia" onClick={closeMenu}>Nuestra Filosofía</MobileLink>
          <MobileLink href="/contacto" onClick={closeMenu}>Contacto</MobileLink>
        </div>
      </div>
    </>
  )
}

// --- PEQUEÑOS COMPONENTES AUXILIARES PARA LIMPIAR CÓDIGO ---

// Link de Escritorio
const NavLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <LocalizedClientLink
    href={href}
    className="text-white transition-colors hover:opacity-80 font-inter drop-shadow-[0_0_4px_rgba(0,0,0,0.3)]"
  >
    {children}
  </LocalizedClientLink>
)

// Link de Móvil
const MobileLink = ({ href, children, onClick }: { href: string; children: React.ReactNode; onClick: () => void }) => (
  <LocalizedClientLink
    href={href}
    className="text-white transition-colors hover:opacity-80 font-inter py-2 border-b border-gray-800/50"
    onClick={onClick}
  >
    {children}
  </LocalizedClientLink>
)