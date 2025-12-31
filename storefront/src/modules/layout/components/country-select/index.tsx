"use client"

import { useParams, usePathname } from "next/navigation"
import { useMemo, useState } from "react"
import { HttpTypes } from "@medusajs/types"

// ELIMINAMOS @headlessui/react y react-country-flag para máxima estabilidad
// Usamos HTML Nativo

type CountrySelectProps = {
  toggleState?: any 
  regions: HttpTypes.StoreRegion[]
}

const CountrySelect = ({ toggleState, regions }: CountrySelectProps) => {
  const { countryCode } = useParams()
  const pathname = usePathname()

  // Calcular la opción actual
  const currentCountry = useMemo(() => {
    if (!regions) return undefined
    for (const region of regions) {
      const found = region.countries?.find((c) => c.iso_2 === countryCode)
      if (found) return found
    }
    return undefined
  }, [regions, countryCode])

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCountryCode = e.target.value
    
    // Obtenemos la ruta actual sin el código de país viejo
    // Ej: /ar/store -> /store
    let pathWithoutCountry = pathname.replace(`/${countryCode}`, "")
    if (pathWithoutCountry === "") pathWithoutCountry = "/"
    
    // Forzamos la navegación a la nueva URL para que Medusa recargue el contexto
    window.location.href = `/${newCountryCode}${pathWithoutCountry}`
  }

  if (!regions) return null

  return (
    <div className="flex flex-col gap-y-2">
      {/* Label visual */}
      <span className="text-xs text-gray-400">Envío a:</span>
      
      <div className="relative w-full">
        <select
          value={currentCountry?.iso_2 || ""}
          onChange={handleChange}
          className="w-full appearance-none bg-transparent border border-gray-700 text-white text-sm rounded px-3 py-2 pr-8 cursor-pointer hover:border-gray-500 focus:outline-none focus:border-white transition-colors"
          style={{ colorScheme: "dark" }} // Asegura que el desplegable sea oscuro en navegadores
        >
          {regions.map((region) =>
            region.countries?.map((country) => (
              <option 
                key={country.iso_2} 
                value={country.iso_2}
                className="bg-gray-900 text-white"
              >
                {country.display_name}
              </option>
            ))
          )}
        </select>

        {/* Flecha decorativa CSS (ya que el select nativo la oculta con appearance-none) */}
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
          <svg className="h-4 w-4 fill-current" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
            <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
          </svg>
        </div>
      </div>
    </div>
  )
}

export default CountrySelect