import { Metadata } from "next"
import { notFound } from "next/navigation"

import { getProductByHandle, getProductsList } from "@lib/data/products"
import { getRegion } from "@lib/data/regions"
import ProductTemplate from "@modules/products/templates"

export const dynamic = "force-dynamic"

type Props = {
  params: { countryCode: string; handle: string }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const region = await getRegion(params.countryCode)
  if (!region) notFound()

  const product = await getProductByHandle(params.handle, region.id)
  if (!product) notFound()

  return {
    title: `${product.title} | BUDHA.Om`,
    description: product.description,
    openGraph: {
      title: `${product.title} | BUDHA.Om`,
      description: product.description ?? undefined,
      images: product.thumbnail ? [product.thumbnail] : [],
    },
  }
}

export default async function ProductPage({ params }: Props) {
  const region = await getRegion(params.countryCode)
  if (!region) notFound()

  const product = await getProductByHandle(params.handle, region.id)
  if (!product) notFound()

  return (
    <ProductTemplate 
      product={product} 
      region={region} 
      countryCode={params.countryCode} 
    />
  )
}