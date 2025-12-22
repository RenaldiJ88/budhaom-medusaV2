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
  
  const searchParams = useSearchParams()
  const router = useRouter()
  
  const paymentStatus = searchParams.get("payment_status")

  // --- 1. LÓGICA DE RETORNO (CUANDO VUELVE DE MP) ---
  useEffect(() => {
    // CAMBIO RADICAL: Si el pago es exitoso, NO LLAMAMOS A MEDUSA.
    // Confiamos 100% en que el Webhook ya hizo el trabajo o lo hará en segundos.
    // Esto evita el error "Payment authorization failed" en el backend.
    
    if ((paymentStatus === "success" || paymentStatus === "approved") && !submitting) {
      console.log("✅ [FRONTEND] Pago aprobado. Delegando creación de orden al Webhook.")
      setSubmitting(true)
      
      // Esperamos 2 segundos de cortesía para dar tiempo al Webhook y redirigimos
      setTimeout(() => {
        router.push("/account/orders")
      }, 1500)
    } 
    else if (paymentStatus === "failure") {
      setErrorMessage("El pago fue rechazado por Mercado Pago. Intenta nuevamente.")
    }
  }, [paymentStatus])

  // Esta función solo se usa si falla algo y el usuario reintenta manual, 
  // NO se usa en el retorno automático exitoso.
  const handleOrderCompletion = async () => {
    setSubmitting(true)
    setErrorMessage(null)

    try {
      await placeOrder()
    } catch (err: any) {
      console.error("❌ [FRONTEND] Error:", err)
      const errorText = (err.message || "").toLowerCase();

      // Si el webhook ya ganó, redirigimos
      if (errorText.includes("completed") || errorText.includes("found") || errorText.includes("404")) {
         router.push("/account/orders");
         return;
      }
      
      setErrorMessage(err.message || "Error al procesar la orden.")
      setSubmitting(false)
    }
  }

  // --- 2. LÓGICA DE IDA (IR A PAGAR) ---
  const handlePayment = () => {
    setErrorMessage(null)
    const paymentLink = session?.data?.init_point || session?.data?.sandbox_init_point

    if (!paymentLink) {
      setErrorMessage("Error de conexión con Mercado Pago.")
      return;
    }

    console.log("🚀 Redirigiendo a:", paymentLink)
    window.location.href = paymentLink
  }

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
             {/* Mensaje amigable mientras redirigimos */}
             {paymentStatus === "approved" || paymentStatus === "success" 
                ? "Pago recibido. Procesando..." 
                : "Redirigiendo..."}
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
      
      {notReady && <p className="text-xs text-orange-500 text-center">Faltan datos de envío.</p>}
    </div>
  )
}