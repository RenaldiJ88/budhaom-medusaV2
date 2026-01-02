"use client"

import { Button, Heading } from "@medusajs/ui"

import CartTotals from "@modules/common/components/cart-totals"
import Divider from "@modules/common/components/divider"
import DiscountCode from "@modules/checkout/components/discount-code"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import { HttpTypes } from "@medusajs/types"

type SummaryProps = {
  cart: HttpTypes.StoreCart & {
    promotions: HttpTypes.StorePromotion[]
  }
}

function getCheckoutStep(cart: HttpTypes.StoreCart) {
  if (!cart?.shipping_address?.address_1 || !cart.email) {
    return "address"
  } else if (cart?.shipping_methods?.length === 0) {
    return "delivery"
  } else {
    return "payment"
  }
}

const Summary = ({ cart }: SummaryProps) => {
  const step = getCheckoutStep(cart)

  return (
    // CAMBIO: Estilo tarjeta oscura (bg-[#141414]) con bordes sutiles
    <div className="flex flex-col gap-y-4 bg-[#141414] p-6 rounded-xl border border-white/10 shadow-lg">
      <Heading level="h2" className="text-[2rem] leading-[2.75rem] text-white font-[Poppins,sans-serif]">
        Resumen
      </Heading>
      
      <DiscountCode cart={cart} />
      
      {/* CAMBIO: Divider más oscuro para que no brille tanto */}
      <Divider className="bg-gray-800" />
      
      <CartTotals totals={cart} />
      
      <LocalizedClientLink
        href={"/checkout?step=" + step}
        data-testid="checkout-button"
      >
        {/* CAMBIO: Botón Cyan (#00FFFF) con texto negro y hover */}
        <Button 
          className="w-full h-12 bg-[#00FFFF] text-[#101010] font-bold uppercase tracking-wider hover:bg-[#00FFFF]/90 hover:scale-[1.02] transition-all rounded-lg border-none"
        >
          Iniciar Compra
        </Button>
      </LocalizedClientLink>
    </div>
  )
}

export default Summary