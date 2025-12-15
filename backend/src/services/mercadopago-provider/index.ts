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

// Usamos Record<string, unknown> para máxima compatibilidad con Medusa V2
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
    // Log seguro (1 solo argumento)
    const inputInfo = input ? Object.keys(input).join(",") : "sin datos"
    this.logger_.info(`🔥 [MP-DEBUG] Iniciando pago. Keys: ${inputInfo}`)

    try {
      // 1. URL Saneada para la tienda (solo informativa)
      let storeUrl = process.env.STORE_URL || "http://localhost:8000"
      if (!storeUrl.startsWith("http")) storeUrl = `http://${storeUrl}`

      if (!storeUrl.includes("/ar") && !storeUrl.includes("localhost")) {
        if (storeUrl.endsWith("/")) storeUrl = storeUrl.slice(0, -1)
        storeUrl = `${storeUrl}/ar`
      }
      if (storeUrl.endsWith("/")) storeUrl = storeUrl.slice(0, -1)

      // 2. URL Webhook (API, puede llevar /ar en Next con i18n)
      let webhookUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.STORE_URL ||
        "http://localhost:8000"
      if (!webhookUrl.startsWith("http")) webhookUrl = `https://${webhookUrl}`
      if (webhookUrl.endsWith("/")) webhookUrl = webhookUrl.slice(0, -1)
      webhookUrl = `${webhookUrl}/api/webhooks/mercadopago`

      // 3. URL base para retorno al frontend (checkout/status)
      let appUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        process.env.NEXT_PUBLIC_BASE_URL ||
        storeUrl
      if (!appUrl.startsWith("http")) appUrl = `https://${appUrl}`
      if (appUrl.endsWith("/")) appUrl = appUrl.slice(0, -1)

      const statusBaseUrl = `${appUrl}/checkout/status`

      // 4. Obtener Cart ID (Estrategia defensiva mejorada)
      // Intentamos múltiples estrategias para obtener el cart_id
      let cartId =
        input.context?.cart_id ||
        input.cart_id ||
        input.context?.resource_id ||
        input.resource_id ||
        input.id

      // Si aún no tenemos cart_id, intentamos obtenerlo desde la sesión de pago usando el container
      if (!cartId && input.data?.session_id) {
        try {
          const paymentModuleService: IPaymentModuleService =
            this.container_.resolve(Modules.PAYMENT)
          const sessionId = input.data.session_id

          this.logger_.info(
            `🔍 [MP-INFO] Buscando cart_id desde sesión: ${sessionId}`
          )

          // Intentamos obtener la sesión de pago para extraer el resource_id (cart_id)
          const paymentSession: any =
            await paymentModuleService.retrievePaymentSession(sessionId)

          // En Medusa 2.0, el resource_id puede estar en diferentes lugares
          const sessionResourceId =
            paymentSession?.resource_id ||
            paymentSession?.context?.resource_id ||
            (paymentSession as any)?.cart_id

          if (sessionResourceId) {
            cartId = sessionResourceId
            this.logger_.info(
              `✅ [MP-INFO] Cart ID obtenido desde sesión: ${cartId}`
            )
          }
        } catch (sessionError: any) {
          this.logger_.warn(
            `⚠️ [MP-WARN] No se pudo obtener cart_id desde sesión: ${sessionError.message}`
          )
        }
      }

      // Si aún no tenemos cart_id, usamos el session_id como último recurso
      // Esto permitirá que el webhook pueda buscar la sesión y obtener el cart_id real
      if (!cartId) {
        cartId = input.data?.session_id || input.context?.idempotency_key

        if (cartId) {
          this.logger_.warn(
            `⚠️ [MP-WARN] Usando session_id/idempotency_key como fallback: ${cartId}`
          )
        } else {
          this.logger_.error(
            `❌ [MP-ERROR] No se pudo obtener cart_id. Input keys: ${Object.keys(
              input
            ).join(",")}`
          )
          throw new Error(
            "No se pudo obtener el cart_id ni ningún identificador válido"
          )
        }
      }

      this.logger_.info(`📦 [MP-INFO] Cart ID final: ${cartId}`)

      // 5. Monto
      let amount = input.amount || input.context?.amount
      if (typeof amount === "object" && amount !== null && "value" in amount) {
        amount = amount.value
      }
      amount = Number(amount)

      if (isNaN(amount) || amount <= 0) {
        this.logger_.warn(
          `⚠️ [MP-WARN] Monto inválido (${amount}). Usando 100.`
        )
        amount = 100
      }

      // 6. Preferencia
      const preferenceData = {
        body: {
          items: [
            {
              id: cartId,
              title: "Compra Tienda",
              quantity: 1,
              unit_price: amount,
              currency_id: (input.currency_code || "ARS").toUpperCase(),
            },
          ],
          payer: { email: input.email || "guest@test.com" },
          external_reference: cartId,
          notification_url: webhookUrl,
          back_urls: {
            // Nueva ruta limpia de estado de pago
            success: `${statusBaseUrl}?status=approved`,
            failure: `${statusBaseUrl}?status=failure`,
            pending: `${statusBaseUrl}?status=pending`,
          },
          auto_return: "approved",
        },
      }

      this.logger_.info(
        `🔔 [MP-INFO] Creando pref. Webhook: ${webhookUrl} | Status URL base: ${statusBaseUrl}`
      )

      const preference = new Preference(this.mercadoPagoConfig)
      const response = await preference.create(preferenceData)

      if (!response.id) throw new Error("MP no devolvió ID")

      this.logger_.info(`✅ [MP-SUCCESS] ID: ${response.id}`)

      // Retorno LIMPIO (sin objetos raros para que Postgres no explote)
      return {
        id: response.id!,
        data: {
          id: response.id!,
          init_point: response.init_point!,
          resource_id: cartId,
          external_reference: cartId,
        },
      }
    } catch (error: any) {
      this.logger_.error(`🔥 [MP-CRASH] ${error.message}`)
      throw error
    }
  }

  async updatePayment(input: any): Promise<{ id: string, data: SessionData }> {
    const savedId = input.data?.resource_id;
    if (savedId) {
       this.logger_.info(`♻️ [MP-INFO] Reutilizando ID: ${savedId}`);
       return this.initiatePayment({ ...input, resource_id: savedId });
    }
    return this.initiatePayment(input);
  }

  async authorizePayment(input: any): Promise<{ status: PaymentSessionStatus; data: SessionData; }> {
    return { status: PaymentSessionStatus.AUTHORIZED, data: input.session_data || {} };
  }
  async cancelPayment(input: any): Promise<SessionData> { return input.session_data || {}; }
  async capturePayment(input: any): Promise<SessionData> { return input.session_data || {}; }
  async deletePayment(input: any): Promise<SessionData> { return input.session_data || {}; }
  async getPaymentStatus(input: any): Promise<{ status: PaymentSessionStatus }> { 
    return { status: PaymentSessionStatus.AUTHORIZED }; 
  }
  async refundPayment(input: any): Promise<SessionData> { return input.session_data || {}; }
  async retrievePayment(input: any): Promise<SessionData> { return input.session_data || {}; }
  async getWebhookActionAndData(input: any): Promise<WebhookActionResult> {
    return { action: PaymentActions.NOT_SUPPORTED };
  }
}

export default {
  services: [MercadoPagoProvider],
};