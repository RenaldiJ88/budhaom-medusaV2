import { NextRequest, NextResponse } from "next/server"
import { MercadoPagoConfig, Payment } from "mercadopago"
import { sdk } from "@lib/config"

export async function POST(req: NextRequest) {
  console.log("🔔 [WEBHOOK-MP] >>> Nueva llamada al webhook <<<")

  // 1. Extraer Query Params (A veces el ID viene en la URL: ?id=123&topic=payment)
  const searchParams = req.nextUrl.searchParams
  const queryId = searchParams.get("data.id") || searchParams.get("id")
  const queryTopic = searchParams.get("topic") || searchParams.get("type")

  try {
    // 2. Obtener el body (sin loguear datos sensibles)
    const body = await req.json().catch(() => ({}))
    console.log("📦 [WEBHOOK-MP] Body keys:", Object.keys(body || {}))

    // -----------------------------------------------------------------------
    // ESTRATEGIA DE EXTRACCIÓN DE ID MEJORADA
    // -----------------------------------------------------------------------
    let paymentId = body?.data?.id || body?.id || queryId
    let topic = body?.topic || body?.type || queryTopic || "unknown"

    // Caso especial: Formato "Resource"
    // Ejemplo: { resource: "123456", topic: "payment" }
    // O Ejemplo: { resource: "https://.../payments/123456", topic: "payment" }
    if (!paymentId && body?.resource) {
      const resource = body.resource // Puede ser un número o una URL
      if (resource.toString().includes("/")) {
        // Es una URL, sacamos lo último
        const parts = resource.split("/")
        paymentId = parts[parts.length - 1]
      } else {
        // Es el ID directo
        paymentId = resource
      }
    }

    // -----------------------------------------------------------------------
    // FILTRO DE TÓPICOS
    // -----------------------------------------------------------------------
    // Si es una "merchant_order", por ahora la ignoramos y retornamos 200.
    // Solo queremos procesar cuando el TÓPICO sea 'payment' para crear la orden.
    if (topic === "merchant_order") {
      console.log(
        "ℹ️ [WEBHOOK-MP] Ignorando merchant_order (esperando notificación de payment). ID:",
        paymentId
      )
      return NextResponse.json(
        { status: "ignored_merchant_order" },
        { status: 200 }
      )
    }

    if (!paymentId) {
      console.error(
        "❌ [WEBHOOK-MP] No se encontró payment_id. Body keys:",
        Object.keys(body || {})
      )
      return NextResponse.json({ error: "No ID found" }, { status: 200 })
    }

    console.log(
      `🔍 [WEBHOOK-MP] Procesando Payment ID: ${paymentId} (Topic: ${topic})`
    )

    // -----------------------------------------------------------------------
    // CONSULTA A MERCADOPAGO
    // -----------------------------------------------------------------------
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN
    if (!accessToken) {
      console.error("❌ [WEBHOOK-MP] Falta MERCADOPAGO_ACCESS_TOKEN")
      return NextResponse.json({ error: "Config error" }, { status: 200 })
    }

    const mercadoPagoConfig = new MercadoPagoConfig({ accessToken })
    const paymentClient = new Payment(mercadoPagoConfig)

    // Consultamos el estado REAL
    const payment = await paymentClient.get({ id: paymentId })

    if (!payment) {
      console.error("❌ [WEBHOOK-MP] Pago no encontrado en MP")
      return NextResponse.json({ error: "Not found" }, { status: 200 })
    }

    console.log("📋 [WEBHOOK-MP] Estado:", payment.status, "| Detalle:", payment.status_detail)

    // 4. Verificar aprobación
    if (payment.status === "approved" && payment.status_detail === "accredited") {
      const cartId = payment.external_reference

      if (!cartId) {
        console.error(
          "❌ [WEBHOOK-MP] El pago no tiene external_reference (cart_id)"
        )
        return NextResponse.json(
          { error: "No external_reference" },
          { status: 200 }
        )
      }

      console.log("🛒 [WEBHOOK-MP] Cart ID encontrado:", cartId)

      // 5. COMPLETAR ORDEN EN MEDUSA (SIMPLIFICADO - el cart ya debe estar válido desde el frontend)
      try {
        // Verificación temprana de idempotencia (opcional, pero útil)
        try {
          const existingCartRes = await sdk.store.cart.retrieve(cartId)
          const existingCart = existingCartRes?.cart as
            | (typeof existingCartRes.cart & {
                completed_at?: string | Date | null
              })
            | undefined

          if (existingCart?.completed_at) {
            console.log(
              "✅ [WEBHOOK-MP] Carrito ya completado. Idempotencia aplicada."
            )
            return NextResponse.json(
              { message: "Already completed", cart_id: cartId },
              { status: 200 }
            )
          }
        } catch (retrieveError: any) {
          // Si el cart no existe (404), puede ser que ya se convirtió en order
          if (retrieveError.status === 404 || retrieveError.statusCode === 404) {
            console.log(
              "✅ [WEBHOOK-MP] Cart no encontrado (404). Ya convertido a order. Idempotencia aplicada."
            )
            return NextResponse.json(
              { message: "Cart already converted to order", cart_id: cartId },
              { status: 200 }
            )
          }
          // Otros errores: continuamos e intentamos completar de todas formas
        }

        // Intentar completar el carrito
        console.log("🚀 [WEBHOOK-MP] Intentando completar carrito en Medusa...")
        
        try {
          const completion = await sdk.store.cart.complete(cartId)

          if (completion?.type === "order" && completion?.order) {
            console.log(
              "🎉 [WEBHOOK-MP] ¡ORDEN CREADA EXITOSAMENTE! ID:",
              completion.order.id
            )
            return NextResponse.json(
              { status: "success", order_id: completion.order.id, cart_id: cartId },
              { status: 200 }
            )
          } else {
            console.warn(
              "⚠️ [WEBHOOK-MP] Respuesta inesperada al completar:",
              completion?.type
            )
            // Retornar 200 OK igual para evitar loops de reintentos
            return NextResponse.json(
              { status: "unexpected_response", cart_id: cartId },
              { status: 200 }
            )
          }
        } catch (completeError: any) {
          // ============================================================
          // MANEJO DE ERRORES: SIEMPRE RETORNAR 200 OK
          // ============================================================
          const errorMessage = completeError.message || ""
          const errorStatus =
            completeError.status ||
            completeError.statusCode ||
            completeError.response?.status

          // Caso 1: Transaction already started
          if (
            errorMessage.toLowerCase().includes("transaction already started") ||
            errorMessage.toLowerCase().includes("transaction in progress")
          ) {
            console.log(
              "✅ [WEBHOOK-MP] Transaction ya iniciada por otro webhook. Idempotencia aplicada."
            )
            return NextResponse.json(
              { message: "Transaction already started", cart_id: cartId },
              { status: 200 }
            )
          }

          // Caso 2: Cart not found (404)
          if (errorStatus === 404) {
            console.log(
              "✅ [WEBHOOK-MP] Cart no encontrado (404). Ya convertido a order. Idempotencia aplicada."
            )
            return NextResponse.json(
              { message: "Cart already converted to order", cart_id: cartId },
              { status: 200 }
            )
          }

          // Caso 3: Conflict (409) o idempotency
          if (
            errorStatus === 409 ||
            errorMessage.toLowerCase().includes("idempotency") ||
            errorMessage.toLowerCase().includes("already exists") ||
            errorMessage.toLowerCase().includes("duplicate")
          ) {
            console.log(
              "✅ [WEBHOOK-MP] Conflicto de idempotencia detectado. Orden ya procesada."
            )
            return NextResponse.json(
              { message: "Order already processed (idempotency)", cart_id: cartId },
              { status: 200 }
            )
          }

          // Caso 4: Cart already completed
          if (
            errorMessage.toLowerCase().includes("completed") ||
            errorMessage.toLowerCase().includes("already completed")
          ) {
            console.log(
              "✅ [WEBHOOK-MP] Cart ya completado. Idempotencia aplicada."
            )
            return NextResponse.json(
              { message: "Cart already completed", cart_id: cartId },
              { status: 200 }
            )
          }

          // Caso 5: Cualquier otro error (400, 500, etc.) - SIEMPRE RETORNAR 200 OK
          console.error("❌ [WEBHOOK-MP] Error al completar carrito (retornando 200 OK para evitar loops):", {
            message: errorMessage,
            status: errorStatus,
            stack: completeError.stack,
            cart_id: cartId,
          })
          
          // CRÍTICO: Siempre retornar 200 OK, incluso para errores 500
          // Esto evita que MercadoPago siga reintentando y spameando el webhook
          return NextResponse.json(
            {
              error: "Error during completion (acknowledged)",
              cart_id: cartId,
              error_type: "completion_error",
              error_message: errorMessage,
            },
            { status: 200 }
          )
        }
      } catch (outerError: any) {
        // Catch-all: Cualquier error inesperado también retorna 200 OK
        console.error("💥 [WEBHOOK-MP] Error inesperado en bloque principal (retornando 200 OK):", {
          message: outerError.message,
          stack: outerError.stack,
          cart_id: cartId,
        })
        // SIEMPRE retornar 200 para evitar loops de reintentos de MercadoPago
        return NextResponse.json(
          { error: "Unexpected error (acknowledged)", cart_id: cartId },
          { status: 200 }
        )
      }
    } else {
      console.log(
        "⚠️ [WEBHOOK-MP] Pago no aprobado aún. Estado:",
        payment.status
      )
    }

    return NextResponse.json({ received: true }, { status: 200 })
  } catch (error: any) {
    console.error("💥 [WEBHOOK-MP] Error CRÍTICO:", {
      message: error.message,
      stack: error.stack,
    })
    return NextResponse.json({ error: "Internal Error" }, { status: 200 })
  }
}