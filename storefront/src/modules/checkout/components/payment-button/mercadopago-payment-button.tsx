"use client"

import { Button } from "@medusajs/ui"
import { useState, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { placeOrder } from "@lib/data/cart" 
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

  // --- 1. LÓGICA DE RETORNO (CUANDO VUELVE DE MP) ---
  useEffect(() => {
    // Si Mercado Pago nos devuelve con "success" (o approved en tu url), intentamos cerrar la orden
    // Nota: Tu URL dice payment_status=approved, así que chequeamos ambos por seguridad
    if ((paymentStatus === "success" || paymentStatus === "approved") && !submitting) {
      console.log("✅ [FRONTEND] Pago exitoso detectado en URL via Mercado Pago.")
      handleOrderCompletion()
    } 
    // Si falló
    else if (paymentStatus === "failure") {
      setErrorMessage("El pago fue rechazado por Mercado Pago. Intenta nuevamente.")
    }
  }, [paymentStatus])

  // Función para cerrar la orden en Medusa
  const handleOrderCompletion = async () => {
    setSubmitting(true)
    setErrorMessage(null)

    try {
      // Intentamos cerrar el carrito y crear la orden
      await placeOrder()
    } catch (err: any) {
      console.error("❌ [FRONTEND] Error al cerrar la orden:", err)
      
      const errorText = (err.message || "").toLowerCase();

      // --- MANEJO DE RACE CONDITION (Webhook vs Frontend) ---
      if (
        errorText.includes("completed") || 
        errorText.includes("found") || 
        errorText.includes("exist") || 
        errorText.includes("404") ||
        errorText.includes("409")
      ) {
         console.warn("⚠️ [FRONTEND] El Webhook ganó la carrera. Redirigiendo a órdenes...");
         router.push("/account/orders");
         return;
      }

      setErrorMessage(err.message || "Error al procesar la orden en Medusa.")
      setSubmitting(false)
    }
  }

  // --- 2. LÓGICA DE IDA (IR A PAGAR) - CORREGIDA PARA MÓVIL ---
  const handlePayment = () => {
    // ⚠️ CRÍTICO PARA MÓVILES: NO ejecutar setSubmitting(true) aquí arriba.
    // Cualquier cambio de estado asíncrono antes del window.location 
    // hará que Safari/Chrome Mobile bloquee la redirección.

    setErrorMessage(null)

    // Buscamos el link generado por el backend
    const paymentLink = session?.data?.init_point || session?.data?.sandbox_init_point

    if (!paymentLink) {
      console.error("❌ [FRONTEND] No se encontró link de pago en la sesión.")
      setErrorMessage("Error de conexión con Mercado Pago. Refresca la página.")
      return;
    }

    // 🚀 REDIRECCIÓN INMEDIATA
    console.log("🚀 [FRONTEND] Redirigiendo a Mercado Pago:", paymentLink)
    window.location.href = paymentLink
    
    // (Opcional) Podrías poner setSubmitting(true) aquí abajo si quieres que aparezca el spinner 
    // mientras el navegador carga la nueva URL, pero lo ideal es dejarlo limpio.
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
             {paymentStatus === "success" || paymentStatus === "approved" ? "Finalizando compra..." : "Redirigiendo..."}
          </div>
        ) : (
          "PAGAR CON MERCADO PAGO"
        )}
      </Button>

      {errorMessage && (
        <div className="text-red-600 text-sm mt-2 text-center bg-red-50 p-2 rounded border border-red-200">
          {errorMessage}
        </div>
      )}
      
      {notReady && (
        <p className="text-xs text-orange-500 text-center">
          Completa los datos de envío para habilitar el pago.
        </p>
      )}
    </div>
  )
}