import { Metadata } from "next"
import { notFound } from "next/navigation"

import {
  getCollectionByHandle,
  getCollectionsList,
} from "@lib/data/collections"
import { listRegions, getRegion } from "@lib/data/regions"
import { getProductsList } from "@lib/data/products"
import { StoreCollection, StoreRegion, StoreProduct } from "@medusajs/types"
import ProductPreview from "@modules/products/components/product-preview"
import { SortOptions } from "@modules/store/components/refinement-list/sort-products"

export const dynamic = "force-dynamic"

type Props = {
  params: { handle: string; countryCode: string }
  searchParams: {
    page?: string
    sortBy?: SortOptions
  }
}

export const PRODUCT_LIMIT = 12

export async function generateStaticParams() {
  const { collections } = await getCollectionsList()

  if (!collections) {
    return []
  }

  const countryCodes = await listRegions().then(
    (regions: StoreRegion[]) =>
      regions
        ?.map((r) => r.countries?.map((c) => c.iso_2))
        .flat()
        .filter(Boolean) as string[]
  )

  const collectionHandles = collections.map(
    (collection: StoreCollection) => collection.handle
  )

  const staticParams = countryCodes
    ?.map((countryCode: string) =>
      collectionHandles.map((handle: string | undefined) => ({
        countryCode,
        handle,
      }))
    )
    .flat()

  return staticParams
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const collection = await getCollectionByHandle(params.handle)

  if (!collection) {
    notFound()
  }

  const metadata = {
    title: `${collection.title} | Budha.Om`,
    description: `${collection.title} collection`,
  } as Metadata

  return metadata
}

export default async function CollectionPage({ params, searchParams }: Props) {
  const { sortBy, page } = searchParams

  const collection = await getCollectionByHandle(params.handle)
  const region = await getRegion(params.countryCode)

  if (!collection || !region) {
    notFound()
  }

  const pageNumber = page ? parseInt(page) : 1

  // 👇 CORREGIDO SEGÚN TU MENSAJE DE ERROR
  // Eliminamos 'page' y usamos 'pageParam'
  // Eliminamos 'regionId' ya que la firma solo pide countryCode
  const { response } = await getProductsList({
    pageParam: pageNumber, 
    countryCode: params.countryCode,
    queryParams: {
      collection_id: [collection.id],
      limit: PRODUCT_LIMIT,
    } as any, 
  })

  const products = response.products

  // 👇 CORRECCIÓN ERROR UNKNOWN: Validamos antes de renderizar
  const description = typeof collection.metadata?.description === 'string' 
    ? collection.metadata.description 
    : null

  return (
    <div className="py-12 content-container bg-[#101010] min-h-screen text-white">
      <div className="mb-16 text-center">
        <h1 className="text-4xl md:text-5xl font-poppins font-bold uppercase tracking-wider text-white mb-4">
          {collection.title}
        </h1>
        {description && (
          <p className="text-gray-400 font-inter max-w-2xl mx-auto">
            {description}
          </p>
        )}
      </div>

      {products && products.length > 0 ? (
        <ul className="grid grid-cols-2 small:grid-cols-3 medium:grid-cols-4 gap-x-6 gap-y-8">
          {products.map((product: StoreProduct) => (
            <li key={product.id}>
              <ProductPreview 
                product={product} 
                region={region} 
                isFeatured={false}
              />
            </li>
          ))}
        </ul>
      ) : (
        <div className="text-center text-gray-500 py-20 font-inter">
          No hay productos en esta colección todavía.
        </div>
      )}
    </div>
  )
}