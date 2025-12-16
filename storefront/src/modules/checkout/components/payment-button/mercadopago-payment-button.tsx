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
  
  // 🔍 LOGS PARA DEPURAR EN EL NAVEGADOR
  // Abre la consola con F12 y mira esto:
  console.log("🎨 [FRONTEND] Estado notReady:", notReady)
  console.log("🎨 [FRONTEND] Datos de sesión:", session)
  console.log("🎨 [FRONTEND] Link encontrado:", session?.data?.init_point)

  const handlePayment = async () => {
    setSubmitting(true)
    setErrorMessage(null)

    try {
      if (!cart?.id) {
        throw new Error("Cart ID no disponible")
      }

      // ============================================================
      // PASO 1: Verificar y completar shipping_address si falta
      // ============================================================
      if (!cart.shipping_address || !cart.shipping_address.country_code) {
        console.log("🌎 [MP-BUTTON] Cart sin shipping_address. Agregando dirección por defecto...")
        
        try {
          await sdk.store.cart.update(cart.id, {
            shipping_address: {
              first_name: cart.shipping_address?.first_name || "Guest",
              last_name: cart.shipping_address?.last_name || "Pickup",
              address_1: cart.shipping_address?.address_1 || "Local Pickup",
              country_code: "ar", // Argentina por defecto
            },
          })
          console.log("✅ [MP-BUTTON] shipping_address actualizado con country_code (AR)")
        } catch (updateError: any) {
          console.warn("⚠️ [MP-BUTTON] Error al actualizar shipping_address:", updateError.message)
          // Continuamos de todas formas
        }
      }

      // ============================================================
      // PASO 2: Verificar y agregar shipping_method si falta
      // ============================================================
      const hasShippingMethods = 
        Array.isArray(cart.shipping_methods) && cart.shipping_methods.length > 0

      if (!hasShippingMethods) {
        console.log("🚚 [MP-BUTTON] Cart sin shipping_methods. Buscando opciones...")
        
        try {
          const optionsRes = await sdk.store.fulfillment.listCartOptions({ cart_id: cart.id })
          
          const shippingOptions = 
            (optionsRes as any)?.shipping_options ||
            (optionsRes as any)?.fulfillment_options ||
            (optionsRes as any)?.options ||
            []

          if (Array.isArray(shippingOptions) && shippingOptions.length > 0) {
            const defaultOption = shippingOptions[0]
            console.log("📦 [MP-BUTTON] Agregando shipping_method por defecto:", defaultOption.id)
            
            await sdk.store.cart.addShippingMethod(cart.id, {
              option_id: defaultOption.id,
            })
            console.log("✅ [MP-BUTTON] Shipping_method agregado correctamente")
          } else {
            console.warn("⚠️ [MP-BUTTON] No hay opciones de envío disponibles")
          }
        } catch (shippingError: any) {
          console.warn("⚠️ [MP-BUTTON] Error al agregar shipping_method:", shippingError.message)
          // Continuamos de todas formas - el webhook puede fallar pero al menos intentamos
        }
      }

      // ============================================================
      // PASO 3: Redirigir a MercadoPago
      // ============================================================
      const paymentLink = session?.data?.init_point || session?.data?.sandbox_init_point

      if (paymentLink) {
        console.log("🚀 [MP-BUTTON] Redirigiendo a MercadoPago:", paymentLink)
        window.location.href = paymentLink
      } else {
        throw new Error("El link de pago no está disponible. Por favor, recarga la página.")
      }
    } catch (error: any) {
      console.error("❌ [MP-BUTTON] Error al procesar pago:", error)
      setErrorMessage(error.message || "Error al procesar el pago. Por favor, intenta nuevamente.")
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
        className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white"
      >
        {submitting ? "Preparando pago..." : "PAGAR CON MERCADO PAGO"}
      </Button>

      {errorMessage && (
        <p className="text-xs text-red-500 text-center mt-2">
          {errorMessage}
        </p>
      )}

      {notReady && !errorMessage && (
        <p className="text-xs text-orange-500 text-center">
          Completando datos de envío automáticamente...
        </p>
      )}
    </div>
  )
}