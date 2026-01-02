"use client"

import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { HttpTypes } from "@medusajs/types"
import CartDropdown from "@modules/layout/components/cart-dropdown"

// Definimos los tipos correctamente para arreglar el Error 2 del Paso 1
type NavClientProps = {
  cart: HttpTypes.StoreCart | null
  collections: HttpTypes.StoreCollection[] | null
}

export default function NavClient({ cart, collections }: NavClientProps) {
  const pathname = usePathname()
  const [countryCode, setCountryCode] = useState<string>("ar")

  useEffect(() => {
    if (pathname) {
      const segments = pathname.split("/")
      if (segments.length > 1) {
        setCountryCode(segments[1])
      }
    }
  }, [pathname])

  return (
    <div className="h-full flex items-center">
      {/* Pasamos countryCode para arreglar el error */}
      <CartDropdown cart={cart} countryCode={countryCode} />
    </div>
  )
}