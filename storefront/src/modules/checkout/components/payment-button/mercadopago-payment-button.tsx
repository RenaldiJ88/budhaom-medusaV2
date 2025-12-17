"use client"

import { Button } from "@medusajs/ui"
import { useState, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { placeOrder } from "@lib/data/cart" // Importamos la misma función que usan Stripe/Manual
import Spinner from "@modules/common/icons/spinner"

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
  
  // Hooks para leer la URL y redirigir
  const searchParams = useSearchParams()
  const router = useRouter()
  
  // Leemos el estado del pago desde la URL (lo que manda MP al volver)
  const paymentStatus = searchParams.get("payment_status")

  // --- 1. LÓGICA DE RETORNO (¡LO QUE FALTABA!) ---
  useEffect(() => {
    // Si Mercado Pago nos devuelve con "success", cerramos la orden automáticamente
    if (paymentStatus === "success" && !submitting) {
      console.log("✅ [FRONTEND] Pago exitoso detectado en URL via Mercado Pago.")
      handleOrderCompletion()
    } 
    // Si falló, mostramos error
    else if (paymentStatus === "failure") {
      setErrorMessage("El pago fue rechazado por Mercado Pago. Intenta nuevamente.")
    }
  }, [paymentStatus])

  // Función para cerrar la orden en Medusa
  const handleOrderCompletion = async () => {
    setSubmitting(true)
    setErrorMessage(null)

    try {
      // Esta función llama a Medusa: "Cierra el carrito, crea la orden"
      await placeOrder()
      // placeOrder usualmente redirige a /order/confirmed internamente
    } catch (err: any) {
      console.error("❌ [FRONTEND] Error al cerrar la orden:", err)
      setErrorMessage(err.message || "Error al procesar la orden en Medusa.")
      setSubmitting(false)
    }
  }

  // --- 2. LÓGICA DE IDA (IR A PAGAR) ---
  const handlePayment = () => {
    setSubmitting(true)
    setErrorMessage(null)

    // Buscamos el link generado por el backend
    const paymentLink = session?.data?.init_point || session?.data?.sandbox_init_point

    if (paymentLink) {
      console.log("🚀 [FRONTEND] Redirigiendo a Mercado Pago:", paymentLink)
      window.location.href = paymentLink
    } else {
      console.error("❌ [FRONTEND] No se encontró link de pago en la sesión.")
      setErrorMessage("Error de conexión con Mercado Pago. Intenta recargar.")
      setSubmitting(false)
    }
  }

  // Renderizado
  return (
    <div className="flex flex-col gap-2">
      <Button
        disabled={submitting || notReady} 
        onClick={handlePayment}
        size="large"
        className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white font-bold"
      >
        {submitting ? (
          <div className="flex items-center gap-2">
             <Spinner />
             {paymentStatus === "success" ? "Finalizando compra..." : "Procesando..."}
          </div>
        ) : (
          "PAGAR CON MERCADO PAGO"
        )}
      </Button>

      {/* Mensajes de error o estado */}
      {errorMessage && (
        <div className="text-red-500 text-sm mt-2 text-center bg-red-50 p-2 rounded">
          {errorMessage}
        </div>
      )}
      
      {/* Aviso de debug si notReady es true (opcional, puedes quitarlo en prod) */}
      {notReady && (
        <p className="text-xs text-orange-500 text-center">
          Faltan datos de envío para habilitar el pago real.
        </p>
      )}
    </div>
  )
}