import { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link"

import { getCollectionByHandle, getCollectionsList } from "@lib/data/collections"
import { listRegions, getRegion } from "@lib/data/regions"
import { getProductsList } from "@lib/data/products"
import { StoreCollection, StoreRegion } from "@medusajs/types"

export const dynamic = "force-dynamic"
export const PRODUCT_LIMIT = 12

// 🎥 DICCIONARIO DE VIDEOS
const COLLECTION_VIDEOS: Record<string, string> = {
  "nature-spirit": "/video/video-esencia.mp4",
  "enigma": "/video/video-energizada.mp4",
  "default": "/video/video-esencia.mp4"
}

type Props = {
  params: { handle: string; countryCode: string }
  searchParams: { page?: string }
}

export async function generateStaticParams() {
  const { collections } = await getCollectionsList()
  if (!collections) return []
  const countryCodes = await listRegions().then((regions) =>
    regions?.map((r) => r.countries?.map((c) => c.iso_2)).flat().filter(Boolean) as string[]
  )
  const collectionHandles = collections.map((collection) => collection.handle)
  return countryCodes?.map((countryCode) =>
    collectionHandles.map((handle) => ({ countryCode, handle }))
  ).flat()
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const collection = await getCollectionByHandle(params.handle)
  if (!collection) notFound()
  return {
    title: `${collection.title} | BUDHA.Om`,
    description: `${collection.title} collection`,
  }
}

export default async function CollectionPage({ params, searchParams }: Props) {
  const { page } = searchParams
  const collection = await getCollectionByHandle(params.handle)
  const region = await getRegion(params.countryCode)

  if (!collection || !region) notFound()

  const pageNumber = page ? parseInt(page) : 1
  const { response } = await getProductsList({
    pageParam: pageNumber,
    countryCode: params.countryCode,
    queryParams: { collection_id: [collection.id], limit: PRODUCT_LIMIT } as any,
  })

  const products = response.products
  
  // 🟢 CORRECCIÓN ERROR TYPE: Convertimos explícitamente a string o null
  const descriptionText = typeof collection.metadata?.description === 'string' 
    ? collection.metadata.description 
    : null

  // Seleccionamos el video basado en el handle de la URL
  const videoSrc = COLLECTION_VIDEOS[params.handle] || COLLECTION_VIDEOS["default"]

  return (
    <div className="bg-[#101010] min-h-screen text-white">
      
      {/* --- HERO SECTION CON VIDEO --- */}
      <section className="relative w-full h-screen overflow-hidden">
        <video 
          className="object-cover w-full h-full opacity-70" 
          autoPlay 
          loop 
          muted 
          playsInline
        >
          <source src={videoSrc} type="video/mp4" />
          Tu navegador no admite el video de fondo.
        </video>
        
        <div className="absolute inset-0 bg-black/40 z-0"></div>

        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 px-4">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4 text-center drop-shadow-[0_0_10px_rgba(0,0,0,0.8)] font-[Poppins,sans-serif] uppercase tracking-wider">
            {collection.title}
          </h1>
          
          {/* Usamos la variable segura 'descriptionText' */}
          {descriptionText && (
             <p className="text-xl md:text-2xl text-white text-center max-w-2xl drop-shadow-[0_0_6px_rgba(0,0,0,0.7)] font-[Inter,sans-serif]">
               {descriptionText}
             </p>
          )}
        </div>
      </section>

      {/* --- GRILLA DE PRODUCTOS (Estilo Neon) --- */}
      <section className="pt-16 pb-32 px-4 sm:px-6 lg:px-8 bg-[#101010]">
        {products && products.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-6 sm:gap-8 lg:gap-6 max-w-7xl mx-auto">
            {products.map((product) => (
              <article key={product.id} className="group bg-[#141414] rounded-lg overflow-hidden transition-all hover:ring-2 hover:ring-[#00FFFF] cursor-default flex flex-col">
                <Link href={`/${params.countryCode}/products/${product.handle}`} className="flex-1 flex flex-col">
                  <div className="aspect-square relative w-full overflow-hidden bg-[#1a1a1a]">
                    {product.thumbnail && (
                      <img 
                        src={product.thumbnail} 
                        alt={product.title} 
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
                      />
                    )}
                    {/* Badge Enigma (Ejemplo) */}
                    {params.handle === 'enigma' && (
                      <div className="absolute top-3 right-3 z-10 h-16 w-16 rounded-full bg-black/50 p-1.5 backdrop-blur-sm">
                         <img src="/img/logo-enigma-blanco.png" alt="Logo" className="h-full w-full object-contain" />
                      </div>
                    )}
                  </div>
                  
                  <div className="p-4 lg:p-6">
                    <h3 className="font-bold text-white mb-2 text-lg sm:text-xl font-[Poppins,sans-serif]">
                      {product.title}
                    </h3>
                    <p className="text-gray-400 text-base font-[Inter,sans-serif]">
                      Consultar Precio
                    </p>
                  </div>
                </Link>

                <div className="px-4 pb-4 lg:px-6 lg:pb-6">
                  <Link 
                    href={`/${params.countryCode}/products/${product.handle}`}
                    className="block w-full text-center rounded-full bg-[#00FFFF] px-6 py-3 text-[#101010] font-[Inter,sans-serif] font-semibold uppercase tracking-wide transition-opacity hover:opacity-90"
                  >
                    VER DETALLE
                  </Link>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="text-center text-gray-500 py-20 font-inter">
            No hay productos cargados en esta colección.
          </div>
        )}
      </section>

      {/* --- NEWSLETTER --- */}
      <section className="bg-[#101010] text-white border-t border-gray-800">
        <div className="px-6 py-16 md:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="mb-4 font-[Poppins,sans-serif] text-4xl font-bold">Mantenete en Frecuencia</h2>
            <p className="mb-8 font-[Inter,sans-serif] text-gray-300">Suscribite para recibir novedades exclusivas.</p>
            <form className="mx-auto flex max-w-md flex-col gap-3 sm:flex-row">
              <input type="email" placeholder="Tu Email" className="flex-1 rounded-lg border border-gray-700 bg-[#1a1a1a] px-4 py-3 text-white focus:outline-none focus:border-[#00FFFF]" />
              <button type="button" className="rounded-lg bg-[#00FFFF] px-8 py-3 text-[#101010] font-bold">Suscribirse</button>
            </form>
          </div>
        </div>
      </section>
    </div>
  )
}