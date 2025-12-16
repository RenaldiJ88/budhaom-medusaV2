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
  
  // 🔍 LOGS PARA DEPURAR (Opcional)
  // console.log("🎨 [FRONTEND] Link encontrado:", session?.data?.init_point)

  const handlePayment = async () => {
    setSubmitting(true)
    setErrorMessage(null)

    try {
      if (!cart?.id) {
        throw new Error("Cart ID no disponible - Por favor recarga la página")
      }

      // ============================================================
      // PASO 1: Verificar y completar shipping_address si falta
      // ============================================================
      // Si el usuario eligió "Retiro" a veces no hay country_code
      if (!cart.shipping_address?.country_code) {
        console.log("🌎 [MP-BUTTON] Agregando dirección 'pickup' por defecto...")
        
        try {
          await sdk.store.cart.update(cart.id, {
            shipping_address: {
              country_code: "ar", // Argentina por defecto
              first_name: "Retiro",
              last_name: "Local",
              address_1: "Punto de Retiro",
              city: "Buenos Aires",
              postal_code: "1000"
            },
          })
          console.log("✅ [MP-BUTTON] Dirección actualizada")
        } catch (updateError: any) {
          console.error("❌ [MP-BUTTON] Error address:", updateError.message)
          // No lanzamos error para intentar seguir si es posible
        }
      }

      // ============================================================
      // PASO 2: Verificar y agregar shipping_method si falta
      // ============================================================
      const hasShippingMethods = 
        Array.isArray(cart.shipping_methods) && cart.shipping_methods.length > 0

      if (!hasShippingMethods) {
        console.log("🚚 [MP-BUTTON] Buscando método de envío por defecto...")
        
        try {
          // Listar opciones
          const optionsRes = await sdk.store.fulfillment.listCartOptions({ cart_id: cart.id })
          
          const shippingOptions = 
            (optionsRes as any)?.shipping_options ||
            (optionsRes as any)?.fulfillment_options ||
            (optionsRes as any)?.options ||
            []

          if (Array.isArray(shippingOptions) && shippingOptions.length > 0) {
            // Usar la primera opción (usualmente Retiro o Standard)
            const defaultOption = shippingOptions[0]
            
            await sdk.store.cart.addShippingMethod(cart.id, {
              option_id: defaultOption.id,
            })
            console.log("✅ [MP-BUTTON] Método de envío agregado:", defaultOption.id)
          } else {
            console.warn("⚠️ [MP-BUTTON] No se encontraron métodos de envío.")
          }
        } catch (shippingError: any) {
          console.error("❌ [MP-BUTTON] Error shipping:", shippingError.message)
        }
      }

      // ============================================================
      // PASO 3: Redirigir a MercadoPago
      // ============================================================
      const paymentLink = session?.data?.init_point || session?.data?.sandbox_init_point

      if (paymentLink) {
        console.log("🚀 [MP-BUTTON] Redirigiendo a:", paymentLink)
        window.location.href = paymentLink
      } else {
        throw new Error("El link de pago no está listo. Intenta de nuevo en unos segundos.")
      }
    } catch (error: any) {
      console.error("❌ [MP-BUTTON] Error final:", error)
      setErrorMessage(error.message || "Error al iniciar el pago.")
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
        style={{ backgroundColor: "#009ee3", color: "white" }} // Azul MercadoPago
      >
        {submitting ? "Procesando..." : "PAGAR CON MERCADO PAGO"}
      </Button>

      {errorMessage && (
        <p className="text-xs text-red-500 text-center mt-2">
          {errorMessage}
        </p>
      )}
    </div>
  )
}