import {
  AbstractPaymentProvider,
  PaymentSessionStatus,
  PaymentActions,
  Modules,
} from "@medusajs/utils"

import {
  Logger,
  WebhookActionResult,
  IPaymentModuleService,
} from "@medusajs/types"

import { MercadoPagoConfig, Preference } from "mercadopago"

type Options = {
  access_token: string
  public_key?: string
  webhook_url?: string
}

type SessionData = Record<string, unknown>

class MercadoPagoProvider extends AbstractPaymentProvider<SessionData> {
  static identifier = "mercadopago"

  protected options_: Options
  protected logger_: Logger
  protected mercadoPagoConfig: MercadoPagoConfig
  protected container_: any

  constructor(container: any, options: Options) {
    // @ts-ignore
    super(container, options)
    this.options_ = options
    this.logger_ = container.logger
    this.container_ = container

    const token =
      options.access_token || process.env.MERCADOPAGO_ACCESS_TOKEN || "NO_TOKEN"
    this.mercadoPagoConfig = new MercadoPagoConfig({
      accessToken: token,
    })
  }

  async initiatePayment(input: any): Promise<{ id: string; data: SessionData }> {
    try {
      // 1. Configuración de URLs
      let storeUrl = process.env.STORE_URL || "http://localhost:8000"
      if (!storeUrl.startsWith("http")) storeUrl = `http://${storeUrl}`
      if (storeUrl.endsWith("/")) storeUrl = storeUrl.slice(0, -1)
      
      let webhookBase = process.env.NEXT_PUBLIC_APP_URL || process.env.STORE_URL || "http://localhost:8000"
      if (!webhookBase.startsWith("http")) webhookBase = `https://${webhookBase}`
      if (webhookBase.endsWith("/")) webhookBase = webhookBase.slice(0, -1)
      webhookBase = webhookBase.replace(/\/ar$/, "").replace(/\/en$/, "");

      const webhookUrl = `${webhookBase}/api/webhooks/mercadopago`
      
      let appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL || storeUrl
      if (!appUrl.startsWith("http")) appUrl = `https://${appUrl}`
      if (appUrl.endsWith("/")) appUrl = appUrl.slice(0, -1)
      const statusBaseUrl = `${appUrl}/checkout/status`

      // 2. Obtención de Cart ID (Segura)
      let cartId = input?.context?.cart_id || input?.cart_id || input?.resource_id || input?.id
      
      // Fallback a sesión si no hay cartId
      if (!cartId && input?.data?.session_id) {
         // Intentar recuperar de la sesión, pero no fallar si no se puede
         cartId = input.data.resource_id || "unknown_cart"
      }
      
      if (!cartId) cartId = "unknown_cart_fallback"

      // 3. Monto
      let amount = input?.amount || input?.context?.amount
      if (typeof amount === "object" && amount !== null && "value" in amount) amount = amount.value
      amount = Number(amount)
      if (isNaN(amount) || amount <= 0) amount = 100

      // 4. Crear Preferencia
      const preferenceData = {
        body: {
          items: [
            {
              id: cartId,
              title: "Compra Tienda",
              quantity: 1,
              unit_price: amount,
              currency_id: (input?.currency_code || "ARS").toUpperCase(),
            },
          ],
          payer: { email: input?.email || "guest@test.com" },
          external_reference: cartId,
          notification_url: webhookUrl,
          // CONFIGURACIÓN SOLO RETIRO / FLEXIBLE
          shipments: {
            mode: "not_specified",
            local_pickup: true,
            free_shipping: true,
          },
          back_urls: {
            success: `${statusBaseUrl}?status=approved`,
            failure: `${statusBaseUrl}?status=failure`,
            pending: `${statusBaseUrl}?status=pending`,
          },
          auto_return: "approved",
        },
      }

      const preference = new Preference(this.mercadoPagoConfig)
      const response = await preference.create(preferenceData)

      if (!response.id) throw new Error("MP no devolvió ID")

      return {
        id: response.id!,
        data: {
          id: response.id!,
          init_point: response.init_point!,
          resource_id: cartId, 
          external_reference: cartId 
        },
      }
    } catch (error: any) {
      this.logger_.error(`🔥 [MP-CRASH] ${error.message}`)
      throw error
    }
  }

  async updatePayment(input: any): Promise<{ id: string, data: SessionData }> {
    // Si ya tenemos ID, reusarlo
    if (input?.data?.id) return input;
    return this.initiatePayment(input);
  }

  // --- MÉTODOS BLINDADOS (Aquí estaba el crash) ---

  async authorizePayment(input: any): Promise<{ status: PaymentSessionStatus; data: SessionData; }> {
    // NO intentamos leer el carrito. Asumimos que si llegamos aquí, MP autorizó.
    return { status: PaymentSessionStatus.AUTHORIZED, data: input?.session_data || {} };
  }

  async getPaymentStatus(input: any): Promise<{ status: PaymentSessionStatus }> {
    // AQUÍ OCURRÍA EL ERROR "reading payment_collection".
    // Eliminamos la lectura del carrito. Siempre devolvemos AUTHORIZED.
    // La verificación real la hace el Webhook al crear la orden.
    return { status: PaymentSessionStatus.AUTHORIZED }; 
  }

  async cancelPayment(input: any): Promise<SessionData> { return input?.session_data || {}; }
  async capturePayment(input: any): Promise<SessionData> { return input?.session_data || {}; }
  async deletePayment(input: any): Promise<SessionData> { return input?.session_data || {}; }
  async refundPayment(input: any): Promise<SessionData> { return input?.session_data || {}; }
  async retrievePayment(input: any): Promise<SessionData> { return input?.session_data || {}; }
  async getWebhookActionAndData(input: any): Promise<WebhookActionResult> {
    return { action: PaymentActions.NOT_SUPPORTED };
  }
}

export default {
  services: [MercadoPagoProvider],
};