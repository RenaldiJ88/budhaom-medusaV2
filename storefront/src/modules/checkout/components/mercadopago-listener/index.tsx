"use client"

import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { useEffect, useState, useRef } from "react"
import { sdk } from "@lib/config"

const MercadoPagoListener = ({ cart }: { cart: any }) => {
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const [isProcessing, setIsProcessing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  
  // useRef para evitar ejecuciones múltiples (idempotencia)
  const hasProcessedRef = useRef(false)
  const isProcessingRef = useRef(false)

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
        providerIdFound: mpSession?.provider_id || cart?.payment_session?.provider_id,
        hasProcessed: hasProcessedRef.current,
        isProcessing: isProcessingRef.current
    })

    // Si detectamos éxito, es MP, no hemos procesado ya, y no estamos procesando...
    if (
      isMercadoPago && 
      paymentStatus === "success" && 
      !hasProcessedRef.current && 
      !isProcessingRef.current
    ) {
      console.log("✅ [LISTENER] Detectado retorno MP - Iniciando proceso de completar orden")
      hasProcessedRef.current = true
      completeOrder()
    }
  }, [paymentStatus, isMercadoPago, pathname])

  const completeOrder = async () => {
    if (isProcessingRef.current) {
      console.log("⚠️ [LISTENER] Ya se está procesando la orden, ignorando llamada duplicada")
      return
    }

    isProcessingRef.current = true
    setIsProcessing(true)
    setMessage("Pago confirmado. Creando tu orden...")
    console.log("🔄 [LISTENER] Completando carrito...")

    try {
      if (!cart?.id) {
        throw new Error("Cart ID no disponible")
      }

      // Usar SDK de Medusa en lugar de fetch crudo
      console.log("📦 [LISTENER] Llamando a SDK para completar carrito:", cart.id)
      const cartRes = await sdk.store.cart.complete(cart.id, {})

      console.log("📋 [LISTENER] Respuesta del SDK:", { type: cartRes.type, hasOrder: !!cartRes.order })

      if (cartRes?.type === "order" && cartRes?.order) {
        const order = cartRes.order
        const countryCode = order.shipping_address?.country_code?.toLowerCase() || 
                           order.billing_address?.country_code?.toLowerCase() || 
                           cart.region?.countries?.[0]?.iso_2?.toLowerCase() || 
                           "ar"
        
        console.log("✅ [LISTENER] Orden creada exitosamente:", order.id)
        console.log("🌍 [LISTENER] Country code detectado:", countryCode)
        console.log("🚀 [LISTENER] Redirigiendo a:", `/${countryCode}/order/confirmed/${order.id}`)
        
        router.push(`/${countryCode}/order/confirmed/${order.id}`)
      } else {
        console.error("❌ [LISTENER] Error: La respuesta no contiene una orden válida", cartRes)
        setMessage("Hubo un error al crear la orden, pero tu pago está registrado.")
        isProcessingRef.current = false
        setIsProcessing(false)
        hasProcessedRef.current = false // Permitir reintento
      }

    } catch (err: any) {
      console.error("❌ [LISTENER] Error de conexión o completado:", err)
      console.error("❌ [LISTENER] Detalles del error:", {
        message: err.message,
        stack: err.stack,
        cartId: cart?.id
      })
      setMessage("Error de conexión con el servidor. Por favor, verifica tu orden en tu cuenta.")
      isProcessingRef.current = false
      setIsProcessing(false)
      hasProcessedRef.current = false // Permitir reintento en caso de error
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