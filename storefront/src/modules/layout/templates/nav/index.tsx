import { Suspense } from "react"
import NavClient from "./nav-client"
import { listRegions } from "@lib/data/regions"
import { getRegion } from "@lib/data/regions"

export default async function Nav({ countryCode }: { countryCode: string }) {
  // Mantenemos la lógica de Medusa para obtener regiones (importante para el carrito y selectores)
  const regions = await listRegions()
  const region = await getRegion(countryCode)

  if (!regions || !region) {
    return null
  }

  return (
    <Suspense fallback={<div className="fixed top-0 w-full h-16 bg-black/50" />}>
      {/* Pasamos todos los datos necesarios al cliente para evitar llamadas al servidor luego */}
      <NavClient region={region} regions={regions} countryCode={countryCode} />
    </Suspense>
  )
}