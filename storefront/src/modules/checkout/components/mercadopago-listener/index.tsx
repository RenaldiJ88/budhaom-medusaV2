"use client"

import { useSearchParams, useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { Button } from "@medusajs/ui"

export const MercadoPagoListener = ({ cart }: { cart: any }) => {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [isProcessing, setIsProcessing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const paymentStatus = searchParams.get("payment_status")
  const isMercadoPago = cart?.payment_session?.provider_id?.includes("mercadopago")

  useEffect(() => {
    // Solo actuamos si es Mercado Pago, el estado es success y no estamos procesando ya
    if (isMercadoPago && paymentStatus === "success" && !isProcessing) {
      completeOrder()
    }
  }, [paymentStatus, isMercadoPago])

  const completeOrder = async () => {
    setIsProcessing(true)
    setMessage("Pago confirmado en Mercado Pago. Creando orden en Medusa...")

    try {
      const backendUrl = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"

      // 1. Llamamos a Medusa para cerrar el carrito y crear la orden
      const response = await fetch(`${backendUrl}/store/carts/${cart.id}/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      })

      const data = await response.json()

      if (data.type === "order") {
        // 2. ¡ÉXITO! Redirigimos a la pantalla de confirmación oficial
        router.push(`/order/confirmed/${data.data.id}`)
      } else {
        setMessage("Hubo un problema cerrando la orden. Por favor contacta a soporte.")
        setIsProcessing(false)
      }

    } catch (err) {
      console.error(err)
      setMessage("Error de conexión con el servidor.")
      setIsProcessing(false)
    }
  }

  // Si no hay status success o no es MP, este componente no muestra nada (es invisible)
  if (!isMercadoPago || paymentStatus !== "success") return null

  // Si estamos procesando, mostramos una pantalla de carga bloqueante para que el usuario no toque nada
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm">
      <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
      <h2 className="text-xl font-bold text-gray-900">Procesando tu compra...</h2>
      <p className="text-gray-600">{message || "Por favor espera un momento"}</p>
    </div>
  )
}