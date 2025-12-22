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

  // --- 1. LÓGICA DE RETORNO ---
  useEffect(() => {
    // Si Mercado Pago nos devuelve con "success", intentamos cerrar la orden
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
      // Intentamos cerrar el carrito y crear la orden
      await placeOrder()
      // Si tiene éxito, 'placeOrder' se encarga de redirigir a /order/confirmed/...
    } catch (err: any) {
      console.error("❌ [FRONTEND] Error al cerrar la orden:", err)
      
      const errorText = (err.message || "").toLowerCase();

      // --- MANEJO DE RACE CONDITION (Webhook vs Frontend) ---
      // Si el error dice que el carrito "no existe", "ya fue completado" o da error 404/409,
      // pero Mercado Pago nos dijo "success", asumimos que el Webhook ya creó la orden.
      if (
        errorText.includes("completed") || 
        errorText.includes("found") || // "not found"
        errorText.includes("exist") || // "does not exist"
        errorText.includes("404") ||
        errorText.includes("409")
      ) {
         console.warn("⚠️ [FRONTEND] El Webhook ganó la carrera. Redirigiendo a órdenes...");
         // Como placeOrder falló, no tenemos el ID de la orden nueva para ir a /order/confirmed/ID.
         // Lo más seguro es mandar al usuario a su lista de órdenes.
         router.push("/account/orders");
         return;
      }

      // Si es un error real (ej: tarjeta rechazada por Medusa), mostramos el mensaje.
      setErrorMessage(err.message || "Error al procesar la orden en Medusa.")
      setSubmitting(false)
    }
  }

  // --- 2. LÓGICA DE IDA (IR A PAGAR) ---
  const handlePayment = () => {
    setSubmitting(true)
    setErrorMessage(null)

    // Buscamos el link generado por el backend
    // Priorizamos sandbox_init_point si estamos probando, o init_point normal
    const paymentLink = session?.data?.init_point || session?.data?.sandbox_init_point

    if (paymentLink) {
      console.log("🚀 [FRONTEND] Redirigiendo a Mercado Pago:", paymentLink)
      window.location.href = paymentLink
    } else {
      console.error("❌ [FRONTEND] No se encontró link de pago en la sesión.")
      setErrorMessage("Error de conexión con Mercado Pago. Refresca la página.")
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
        <div className="text-red-600 text-sm mt-2 text-center bg-red-50 p-2 rounded border border-red-200">
          {errorMessage}
        </div>
      )}
      
      {/* Aviso de debug si notReady es true */}
      {notReady && (
        <p className="text-xs text-orange-500 text-center">
          Completa los datos de envío para habilitar el pago.
        </p>
      )}
    </div>
  )
}