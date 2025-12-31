"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import CartDropdown from "@modules/layout/components/cart-dropdown"
import { HttpTypes } from "@medusajs/types" // ✅ TIPOS V2
import SideMenu from "@modules/layout/components/side-menu"

// Definimos los props
type NavClientProps = {
  regions: HttpTypes.StoreRegion[]
  region: HttpTypes.StoreRegion
  countryCode: string
}

export default function NavClient({ regions, region, countryCode }: NavClientProps) {

    const [isScrolled, setIsScrolled] = useState(false)
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

    useEffect(() => {
        const handleScroll = () => {
            setIsScrolled(window.scrollY > 50)
        }
        window.addEventListener("scroll", handleScroll)
        return () => window.removeEventListener("scroll", handleScroll)
    }, [])

    const closeMenu = () => setIsMobileMenuOpen(false)

    return (
        <>
            <nav
                className={`fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 md:px-8 lg:px-16 transition-colors duration-500 ease-in-out py-4 ${isScrolled
                        ? "bg-[#101010]/95 shadow-lg"
                        : "bg-transparent"
                    }`}
            >
                {/* 1. LOGO */}
                <Link href={`/${countryCode}`} className="hover:opacity-90 transition-opacity" onClick={closeMenu}>
                    <img
                        src="/img/budha-logo2.png"
                        alt="Logo BUDHA.Om"
                        className={`${isScrolled ? "h-14" : "h-16 md:h-18"} w-auto transition-all duration-300 drop-shadow-[0_0_8px_rgba(0,0,0,0.35)]`}
                    />
                </Link>

                {/* 2. LINKS DE ESCRITORIO */}
                <div className="hidden items-center gap-8 md:flex">
                    <NavLink href={`/${countryCode}/store`}>Tienda</NavLink>
                    <NavLink href={`/${countryCode}/tecnologia`}>Tecnología Cuántica</NavLink>
                    <NavLink href={`/${countryCode}/filosofia`}>Nuestra Filosofía</NavLink>
                    <NavLink href={`/${countryCode}/contacto`}>Contacto</NavLink>
                </div>

                {/* 3. BOTONES DERECHA */}
                <div className="flex items-center gap-4">
                    <button
                        type="button"
                        onClick={() => setIsMobileMenuOpen(true)}
                        className="md:hidden text-white transition-colors hover:opacity-80 drop-shadow-[0_0_4px_rgba(0,0,0,0.35)] relative z-50 cursor-pointer"
                    >
                        <svg className="h-6 w-6 pointer-events-none" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path d="M3 12h18M3 6h18M3 18h18" />
                        </svg>
                    </button>

                    <div className="text-white transition-colors hover:opacity-80 cursor-pointer drop-shadow-[0_0_4px_rgba(0,0,0,0.35)] h-full flex items-center">
                        {/* Pasamos cart={null} por ahora para que no explote el build. Luego lo conectamos al contexto V2 si hace falta */}
                        <CartDropdown cart={null} countryCode={countryCode} />
                    </div>
                </div>
            </nav>

            {/* MENÚ MÓVIL */}
            <div
                className={`
          md:hidden fixed top-0 left-0 right-0 bg-[#101010] border-t border-gray-800 z-40 pt-20 transition-transform duration-300 ease-in-out
          ${isMobileMenuOpen ? "translate-y-0 shadow-2xl" : "-translate-y-full"}
        `}
                style={{ height: 'auto', minHeight: '50vh' }}
            >
                <div className="flex flex-col px-4 py-4 gap-4">
                    <div className="flex items-center justify-between mb-2">
                        <span className="text-white font-inter font-semibold">Menú</span>
                        <button
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="text-cyan-500 transition-colors hover:opacity-80 cursor-pointer"
                        >
                            <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                        </button>
                    </div>

                    <MobileLink href={`/${countryCode}/store`} onClick={closeMenu}>Tienda</MobileLink>
                    <MobileLink href={`/${countryCode}/tecnologia`} onClick={closeMenu}>Tecnología Cuántica</MobileLink>
                    <MobileLink href={`/${countryCode}/filosofia`} onClick={closeMenu}>Nuestra Filosofía</MobileLink>
                    <MobileLink href={`/${countryCode}/contacto`} onClick={closeMenu}>Contacto</MobileLink>
                </div>
            </div>
        </>
    )
}

const NavLink = ({ href, children }: { href: string; children: React.ReactNode }) => (
    <Link
        href={href}
        className="text-white transition-colors hover:opacity-80 font-inter drop-shadow-[0_0_4px_rgba(0,0,0,0.3)]"
    >
        {children}
    </Link>
)

const MobileLink = ({ href, children, onClick }: { href: string; children: React.ReactNode; onClick: () => void }) => (
    <Link
        href={href}
        className="text-white transition-colors hover:opacity-80 font-inter py-2 border-b border-gray-800/50 block"
        onClick={onClick}
    >
        {children}
    </Link>
)