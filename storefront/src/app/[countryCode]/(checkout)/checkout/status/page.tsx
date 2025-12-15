"use client"

import { useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Heading, Text, Button } from "@medusajs/ui"

type Props = {
  params: {
    countryCode: string
  }
}

const CLEAR_DELAY_MS = 3000

export default function CheckoutStatusPage({ params }: Props) {
  const searchParams = useSearchParams()
  const router = useRouter()

  const rawStatus =
    searchParams.get("status") ||
    searchParams.get("collection_status") ||
    searchParams.get("status_detail") ||
    ""

  const status = rawStatus.toLowerCase()

  const isSuccess = status === "approved" || status === "success"
  const isFailure =
    status === "failure" || status === "rejected" || status === "cancelled"
  const isPending = status === "pending" || status === "in_process"

  useEffect(() => {
    if (!isSuccess) {
      return
    }

    // Limpia el carrito en el navegador eliminando la cookie
    try {
      document.cookie =
        "_medusa_cart_id=; Max-Age=0; path=/; SameSite=Strict; Secure"
      // Fallback sin flags por si el navegador ignora los atributos
      document.cookie = "_medusa_cart_id=; Max-Age=0; path=/"
      // eslint-disable-next-line no-console
      console.log("🧹 [CHECKOUT-STATUS] Cookie de carrito limpiada")
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("❌ [CHECKOUT-STATUS] Error limpiando cookie de carrito", e)
    }

    const timeout = setTimeout(() => {
      router.push(`/${params.countryCode}`)
    }, CLEAR_DELAY_MS)

    return () => clearTimeout(timeout)
  }, [isSuccess, router, params.countryCode])

  const handleGoHome = () => {
    router.push(`/${params.countryCode}`)
  }

  const handleRetryCheckout = () => {
    router.push(`/${params.countryCode}/checkout`)
  }

  let title = "Procesando tu pago"
  let description =
    "Estamos verificando el estado de tu pago con MercadoPago. Por favor, espera unos segundos."
  let variant: "success" | "error" | "pending" = "pending"

  if (isSuccess) {
    title = "¡Pago aprobado!"
    description =
      "Tu pago fue aprobado correctamente. Estamos finalizando tu pedido y te redirigiremos al inicio en unos segundos."
    variant = "success"
  } else if (isFailure) {
    title = "Pago rechazado"
    description =
      "Tu pago no pudo ser procesado o fue rechazado por MercadoPago. Puedes intentar nuevamente el proceso de checkout."
    variant = "error"
  } else if (isPending) {
    title = "Pago pendiente"
    description =
      "Tu pago quedó en estado pendiente. MercadoPago puede tardar unos minutos en confirmar el resultado."
    variant = "pending"
  }

  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center">
      <Heading level="h1" className="text-3xl font-bold mb-4">
        {title}
      </Heading>
      <Text className="text-base text-ui-fg-subtle mb-6 max-w-md">
        {description}
      </Text>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        {variant === "success" && (
          <Button onClick={handleGoHome} size="large">
            Ir al inicio ahora
          </Button>
        )}

        {variant === "error" && (
          <>
            <Button onClick={handleRetryCheckout} size="large">
              Volver al checkout
            </Button>
            <Button variant="secondary" onClick={handleGoHome} size="large">
              Ir al inicio
            </Button>
          </>
        )}

        {variant === "pending" && (
          <Button variant="secondary" onClick={handleGoHome} size="large">
            Ir al inicio
          </Button>
        )}
      </div>

      <Text className="text-xs text-ui-fg-muted mt-6">
        Estado recibido desde MercadoPago:{" "}
        <span className="font-mono">{rawStatus || "desconocido"}</span>
      </Text>
    </div>
  )
}


