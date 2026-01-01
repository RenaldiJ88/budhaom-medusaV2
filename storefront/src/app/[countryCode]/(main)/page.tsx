import { Metadata } from "next"

import Hero from "@modules/home/components/hero"
import FeaturedCollections from "@modules/home/components/featured-collections"
import TransformationBlock from "@modules/home/components/transformation-block"
import BenefitsSection from "@modules/home/components/benefits-section"
import TransformationVideo from "@modules/home/components/transformation-video"
import NatureSpiritSection from "@modules/home/components/nature-spirit-section"
import DesignCarousel from "@modules/home/components/design-carousel"
import FeaturedProducts from "@modules/home/components/featured-products"
import MensajeFinal from "@modules/home/components/mensaje-final"
import NewsletterSection from "@modules/home/components/newsletter-section"

import { getCollectionsWithProducts } from "@lib/data/collections"
import { getRegion } from "@lib/data/regions"

// 👇 ¡ESTA ES LA SOLUCIÓN AL ERROR DYNAMIC_SERVER_USAGE! 👇
export const dynamic = "force-dynamic"

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
      <Hero countryCode={countryCode} />
      
      <FeaturedCollections countryCode={countryCode} />
      
      <TransformationBlock countryCode={countryCode} />
      
      <BenefitsSection />
      
      <TransformationVideo countryCode={countryCode} />
      
      <NatureSpiritSection />
      
      <DesignCarousel countryCode={countryCode} />

      {/* 1. MOVÍ LOS PRODUCTOS AQUÍ ⬆️
          Los sacamos del final para que no corten el diseño oscuro del footer.
          Ahora están después del carrusel de diseño.
      */}
      <div className="bg-white">
        <ul className="flex flex-col gap-x-6">
          <FeaturedProducts collections={collections} region={region} />
        </ul>
      </div> 

      {/* 2. CONTENEDOR FINAL OSCURO ⬛
          Agrupamos el Mensaje Final y el Newsletter en un fondo negro (#101010).
          Al ser lo último de la página, se fusionará perfectamente con el Footer (que también es #101010).
      */}
      <div className="bg-[#101010]">
        <MensajeFinal />
        <NewsletterSection />
      </div>
    </>
  )
}