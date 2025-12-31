"use client"

// Eliminamos Popover y Transition para evitar errores de hidratación
import { ArrowRightMini, XMark } from "@medusajs/icons"
import { Text, clx, useToggleState } from "@medusajs/ui"
import { useState } from "react" // Usamos useState estándar
import Link from "next/link"
import CountrySelect from "../country-select"
import { HttpTypes } from "@medusajs/types"

const SideMenuItems = {
  Home: "/",
  Store: "/store",
  Search: "/search",
  Account: "/account",
  Cart: "/cart",
}

const SideMenu = ({ regions, countryCode }: { regions: HttpTypes.StoreRegion[] | null, countryCode: string }) => {
  const toggleState = useToggleState() // Para el country select
  
  // ESTADO MANUAL: Reemplaza al Popover
  const [isOpen, setIsOpen] = useState(false)

  const openMenu = () => setIsOpen(true)
  const closeMenu = () => setIsOpen(false)

  return (
    <div className="h-full">
      <div className="flex items-center h-full">
        
        {/* 1. BOTÓN DE APERTURA */}
        <button
          onClick={openMenu}
          className="relative h-full flex items-center transition-all ease-out duration-200 focus:outline-none hover:text-gray-300 text-white font-inter"
        >
          Menu
        </button>

        {/* 2. PANEL LATERAL (Renderizado Condicional Puro) */}
        {isOpen && (
            <div className="relative z-50">
                {/* FONDO OSCURO (Backdrop) */}
                <div 
                    className="fixed inset-0 bg-black/40 backdrop-blur-sm transition-opacity animate-in fade-in duration-200" 
                    onClick={closeMenu} // Cierra al hacer clic fuera
                />

                {/* EL MENÚ EN SÍ */}
                <div className="fixed inset-y-0 right-0 flex max-w-full pl-10 pointer-events-none">
                    <div className="w-screen max-w-md pointer-events-auto bg-[rgba(3,7,18,0.95)] border-l border-gray-800 shadow-xl h-full flex flex-col p-6 backdrop-blur-2xl animate-in slide-in-from-right duration-300">
                        
                        {/* BOTÓN CERRAR */}
                        <div className="flex justify-end mb-8">
                            <button onClick={closeMenu} className="text-white hover:text-gray-300 transition-colors">
                                <XMark className="h-6 w-6" />
                            </button>
                        </div>

                        {/* LISTA DE ENLACES */}
                        <ul className="flex flex-col gap-6 items-start justify-start text-white flex-1">
                            {Object.entries(SideMenuItems).map(([name, href]) => {
                                return (
                                <li key={name}>
                                    <Link
                                    href={`/${countryCode}${href}`}
                                    className="text-3xl leading-10 hover:text-cyan-400 transition-colors font-poppins font-light"
                                    onClick={closeMenu}
                                    >
                                    {name}
                                    </Link>
                                </li>
                                )
                            })}
                        </ul>

                        {/* PIE DEL MENÚ (Selector de País) */}
                        <div className="flex flex-col gap-y-6 border-t border-gray-800 pt-6">
                            <div
                                className="flex justify-between text-white cursor-pointer hover:text-gray-300"
                                onMouseEnter={toggleState.open}
                                onMouseLeave={toggleState.close}
                            >
                                {regions && (
                                <CountrySelect toggleState={toggleState} regions={regions} />
                                )}
                                <ArrowRightMini
                                className={clx(
                                    "transition-transform duration-150",
                                    toggleState.state ? "-rotate-90" : ""
                                )}
                                />
                            </div>
                            <Text className="flex justify-between txt-compact-small text-gray-500">
                                © {new Date().getFullYear()} Budha.Om. All rights reserved.
                            </Text>
                        </div>

                    </div>
                </div>
            </div>
        )}
      </div>
    </div>
  )
}

export default SideMenu