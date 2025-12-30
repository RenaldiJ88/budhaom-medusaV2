"use client"

import React from "react"
import { Metadata } from "next"

// --- IMPORTACIONES DE TUS COMPONENTES ---
import Hero from "@modules/home/components/hero"
import FeaturedCollections from "@modules/home/components/featured-collections"
import TransformationBlock from "@modules/home/components/transformation-block" // <--- NUEVO
import BenefitsSection from "@modules/home/components/benefits-section"
import FeaturedProducts from "@modules/home/components/featured-products"

// --- IMPORTACIONES DE MEDUSA ---
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
  // Lógica de datos de Medusa (No tocar)
  const collections = await getCollectionsWithProducts(countryCode)
  const region = await getRegion(countryCode)

  if (!collections || !region) {
    return null
  }

  return (
    <>
      {/* 1. VIDEO PRINCIPAL */}
      <Hero />

      {/* 2. TARJETAS DE COLECCIONES (Enigma vs Nature) */}
      <FeaturedCollections />

      {/* 3. BLOQUE DE TRANSFORMACIÓN (Texto + Torus) */}
      <TransformationBlock />

      {/* 4. BENEFICIOS (3 Secciones Scrollables) */}
      <BenefitsSection />

      {/* 5. CARRUSEL DE PRODUCTOS REALES */}
      <div className="py-12 bg-white">
        <ul className="flex flex-col gap-x-6">
          <FeaturedProducts collections={collections} region={region} />
        </ul>
      </div>
    </>
  )
}