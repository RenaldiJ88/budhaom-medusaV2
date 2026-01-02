import { clx } from "@medusajs/ui"
import { getProductPrice } from "@lib/util/get-product-price"
import { HttpTypes } from "@medusajs/types"

export default function ProductPrice({
  product,
  variant,
}: {
  product: HttpTypes.StoreProduct
  variant?: HttpTypes.StoreProductVariant
}) {
  const { cheapestPrice, variantPrice } = getProductPrice({
    product,
    variantId: variant?.id,
  })

  const selectedPrice = variant ? variantPrice : cheapestPrice

  if (!selectedPrice) {
    return <div className="block w-32 h-9 bg-gray-800 animate-pulse rounded" />
  }

  return (
    <div className="flex flex-col text-white font-[Poppins,sans-serif]">
      <span
        className={clx("text-3xl md:text-4xl font-bold tracking-tight", {
          "text-[#00FFFF]": selectedPrice.price_type === "sale",
          "text-white": selectedPrice.price_type !== "sale",
        })}
      >
        {/* Eliminamos el texto "Desde" aquí */}
        <span
          data-testid="product-price"
          data-value={selectedPrice.calculated_price_number}
        >
          {selectedPrice.calculated_price}
        </span>
      </span>
      
      {selectedPrice.price_type === "sale" && (
        <div className="flex items-center gap-2 mt-1 font-[Inter,sans-serif]">
          <span className="text-gray-500 text-sm">Original: </span>
          <span
            className="line-through text-gray-500 text-sm"
            data-testid="original-product-price"
            data-value={selectedPrice.original_price_number}
          >
            {selectedPrice.original_price}
          </span>
          <span className="text-[#00FFFF] text-sm font-bold ml-1">
            -{selectedPrice.percentage_diff}% OFF
          </span>
        </div>
      )}
    </div>
  )
}