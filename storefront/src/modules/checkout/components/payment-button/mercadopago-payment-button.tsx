"use client"

import { Button } from "@medusajs/ui"
import { useState } from "react"

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
  
  // 🔍 LOGS PARA DEPURAR EN EL NAVEGADOR
  // Abre la consola con F12 y mira esto:
  console.log("🎨 [FRONTEND] Estado notReady:", notReady)
  console.log("🎨 [FRONTEND] Datos de sesión:", session)
  console.log("🎨 [FRONTEND] Link encontrado:", session?.data?.init_point)

  const handlePayment = () => {
    setSubmitting(true)

    // Buscamos el link que tu backend generó (el que vimos en el log 5)
    const paymentLink = session?.data?.init_point || session?.data?.sandbox_init_point

    if (paymentLink) {
      console.log("🚀 Redirigiendo a:", paymentLink)
      window.location.href = paymentLink
    } else {
      console.error("❌ ERROR: El frontend no ve el link todavía.")
      alert("Error: El link de pago no llegó al frontend. Revisa la consola (F12).")
      setSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        // 🔥 AQUÍ ESTÁ EL CAMBIO: Quitamos "notReady" para que puedas hacer clic SIEMPRE
        disabled={submitting} 
        onClick={handlePayment}
        size="large"
        className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white" // Le puse azul para que destaque
      >
        {submitting ? (
          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          // Mostramos el texto dependiendo de si detectamos el link o no
          session?.data?.init_point ? "PAGAR CON MERCADO PAGO (Listo)" : "PAGAR (Forzar click)"
        )}
      </Button>

      {/* Mensaje de ayuda si el botón debería estar bloqueado */}
      {notReady && (
        <p className="text-xs text-orange-500 text-center">
          Advertencia: Faltan datos de envío (notReady es true), pero el botón está desbloqueado para pruebas.
        </p>
      )}
    </div>
  )
}