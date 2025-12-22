import { Metadata } from "next"
import { notFound } from "next/navigation"
import Link from "next/link" // <--- Agregamos Link para botones

import Wrapper from "@modules/checkout/components/payment-wrapper"
import CheckoutForm from "@modules/checkout/templates/checkout-form"
import CheckoutSummary from "@modules/checkout/templates/checkout-summary"
import { enrichLineItems, retrieveCart } from "@lib/data/cart"
import { HttpTypes } from "@medusajs/types"
import { getCustomer } from "@lib/data/customer"

export const metadata: Metadata = {
  title: "Checkout",
}

const fetchCart = async () => {
  const cart = await retrieveCart()
  // NOTA: Quitamos el notFound() de aquí para manejarlo en el componente principal
  // si no, no podemos interceptar el éxito.
  if (!cart) {
    return null
  }

  if (cart?.items?.length) {
    const enrichedItems = await enrichLineItems(cart?.items, cart?.region_id!)
    cart.items = enrichedItems as HttpTypes.StoreCartLineItem[]
  }

  return cart
}

// 1. Definimos los tipos de las Props para leer la URL
type Props = {
  params: { countryCode: string }
  searchParams: { [key: string]: string | string[] | undefined }
}

export default async function Checkout({ params, searchParams }: Props) {
  // 2. Intentamos buscar el carrito
  const cart = await fetchCart()

  // --- 🔥 INTERCEPCIÓN DE ÉXITO (NUEVO) 🔥 ---
  // Si NO hay carrito (porque ya se hizo orden) PERO MercadoPago dice "approved"...
  // ¡Mostramos el cartel de fiesta! 🎉
  if (!cart && searchParams?.payment_status === 'approved') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-y-4 text-center px-4 py-12">
        <div className="bg-green-100 p-6 rounded-full">
            {/* Ícono de Check Verde */}
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-12 h-12 text-green-600">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        </div>
        
        <h1 className="text-3xl font-bold text-gray-900">
          ¡Ya es tuya!
        </h1>
        
        <p className="text-lg text-gray-600 max-w-md">
          El pago fue confirmado correctamente. Tu orden ya está procesada.
        </p>

        <div className="mt-6">
          <Link 
            href={`/${params.countryCode}/account/orders`}
            className="inline-block bg-black text-white px-8 py-3 text-sm font-medium uppercase tracking-wide hover:bg-gray-800 transition-colors"
          >
            VER MIS PEDIDOS
          </Link>
        </div>
        
        <Link 
          href={`/${params.countryCode}`} 
          className="text-sm text-blue-600 hover:underline mt-4"
        >
          Volver al inicio
        </Link>
      </div>
    )
  }
  // -----------------------------------------------------

  // 3. Si no hay carrito y NO es un éxito de pago, entonces sí es un 404 real.
  if (!cart) {
    return notFound()
  }

  const customer = await getCustomer()

  return (
    <div className="grid grid-cols-1 small:grid-cols-[1fr_416px] content-container gap-x-40 py-12">
      <Wrapper cart={cart}>
        <CheckoutForm cart={cart} customer={customer} />
      </Wrapper>
      <CheckoutSummary cart={cart} />
    </div>
  )
}