"use client"

import { Button } from "@medusajs/ui"
import { useState } from "react"
import { sdk } from "@lib/config"

export const MercadoPagoPaymentButton = ({
  notReady,
  cart,
  session
}: {
  notReady: boolean
  cart: any
  session: any
}) => {
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handlePayment = async () => {
    setSubmitting(true)
    setErrorMessage(null)

    try {
      if (!cart?.id) throw new Error("Cart ID no disponible")

      console.log("🛒 [MP-BUTTON] Iniciando proceso de pago. Cart ID:", cart.id)

      // 1. INYECTAR DIRECCIÓN (Si falta)
      // Si es retiro, a veces shipping_address es null o le falta el country_code
      if (!cart.shipping_address || !cart.shipping_address.country_code) {
        console.log("🌎 [MP-BUTTON] Falta dirección/país. Inyectando AR...")
        try {
          await sdk.store.cart.update(cart.id, {
            shipping_address: {
              country_code: "ar", // IMPORTANTE: Esto habilita las Shipping Options de Argentina
              first_name: "Cliente",
              last_name: "Retiro",
              address_1: "Punto de Retiro",
              city: "Buenos Aires",
              postal_code: "1000"
            },
          })
          console.log("✅ [MP-BUTTON] Dirección inyectada.")
        } catch (e: any) {
          console.warn("⚠️ [MP-BUTTON] No se pudo inyectar dirección (puede que ya exista):", e.message)
        }
      }

      // 2. INYECTAR MÉTODO DE ENVÍO (Si falta)
      const hasShippingMethods = Array.isArray(cart.shipping_methods) && cart.shipping_methods.length > 0
      
      if (!hasShippingMethods) {
        console.log("🚚 [MP-BUTTON] Falta método de envío. Buscando opciones...")
        try {
          // Buscamos opciones (ahora que tenemos country_code, deberían aparecer)
          const optionsRes = await sdk.store.fulfillment.listCartOptions({ cart_id: cart.id })
          
          const options = (optionsRes as any)?.shipping_options || []
          
          if (options.length > 0) {
            const firstOption = options[0]
            console.log(`📦 [MP-BUTTON] Asignando opción: ${firstOption.name}`)
            
            await sdk.store.cart.addShippingMethod(cart.id, { option_id: firstOption.id })
            console.log("✅ [MP-BUTTON] Envío asignado.")
          } else {
             // Si no hay opciones, seguimos igual para intentar que el webhook lo resuelva
             console.warn("⚠️ [MP-BUTTON] No se encontraron opciones de envío en Medusa Admin.")
          }
        } catch (e: any) {
           console.error("❌ [MP-BUTTON] Error al asignar envío:", e.message)
        }
      }

      // 3. REDIRECT
      const paymentLink = session?.data?.init_point || session?.data?.sandbox_init_point
      if (paymentLink) {
        console.log("🚀 [MP-BUTTON] Redirigiendo a:", paymentLink)
        window.location.href = paymentLink
      } else {
        throw new Error("No se encontró el link de pago.")
      }

    } catch (error: any) {
      console.error("❌ [MP-BUTTON] Error Fatal:", error)
      setErrorMessage(error.message)
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        disabled={submitting || !session?.data?.init_point} 
        onClick={handlePayment}
        size="large"
        isLoading={submitting}
        className="w-full mt-4"
        style={{ backgroundColor: "#009ee3", color: "white" }}
      >
        {submitting ? "Procesando..." : "PAGAR CON MERCADO PAGO"}
      </Button>
      {errorMessage && (
        <p className="text-xs text-red-500 text-center mt-2">{errorMessage}</p>
      )}
    </div>
  )
}