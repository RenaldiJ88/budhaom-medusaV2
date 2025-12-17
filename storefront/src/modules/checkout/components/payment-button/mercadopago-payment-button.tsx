"use client"

import { Button } from "@medusajs/ui"
import { useState } from "react"

type MercadoPagoPaymentButtonProps = {
  notReady: boolean
  cart: unknown
  session: {
    data?: {
      init_point?: string
      sandbox_init_point?: string
    }
  } | null
}

export const MercadoPagoPaymentButton = ({
  notReady,
  cart,
  session,
}: MercadoPagoPaymentButtonProps) => {
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handlePayment = (): void => {
    setSubmitting(true)
    setErrorMessage(null)

    try {
      // Verificar que el link de pago esté disponible usando optional chaining estricto
      const paymentLink = session?.data?.init_point || session?.data?.sandbox_init_point

      if (paymentLink) {
        window.location.href = paymentLink
      } else {
        throw new Error("Payment link not ready")
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Payment link not ready"
      console.error("❌ [MP-BUTTON] Error:", errorMessage)
      setErrorMessage(errorMessage)
      setSubmitting(false)
    }
  }

  const isDisabled = submitting || !session?.data?.init_point

  return (
    <div className="flex flex-col gap-2">
      <Button
        disabled={isDisabled}
        onClick={handlePayment}
        size="large"
        isLoading={submitting}
        className="w-full mt-4"
        style={{ backgroundColor: "#009ee3", color: "white" }}
      >
        {submitting ? "Processing..." : "PAGAR CON MERCADO PAGO"}
      </Button>

      {errorMessage && (
        <p className="text-xs text-red-500 text-center mt-2">
          {errorMessage}
        </p>
      )}
    </div>
  )
}