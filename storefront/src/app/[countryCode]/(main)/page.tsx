import { Metadata } from "next"

// --- IMPORTACIONES DE TUS COMPONENTES ---
// Estos componentes SI tienen "use client" dentro de sus propios archivos, y está bien.
import Hero from "@modules/home/components/hero"
import FeaturedCollections from "@modules/home/components/featured-collections"
import TransformationBlock from "@modules/home/components/transformation-block"
import BenefitsSection from "@modules/home/components/benefits-section"
import FeaturedProducts from "@modules/home/components/featured-products"

// --- IMPORTACIONES DE MEDUSA ---
import { getCollectionsWithProducts } from "@lib/data/collections"
import { getRegion } from "@lib/data/regions"

// ESTO SOLO FUNCIONA SI EL ARCHIVO ES SERVER SIDE (NO "use client")
export const metadata: Metadata = {
  title: "Budha.Om | Vestí tu esencia",
  description: "Tienda de ropa con tecnología cuántica y espiritualidad.",
}

export default async function Home({
  params: { countryCode },
}: {
  params: { countryCode: string }
}) {
  const collections = await getCollectionsWithProducts(countryCode)
  const region = await getRegion(countryCode)

  if (!collections || !region) {
    return null
  }

  return (
    <>
      <Hero />
      {/* PRUEBA: COMENTA ESTOS 3 UN MOMENTO */}
      {/* <FeaturedCollections /> */}
      {/* <TransformationBlock /> */}
      {/* <BenefitsSection /> */}
      <div className="py-12 bg-white">
        <ul className="flex flex-col gap-x-6">
          <FeaturedProducts collections={collections} region={region} />
        </ul>
      </div>
    </>
  )
}