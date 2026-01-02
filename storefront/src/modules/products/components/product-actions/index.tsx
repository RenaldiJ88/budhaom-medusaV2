"use client"

import { isEqual } from "lodash"
import { useParams, useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"

import OptionSelect from "@modules/products/components/product-actions/option-select"
import ProductPrice from "../product-price"
import { addToCart } from "@lib/data/cart"
import { HttpTypes } from "@medusajs/types"
import { Button, clx } from "@medusajs/ui"
import MobileActions from "./mobile-actions"

type ProductActionsProps = {
  product: HttpTypes.StoreProduct
  region: HttpTypes.StoreRegion
  disabled?: boolean
}

const optionsAsKeymap = (variantOptions: any) => {
  return variantOptions?.reduce((acc: Record<string, string | undefined>, varopt: any) => {
    if (varopt.option && varopt.value !== null && varopt.value !== undefined) {
      acc[varopt.option.title] = varopt.value
    }
    return acc
  }, {})
}

export default function ProductActions({
  product,
  region,
  disabled,
}: ProductActionsProps) {
  const [options, setOptions] = useState<Record<string, string | undefined>>({})
  const [isAdding, setIsAdding] = useState(false)
  const [quantity, setQuantity] = useState(1)
  const countryCode = useParams().countryCode as string
  const router = useRouter()

  useEffect(() => {
    if (product.variants?.length === 1) {
      const variantOptions = optionsAsKeymap(product.variants[0].options)
      setOptions(variantOptions ?? {})
    }
  }, [product.variants])

  const selectedVariant = useMemo(() => {
    if (!product.variants || product.variants.length === 0) {
      return
    }
    return product.variants.find((v) => {
      const variantOptions = optionsAsKeymap(v.options)
      return isEqual(variantOptions, options)
    })
  }, [product.variants, options])

  const setOptionValue = (title: string, value: string) => {
    setOptions((prev) => ({
      ...prev,
      [title]: value,
    }))
  }

  const inStock = useMemo(() => {
    if (selectedVariant && !selectedVariant.manage_inventory) return true
    if (selectedVariant?.allow_backorder) return true
    if (selectedVariant?.manage_inventory && (selectedVariant?.inventory_quantity || 0) > 0) return true
    return false
  }, [selectedVariant])

  const handleAddToCart = async () => {
    if (!selectedVariant?.id) return null
    setIsAdding(true)
    await addToCart({
      variantId: selectedVariant.id,
      quantity: quantity,
      countryCode,
    })
    router.refresh()
    setIsAdding(false)
  }

  const increaseQuantity = () => setQuantity((prev) => prev + 1)
  const decreaseQuantity = () => setQuantity((prev) => (prev > 1 ? prev - 1 : 1))

  return (
    <div className="flex flex-col gap-y-6">
      
      {/* OPCIONES */}
      {(product.variants?.length ?? 0) > 1 && (
        <div className="flex flex-col gap-y-4">
          {(product.options || []).map((option) => (
            <div key={option.id}>
              <OptionSelect
                option={option}
                current={options[option.title ?? ""]}
                updateOption={setOptionValue}
                title={option.title ?? ""}
                disabled={!!disabled || isAdding}
              />
            </div>
          ))}
        </div>
      )}

      {/* PRECIO */}
      <ProductPrice product={product} variant={selectedVariant} />

      {/* SELECTOR DE CANTIDAD */}
      <div className="mb-2">
        <label className="block text-white mb-3 text-sm font-semibold font-inter">CANTIDAD</label>
        <div className="flex items-center gap-3">
          <button 
            onClick={decreaseQuantity}
            type="button" 
            className="w-12 h-12 flex items-center justify-center rounded border border-gray-600 bg-[#1a1a1a] text-white text-xl font-semibold hover:border-gray-500 transition-colors focus:outline-none focus:ring-2 focus:ring-[#00FFFF]"
          >
            &minus;
          </button>
          <div className="w-16 md:w-20 h-12 flex items-center justify-center rounded border border-gray-600 bg-[#1a1a1a] text-white font-semibold font-inter">
            {quantity}
          </div>
          <button 
            onClick={increaseQuantity}
            type="button" 
            className="w-12 h-12 flex items-center justify-center rounded border border-gray-600 bg-[#1a1a1a] text-white text-xl font-semibold hover:border-gray-500 transition-colors focus:outline-none focus:ring-2 focus:ring-[#00FFFF]"
          >
            +
          </button>
        </div>
      </div>

      {/* BOTÓN DE COMPRA */}
      <Button
        onClick={handleAddToCart}
        disabled={!inStock || !selectedVariant || !!disabled || isAdding}
        isLoading={isAdding}
        className={clx(
          "w-full md:w-auto font-bold uppercase px-8 py-4 rounded mb-2 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#00FFFF] font-poppins h-14 text-base tracking-wider border-none",
          !inStock || !selectedVariant
            ? "bg-gray-700 text-gray-400 cursor-not-allowed"
            : "!bg-[#00FFFF] !text-[#101010] hover:!bg-[#00FFFF]/90 hover:shadow-[0_0_15px_rgba(0,255,255,0.4)]"
        )}
      >
        {!selectedVariant
          ? "Seleccionar Variante"
          : !inStock
          ? "Sin Stock"
          : "AÑADIR AL CARRITO"}
      </Button>

      <MobileActions
        product={product}
        variant={selectedVariant}
        options={options}
        updateOptions={setOptionValue}
        inStock={inStock}
        handleAddToCart={handleAddToCart}
        isAdding={isAdding}
        show={false}
        optionsDisabled={!!disabled || isAdding}
      />
    </div>
  )
}