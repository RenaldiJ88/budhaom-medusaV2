import { Metadata } from "next"

import Hero from "@modules/home/components/hero"
import FeaturedCollections from "@modules/home/components/featured-collections"
import TransformationBlock from "@modules/home/components/transformation-block"
import BenefitsSection from "@modules/home/components/benefits-section"
import TransformationVideo from "@modules/home/components/transformation-video"
import NatureSpiritSection from "@modules/home/components/nature-spirit-section"
import DesignCarousel from "@modules/home/components/design-carousel"
import FeaturedProducts from "@modules/home/components/featured-products"

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
      {/* 1. AQUÍ ESTABA EL CULPABLE: Pasamos countryCode al Hero */}
      <Hero countryCode={countryCode} />
      
      <FeaturedCollections countryCode={countryCode} />
      
      <TransformationBlock countryCode={countryCode} />
      
      <BenefitsSection />
      
      <TransformationVideo countryCode={countryCode} />
      
      <NatureSpiritSection />
      
      <DesignCarousel countryCode={countryCode} />

      {/* <div className="py-12 bg-white">
  <ul className="flex flex-col gap-x-6">
    <FeaturedProducts collections={collections} region={region} />
  </ul>
</div> 
*/}
    </>
  )
}