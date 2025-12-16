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
      // Verificar si falta country_code en shipping_address
      if (!cart.shipping_address?.country_code) {
        console.log("🌎 [MP-BUTTON] Cart sin shipping_address.country_code. Agregando dirección por defecto...")
        
        try {
          await sdk.store.cart.update(cart.id, {
            shipping_address: {
              country_code: "ar", // Argentina por defecto
              first_name: "Guest",
              last_name: "Pickup",
              address_1: "Pickup",
            },
          })
          console.log("✅ [MP-BUTTON] shipping_address actualizado con country_code (AR)")
        } catch (updateError: any) {
          console.error("❌ [MP-BUTTON] Error crítico al actualizar shipping_address:", updateError.message)
          throw new Error("No se pudo completar la dirección de envío. Por favor, intenta nuevamente.")
        }
      }

      // ============================================================
      // PASO 2: Verificar y agregar shipping_method si falta
      // ============================================================
      // Verificar si shipping_methods está vacío
      const hasShippingMethods = 
        Array.isArray(cart.shipping_methods) && cart.shipping_methods.length > 0

      if (!hasShippingMethods) {
        console.log("🚚 [MP-BUTTON] Cart sin shipping_methods. Buscando opciones...")
        
        try {
          // Listar opciones de envío disponibles
          const optionsRes = await sdk.store.fulfillment.listCartOptions({ cart_id: cart.id })
          
          const shippingOptions = 
            (optionsRes as any)?.shipping_options ||
            (optionsRes as any)?.fulfillment_options ||
            (optionsRes as any)?.options ||
            []

          if (Array.isArray(shippingOptions) && shippingOptions.length > 0) {
            // Tomar la primera opción disponible
            const defaultOption = shippingOptions[0]
            console.log("📦 [MP-BUTTON] Agregando shipping_method por defecto:", defaultOption.id)
            
            // Agregar el método de envío al cart
            await sdk.store.cart.addShippingMethod(cart.id, {
              option_id: defaultOption.id,
            })
            console.log("✅ [MP-BUTTON] Shipping_method agregado correctamente")
          } else {
            console.warn("⚠️ [MP-BUTTON] No hay opciones de envío disponibles")
            throw new Error("No hay opciones de envío disponibles para este carrito.")
          }
        } catch (shippingError: any) {
          console.error("❌ [MP-BUTTON] Error crítico al agregar shipping_method:", shippingError.message)
          throw new Error("No se pudo agregar el método de envío. Por favor, intenta nuevamente.")
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