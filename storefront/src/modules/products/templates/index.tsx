"use client"

import React, { Suspense, useState, useEffect } from "react"
import { notFound } from "next/navigation"
import { HttpTypes } from "@medusajs/types"

// Componentes lógicos necesarios de Medusa
import RelatedProducts from "@modules/products/components/related-products"
import SkeletonRelatedProducts from "@modules/skeletons/templates/skeleton-related-products"
import ProductActionsWrapper from "./product-actions-wrapper" // 👈 CLAVE: Mantiene la lógica del carrito

type ProductTemplateProps = {
  product: HttpTypes.StoreProduct
  region: HttpTypes.StoreRegion
  countryCode: string
}

const ProductTemplate: React.FC<ProductTemplateProps> = ({
  product,
  region,
  countryCode,
}) => {
  // Validación básica
  if (!product || !product.id) {
    return notFound()
  }

  // --- LÓGICA VISUAL (Tu Galería Personalizada) ---
  const [selectedImage, setSelectedImage] = useState(product.thumbnail)

  useEffect(() => {
    if (product.images && product.images.length > 0) {
      setSelectedImage(product.images[0].url)
    } else {
      setSelectedImage(product.thumbnail)
    }
  }, [product])

  return (
    <>
      {/* Usamos tu contenedor 'main' oscuro en lugar del default de Medusa */}
      <main 
        className="relative z-10 pt-20 pb-16 md:pt-24 md:pb-24 bg-[#101010] text-white min-h-screen"
        data-testid="product-container"
      >
        <section className="container mx-auto px-4 md:px-6 lg:px-8 max-w-7xl">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 md:gap-12 lg:gap-16">
            
            {/* ========================================== */}
            {/* COLUMNA IZQUIERDA: GALERÍA (Tu Diseño) */}
            {/* ========================================== */}
            <div className="flex flex-col gap-4">
              {/* Imagen Principal */}
              <div className="w-full aspect-square bg-[#1a1a1a] rounded-lg flex items-center justify-center overflow-hidden border border-white/5 relative">
                 {selectedImage && (
                  <img 
                    src={selectedImage} 
                    alt={product.title} 
                    className="w-full h-full object-cover transition-opacity duration-300"
                  />
                )}
              </div>
              
              {/* Thumbnails */}
              {product.images && product.images.length > 1 && (
                <div className="flex gap-3 md:gap-4 overflow-x-auto pb-2 no-scrollbar">
                  {product.images.map((image) => (
                    <button 
                      key={image.id}
                      type="button" 
                      onClick={() => setSelectedImage(image.url)}
                      className={`flex-shrink-0 w-20 h-20 md:w-24 md:h-24 rounded-lg overflow-hidden border-2 bg-[#1a1a1a] transition-all 
                        ${selectedImage === image.url ? 'border-[#00FFFF]' : 'border-transparent hover:border-gray-600'}`}
                    >
                      <img src={image.url} alt="Vista" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ========================================== */}
            {/* COLUMNA DERECHA: INFO + LÓGICA (Tu Diseño + Medusa) */}
            {/* ========================================== */}
            <div className="flex flex-col justify-center">
              
              {/* Header: Título + Logo Enigma */}
              <div className="flex items-start justify-between mb-4">
                <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold text-white font-[Poppins,sans-serif] uppercase leading-tight">
                  {product.title}
                </h1>
                {/* Lógica para mostrar logo si es colección 'enigma' */}
                {product.collection?.handle === 'enigma' && (
                  <div className="flex-shrink-0 ml-4" title="Producto Energizado (Enigma)">
                    <img src="/img/logo-enigma-blanco.png" alt="Logo Enigma" className="h-16 w-16 object-contain" />
                  </div>
                )}
              </div>

              {/* Badge Tecnología */}
              <div className="inline-block bg-[#00FFFF] text-[#101010] px-4 py-1.5 rounded mb-6 self-start">
                <span className="text-xs md:text-sm font-semibold uppercase font-[Inter,sans-serif]">
                  POTENCIADA CON TECNOLOGÍA CUÁNTICA
                </span>
              </div>

              {/* Descripción */}
              <p className="text-base md:text-lg text-gray-300 leading-relaxed mb-8 font-[Inter,sans-serif]">
                {product.description}
              </p>

              {/* 👇 AQUÍ ESTÁ LA MAGIA: El Wrapper de Medusa dentro de tu caja de diseño 👇 */}
              <div className="mb-8 p-6 rounded-xl border border-white/10 bg-white/5">
                <Suspense
                  fallback={
                    <div className="w-full h-12 bg-gray-800 animate-pulse rounded" />
                  }
                >
                  {/* Este componente maneja Precio + Variantes + Botón Comprar + Stock */}
                  <ProductActionsWrapper id={product.id} region={region} />
                </Suspense>
              </div>

              {/* Garantía Visual */}
              <div className="flex items-center gap-3 text-sm text-gray-300 mt-4">
                <svg className="w-8 h-8 text-[#00FFFF]" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                   <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"></path>
                </svg>
                <span className="font-[Inter,sans-serif] text-base">7 Años de Garantía en Energización</span>
              </div>

            </div>
          </div>
        </section>

        {/* --- PRODUCTOS RELACIONADOS (Footer) --- */}
        <div 
          className="content-container my-16 small:my-32 border-t border-gray-800 pt-16"
          data-testid="related-products-container"
        >
          <Suspense fallback={<SkeletonRelatedProducts />}>
            <RelatedProducts product={product} countryCode={countryCode} />
          </Suspense>
        </div>
      </main>
    </>
  )
}

export default ProductTemplate