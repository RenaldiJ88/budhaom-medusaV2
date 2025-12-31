"use client"

import { Button, clx } from "@medusajs/ui"
import React, { useMemo } from "react"

import useToggleState from "@lib/hooks/use-toggle-state"
import ChevronDown from "@modules/common/icons/chevron-down"
import X from "@modules/common/icons/x"

import { getProductPrice } from "@lib/util/get-product-price"
import OptionSelect from "./option-select"
import { HttpTypes } from "@medusajs/types"

// ELIMINAMOS @headlessui/react

type MobileActionsProps = {
  product: HttpTypes.StoreProduct
  variant?: HttpTypes.StoreProductVariant
  options: Record<string, string | undefined>
  updateOptions: (title: string, value: string) => void
  inStock?: boolean
  handleAddToCart: () => void
  isAdding?: boolean
  show: boolean
  optionsDisabled: boolean
}

const MobileActions: React.FC<MobileActionsProps> = ({
  product,
  variant,
  options,
  updateOptions,
  inStock,
  handleAddToCart,
  isAdding,
  show,
  optionsDisabled,
}) => {
  const { state, open, close } = useToggleState()

  const price = getProductPrice({
    product: product,
    variantId: variant?.id,
  })

  const selectedPrice = useMemo(() => {
    if (!price) {
      return null
    }
    const { variantPrice, cheapestPrice } = price

    return variantPrice || cheapestPrice || null
  }, [price])

  return (
    <>
      {/* BARRA INFERIOR FLOTANTE (CSS PURO) */}
      <div
        className={clx("lg:hidden inset-x-0 bottom-0 fixed z-50 transition-all duration-300 transform", {
          "translate-y-0 opacity-100": show,
          "translate-y-full opacity-0 pointer-events-none": !show,
        })}
      >
        <div
          className="bg-white flex flex-col gap-y-3 justify-center items-center text-large-regular p-4 h-full w-full border-t border-gray-200 shadow-lg"
          data-testid="mobile-actions"
        >
          <div className="flex items-center gap-x-2">
            <span data-testid="mobile-title" className="font-semibold">{product.title}</span>
            <span>—</span>
            {selectedPrice ? (
              <div className="flex items-end gap-x-2 text-ui-fg-base">
                {selectedPrice.price_type === "sale" && (
                  <p>
                    <span className="line-through text-small-regular text-gray-500">
                      {selectedPrice.original_price}
                    </span>
                  </p>
                )}
                <span
                  className={clx({
                    "text-red-600": selectedPrice.price_type === "sale",
                  })}
                >
                  {selectedPrice.calculated_price}
                </span>
              </div>
            ) : (
              <div></div>
            )}
          </div>
          <div className="grid grid-cols-2 w-full gap-x-4">
            <Button
              onClick={open}
              variant="secondary"
              className="w-full"
              data-testid="mobile-actions-button"
            >
              <div className="flex items-center justify-between w-full">
                <span className="truncate">
                  {variant
                    ? Object.values(options).join(" / ")
                    : "Select Options"}
                </span>
                <ChevronDown />
              </div>
            </Button>
            <Button
              onClick={handleAddToCart}
              disabled={!inStock || !variant}
              className="w-full bg-black text-white"
              isLoading={isAdding}
              data-testid="mobile-cart-button"
            >
              {!variant
                ? "Select variant"
                : !inStock
                ? "Out of stock"
                : "Add to cart"}
            </Button>
          </div>
        </div>
      </div>

      {/* MODAL DE OPCIONES (RENDERIZADO CONDICIONAL SIMPLE) */}
      {state && (
        <div className="fixed inset-0 z-[75] isolate">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-gray-700 bg-opacity-75 backdrop-blur-sm transition-opacity" 
            onClick={close}
          />

          {/* Panel */}
          <div className="fixed bottom-0 inset-x-0 z-[80]">
            <div className="flex min-h-full h-full items-center justify-center text-center">
                <div
                  className="w-full h-full transform overflow-hidden text-left flex flex-col gap-y-3 bg-white pb-6 pt-4 rounded-t-xl shadow-2xl animate-in slide-in-from-bottom duration-300"
                  data-testid="mobile-actions-modal"
                >
                  <div className="w-full flex justify-end pr-6">
                    <button
                      onClick={close}
                      className="bg-white w-12 h-12 rounded-full text-black border border-gray-100 shadow flex justify-center items-center"
                      data-testid="close-modal-button"
                    >
                      <X />
                    </button>
                  </div>
                  <div className="px-6 py-4">
                    {(product.variants?.length ?? 0) > 1 && (
                      <div className="flex flex-col gap-y-6">
                        {(product.options || []).map((option) => {
                          return (
                            <div key={option.id}>
                              <OptionSelect
                                option={option}
                                current={options[option.title ?? ""]}
                                updateOption={updateOptions}
                                title={option.title ?? ""}
                                disabled={optionsDisabled}
                              />
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default MobileActions