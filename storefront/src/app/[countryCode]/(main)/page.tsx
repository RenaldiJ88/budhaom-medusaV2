import { Metadata } from "next"

// 1. IMPORTAMOS TU NUEVO COMPONENTE AQUÍ
import FeaturedCollections from "@modules/home/components/featured-collections"

// Importaciones originales (NO BORRAR)
import FeaturedProducts from "@modules/home/components/featured-products"
import Hero from "@modules/home/components/hero"
import { getCollectionsWithProducts } from "@lib/data/collections"
import { getRegion } from "@lib/data/regions"

export const metadata: Metadata = {
  // Aproveché para poner el título de tu marca
  title: "Budha.Om | Vestí tu esencia",
  description:
    "Tienda de ropa con tecnología cuántica y espiritualidad.",
}

export default async function Home({
  params: { countryCode },
}: {
  params: { countryCode: string }
}) {
  // --- LÓGICA SAGRADA DE MEDUSA (NO TOCAR) ---
  // Esto obtiene los productos y la región desde el backend
  const collections = await getCollectionsWithProducts(countryCode)
  const region = await getRegion(countryCode)

  // Si no hay conexión o datos, no muestra nada (seguridad)
  if (!collections || !region) {
    return null
  }
  // -------------------------------------------

  return (
    <>
      {/* 1. EL VIDEO HERO */}
      <Hero />

      {/* 2. TU NUEVA SECCIÓN (Las 2 Tarjetas de Enigma / Nature) */}
      <FeaturedCollections />

      {/* 3. LOS PRODUCTOS CARGADOS DESDE MEDUSA (Carruseles) */}
      <div className="py-12">
        <ul className="flex flex-col gap-x-6">
          <FeaturedProducts collections={collections} region={region} />
        </ul>
      </div>
    </>
  )
}