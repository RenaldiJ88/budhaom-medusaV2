import { Metadata } from "next"

// 1. IMPORTAMOS EL NUEVO COMPONENTE DE BENEFICIOS
import BenefitsSection from "@modules/home/components/benefits-section"

// Importaciones previas
import TransformationBlock from "@modules/home/components/transformation-block"
import FeaturedCollections from "@modules/home/components/featured-collections"
import FeaturedProducts from "@modules/home/components/featured-products"
import Hero from "@modules/home/components/hero"
import { getCollectionsWithProducts } from "@lib/data/collections"
import { getRegion } from "@lib/data/regions"

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
      <FeaturedCollections />
      <TransformationBlock />

      {/* 2. AQUÍ VAN LAS 3 SECCIONES DE BENEFICIOS */}
      <BenefitsSection />

      <div className="py-12">
        <ul className="flex flex-col gap-x-6">
          <FeaturedProducts collections={collections} region={region} />
        </ul>
      </div>
    </>
  )
}