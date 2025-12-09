"use client"

import { Button } from "@medusajs/ui"
import { useState } from "react"
import { useRouter } from "next/navigation"

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
  const router = useRouter()

  const handlePayment = async () => {
    setSubmitting(true)
    setErrorMessage(null)

    try {
      // 1. Obtenemos la URL del backend desde las variables de entorno o usamos localhost por defecto
      const backendUrl = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"

      // 2. Llamamos DIRECTAMENTE al endpoint de Medusa para completar el carrito
      // Esto reemplaza a la función "placeOrder" que no encontrábamos
      const response = await fetch(`${backendUrl}/store/carts/${cart.id}/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Si tu proyecto usa Publishable API Keys, el navegador suele enviarlas automáticamente si están configuradas globalmente,
          // si te da error 401, avísame.
        },
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.message || "Error al completar la orden")
      }

      // 3. ÉXITO: Manejamos la redirección
      // Si la orden se creó (tipo "order"), vamos a la confirmación
      if (data.type === "order") {
        router.push(`/order/confirmed/${data.data.id}`)
      } 
      // Si el carrito sigue pendiente (tipo "cart"), puede que falte algo
      else if (data.type === "cart") {
         setErrorMessage("El carrito no se pudo completar. Intenta de nuevo.")
         setSubmitting(false)
      }

    } catch (err: any) {
      console.error(err)
      setErrorMessage(err.message || "Error de conexión")
      setSubmitting(false)
    }
  }

  return (
    <>
      <Button
        disabled={notReady || submitting}
        onClick={handlePayment}
        size="large"
        className="w-full mt-4"
      >
        {submitting ? (
          // Spinner manual (CSS) para no depender de librerías de iconos
          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          "Pagar con Mercado Pago"
        )}
      </Button>
      
      {errorMessage && (
        <div className="text-red-500 text-small-regular mt-2">
          {errorMessage}
        </div>
      )}
    </>
  )
}