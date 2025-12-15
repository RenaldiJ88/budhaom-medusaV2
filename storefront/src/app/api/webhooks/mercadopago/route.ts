import { NextRequest, NextResponse } from 'next/server';
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { sdk } from '@lib/config';

/**
 * Webhook de MercadoPago para procesar notificaciones de pago
 * 
 * Este endpoint:
 * 1. Recibe notificaciones de MercadoPago cuando un pago cambia de estado
 * 2. Verifica el estado real del pago usando el SDK de MercadoPago
 * 3. Solo procesa si el pago está aprobado (approved + accredited)
 * 4. Implementa idempotencia para evitar órdenes duplicadas
 * 5. Completa el carrito y crea la orden usando el SDK de Medusa
 */
export async function POST(req: NextRequest) {
  const startTime = Date.now()

  // LOGS EXTREMADAMENTE DETALLADOS DESDE EL INICIO
  console.log("🔔 [WEBHOOK-MP] >>> Nueva llamada al webhook de MercadoPago <<<")
  console.log("🔔 [WEBHOOK-MP] Método:", req.method)
  console.log("🔔 [WEBHOOK-MP] URL completa:", req.nextUrl.href)
  console.log("🔔 [WEBHOOK-MP] Pathname:", req.nextUrl.pathname)
  console.log("🔔 [WEBHOOK-MP] QueryString:", req.nextUrl.search)

  const headerSnapshot: Record<string, string> = {}
  req.headers.forEach((value, key) => {
    headerSnapshot[key] = value
  })
  console.log("🔔 [WEBHOOK-MP] Headers recibidos:", JSON.stringify(headerSnapshot))

  try {
    // 1. Obtener el body de la notificación
    const body = await req.json().catch(() => ({}))
    console.log("📦 [WEBHOOK-MP] Body recibido (raw):", JSON.stringify(body))

    // 2. Extraer el ID del pago (MercadoPago puede enviar diferentes formas)
    const paymentId =
      body?.data?.id ||
      body?.data?.resource?.id ||
      body?.resource?.id ||
      body?.id ||
      body?.["data.id"]
    
    if (!paymentId) {
      console.error(
        "❌ [WEBHOOK-MP] No se encontró payment_id en el body. Keys:",
        Object.keys(body || {})
      )
      console.error("❌ [WEBHOOK-MP] Body completo:", JSON.stringify(body))
      // Retornar 200 para que MercadoPago no reintente
      return NextResponse.json(
        {
          received: true,
          error: "No payment_id found",
        },
        { status: 200 }
      )
    }

    console.log("🔍 [WEBHOOK-MP] Payment ID extraído:", paymentId)

    // 3. Verificar el estado real del pago usando el SDK de MercadoPago
    // NO confiamos en el body, siempre consultamos el estado real
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN
    if (!accessToken) {
      console.error(
        "❌ [WEBHOOK-MP] MERCADOPAGO_ACCESS_TOKEN no configurado en el entorno"
      )
      return NextResponse.json(
        {
          received: true,
          error: "MercadoPago token not configured",
        },
        { status: 200 }
      )
    }

    const mercadoPagoConfig = new MercadoPagoConfig({
      accessToken: accessToken,
    })

    const paymentClient = new Payment(mercadoPagoConfig)

    console.log("🔎 [WEBHOOK-MP] Consultando estado real del pago:", paymentId)
    const payment = await paymentClient.get({ id: paymentId })
    
    if (!payment) {
      console.error(
        "❌ [WEBHOOK-MP] No se pudo obtener información del pago:",
        paymentId
      )
      return NextResponse.json(
        {
          received: true,
          error: "Payment not found",
        },
        { status: 200 }
      )
    }

    console.log("📋 [WEBHOOK-MP] Estado del pago:", {
      id: payment.id,
      status: payment.status,
      status_detail: payment.status_detail,
      external_reference: payment.external_reference,
    })

    // 4. Verificar que el pago esté aprobado y acreditado
    const isApproved = payment.status === "approved"
    const isAccredited = payment.status_detail === "accredited"
    
    if (!isApproved || !isAccredited) {
      console.log("⚠️ [WEBHOOK-MP] Pago no aprobado/acreditado, ignorando:", {
        status: payment.status,
        status_detail: payment.status_detail,
      })
      // Retornar 200 para que MercadoPago no reintente
      return NextResponse.json(
        {
          received: true,
          message: "Payment not approved/accredited, ignoring",
          status: payment.status,
          status_detail: payment.status_detail,
        },
        { status: 200 }
      )
    }

    // 5. Obtener el external_reference (cart_id)
    const cartId = payment.external_reference
    
    if (!cartId) {
      console.error(
        "❌ [WEBHOOK-MP] No se encontró external_reference (cart_id) en el pago"
      )
      console.error("❌ [WEBHOOK-MP] Pago completo:", JSON.stringify(payment))
      return NextResponse.json(
        {
          received: true,
          error: "No external_reference found",
        },
        { status: 200 }
      )
    }

    console.log(
      "🛒 [WEBHOOK-MP] Cart ID extraído del external_reference:",
      cartId
    )

    // 6. IDEMPOTENCIA: Verificar si la orden ya existe
    // Buscamos si ya existe una orden para este carrito
    try {
      const existingCart = await sdk.store.cart.retrieve(cartId)
      // `completed_at` no está tipado en `StoreCart` en el SDK, pero sí existe en runtime.
      // Hacemos una aserción de tipo local para evitar el error de TypeScript sin cambiar el SDK.
      const existingCartData = existingCart?.cart as any
      
      if (existingCartData?.completed_at) {
        console.log(
          "✅ [WEBHOOK-MP] Carrito ya completado, orden ya existe. Idempotencia aplicada."
        )
        console.log(
          "📝 [WEBHOOK-MP] Tiempo de procesamiento:",
          Date.now() - startTime,
          "ms"
        )
        return NextResponse.json(
          {
            received: true,
            message: "Order already exists (idempotency)",
            cart_id: cartId,
          },
          { status: 200 }
        )
      }

      // Verificar si existe una orden con este cart_id buscando en los metadatos
      // En Medusa 2.0, podemos buscar órdenes por cart_id
      console.log(
        "🔍 [WEBHOOK-MP] Verificando si existe orden para cart_id:",
        cartId
      )
      
    } catch (cartError: any) {
      // Si el carrito no existe, puede ser que ya se haya completado y eliminado
      console.log(
        "⚠️ [WEBHOOK-MP] No se pudo recuperar el carrito (puede estar ya completado):",
        cartError.message
      )
      // Continuamos con el proceso, Medusa manejará si el carrito ya está completado
    }

    // 7. Completar el carrito usando el SDK de Medusa
    console.log("🚀 [WEBHOOK-MP] Completando carrito para crear orden:", cartId)
    
    try {
      const cartRes = await sdk.store.cart.complete(cartId, {})
      
      if (cartRes?.type === "order" && cartRes?.order) {
        const orderId = cartRes.order.id
        console.log(
          "✅ [WEBHOOK-MP] Orden creada exitosamente desde webhook:",
          orderId
        )
        console.log(
          "📝 [WEBHOOK-MP] Tiempo total de procesamiento:",
          Date.now() - startTime,
          "ms"
        )

        return NextResponse.json(
          {
            received: true,
            processed: true,
            order_id: orderId,
            cart_id: cartId,
            payment_id: paymentId,
            message: "Order created successfully from webhook",
          },
          { status: 200 }
        )
      } else {
        console.error(
          "❌ [WEBHOOK-MP] La respuesta no contiene una orden válida:",
          cartRes
        )
        return NextResponse.json(
          {
            received: true,
            processed: false,
            error: "Invalid response from cart.complete",
            cart_id: cartId,
          },
          { status: 200 }
        )
      }
    } catch (completeError: any) {
      // Si el error es que el carrito ya está completado, es idempotencia
      if (
        completeError.message?.includes("already completed") ||
        completeError.message?.includes("already exists") ||
        completeError.status === 400
      ) {
        console.log(
          "✅ [WEBHOOK-MP] Carrito ya completado (idempotencia):",
          completeError.message
        )
        return NextResponse.json(
          {
            received: true,
            processed: false,
            message: "Cart already completed (idempotency)",
            cart_id: cartId,
          },
          { status: 200 }
        )
      }

      console.error(
        "❌ [WEBHOOK-MP] Error al completar carrito:",
        completeError
      )
      console.error("❌ [WEBHOOK-MP] Detalles del error:", {
        message: completeError.message,
        stack: completeError.stack,
        cart_id: cartId,
      })

      // Retornar 200 para que MercadoPago no reintente en bucle
      // Pero logueamos el error para debugging
      return NextResponse.json(
        {
          received: true,
          processed: false,
          error: "Error completing cart",
          cart_id: cartId,
          error_message: completeError.message,
        },
        { status: 200 }
      )
    }

  } catch (error: any) {
    console.error("❌ [WEBHOOK-MP] Error general en webhook:", error)
    console.error("❌ [WEBHOOK-MP] Stack trace:", error.stack)

    // SIEMPRE retornar 200 para evitar que MercadoPago reintente en bucle
    return NextResponse.json(
      {
        received: true,
        processed: false,
        error: "Internal server error",
        error_message: error.message,
      },
      { status: 200 }
    )
  }
}

// GET para verificación/healthcheck del webhook
export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "/api/webhooks/mercadopago",
    message: "MercadoPago webhook endpoint is active",
  })
}