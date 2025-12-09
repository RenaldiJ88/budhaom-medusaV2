"use client"

import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { useEffect, useState } from "react"

const MercadoPagoListener = ({ cart }: { cart: any }) => {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [isProcessing, setIsProcessing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  // 1. OBTENEMOS EL STATUS DE LA URL
  const paymentStatus = searchParams.get("payment_status")

  // 2. BUSCAMOS SI EXISTE MERCADO PAGO EN LA SESIÓN (Solución al undefined)
  // Buscamos en todas las sesiones disponibles del carrito
  const mpSession = cart?.payment_collection?.payment_sessions?.find(
    (s: any) => s.provider_id?.includes("mercadopago")
  )
  
  // También verificamos si la sesión activa actual es MP
  const isActiveSessionMP = cart?.payment_session?.provider_id?.includes("mercadopago")

  // Si cualquiera de los dos es verdadero, es una compra de MP
  const isMercadoPago = !!mpSession || !!isActiveSessionMP

  useEffect(() => {
    // LOGS DE DEPURACIÓN (Para ver en consola F12)
    console.log("👂 [LISTENER] Estado:", { 
        url: pathname,
        paymentStatus, 
        isMercadoPago,
        providerIdFound: mpSession?.provider_id || cart?.payment_session?.provider_id
    })

    // Si detectamos éxito, es MP y no estamos procesando ya...
    if (isMercadoPago && paymentStatus === "success" && !isProcessing) {
      console.log("✅ [LISTENER] Pago exitoso detectado. Completando orden...")
      completeOrder()
    }
  }, [paymentStatus, isMercadoPago])

  const completeOrder = async () => {
    setIsProcessing(true)
    setMessage("Pago confirmado. Creando tu orden...")

    try {
      // URL del backend
      const backendUrl = process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL || "http://localhost:9000"

      const response = await fetch(`${backendUrl}/store/carts/${cart.id}/complete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      })

      const data = await response.json()

      if (response.ok && data.type === "order") {
        router.push(`/order/confirmed/${data.data.id}`)
      } else {
        console.error("❌ Error completando orden:", data)
        setMessage("Hubo un error al crear la orden, pero tu pago está registrado.")
        setIsProcessing(false)
      }

    } catch (err) {
      console.error("❌ Error de conexión:", err)
      setMessage("Error de conexión con el servidor.")
      setIsProcessing(false)
    }
  }

  // Si no es el caso de éxito de MP, no mostramos nada
  if (!isMercadoPago || paymentStatus !== "success") return null

  // PANTALLA DE CARGA (Overlay)
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white/95 backdrop-blur-sm">
      <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-6"></div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">¡Pago Exitoso!</h2>
      <p className="text-gray-600 text-lg">{message || "Finalizando tu compra..."}</p>
    </div>
  )
}

export default MercadoPagoListener