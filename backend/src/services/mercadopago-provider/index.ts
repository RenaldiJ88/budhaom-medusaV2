import { 
  AbstractPaymentProvider, 
  PaymentSessionStatus, 
  PaymentActions 
} from "@medusajs/utils";

import { 
  Logger, 
  WebhookActionResult
} from "@medusajs/types";

import { MercadoPagoConfig, Preference } from 'mercadopago';

type Options = {
  access_token: string;
  public_key?: string;
  webhook_url?: string;
};

// Usamos Record<string, unknown> para máxima compatibilidad con Medusa V2
type SessionData = Record<string, unknown>;

class MercadoPagoProvider extends AbstractPaymentProvider<SessionData> {
  static identifier = "mercadopago";

  protected options_: Options;
  protected logger_: Logger;
  protected mercadoPagoConfig: MercadoPagoConfig;

  constructor(container: any, options: Options) {
    // @ts-ignore
    super(container, options); 
    this.options_ = options;
    this.logger_ = container.logger;

    const token = options.access_token || process.env.MERCADOPAGO_ACCESS_TOKEN || "NO_TOKEN";
    this.mercadoPagoConfig = new MercadoPagoConfig({
      accessToken: token,
    });
  }

  async initiatePayment(input: any): Promise<{ id: string, data: SessionData }> {
    // Log seguro (1 solo argumento)
    const inputInfo = input ? Object.keys(input).join(",") : "sin datos";
    this.logger_.info(`🔥 [MP-DEBUG] Iniciando pago. Keys: ${inputInfo}`);

    try {
      // 1. URL Saneada
      let storeUrl = process.env.STORE_URL || "http://localhost:8000";
      if (!storeUrl.startsWith("http")) storeUrl = `http://${storeUrl}`;

      if (!storeUrl.includes("/ar") && !storeUrl.includes("localhost")) {
         if (storeUrl.endsWith("/")) storeUrl = storeUrl.slice(0, -1);
         storeUrl = `${storeUrl}/ar`;
      }
      if (storeUrl.endsWith("/")) storeUrl = storeUrl.slice(0, -1);

      // 2. URL Webhook
      let webhookUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.STORE_URL || "http://localhost:8000";
      if (!webhookUrl.startsWith("http")) webhookUrl = `https://${webhookUrl}`;
      if (webhookUrl.endsWith("/")) webhookUrl = webhookUrl.slice(0, -1);
      webhookUrl = `${webhookUrl}/api/webhooks/mercadopago`;

      // 3. Obtener ID (Estrategia defensiva)
      const cartId = input.context?.cart_id || input.cart_id || input.resource_id || input.id;

      if (!cartId) {
        this.logger_.error(`❌ [MP-ERROR] No se pudo obtener cart_id. Input: ${JSON.stringify(input)}`);
        throw new Error("No se pudo obtener el cart_id");
      }

      this.logger_.info(`📦 [MP-INFO] Cart ID: ${cartId}`);

      // 4. Monto
      let amount = input.amount || input.context?.amount;
      if (typeof amount === 'object' && amount !== null && 'value' in amount) {
        amount = amount.value;
      }
      amount = Number(amount);

      if (isNaN(amount) || amount <= 0) {
        this.logger_.warn(`⚠️ [MP-WARN] Monto inválido (${amount}). Usando 100.`);
        amount = 100; 
      }

      // 5. Preferencia
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
            success: `${storeUrl}/checkout?step=payment&payment_status=success`,
            failure: `${storeUrl}/checkout?step=payment&payment_status=failure`,
            pending: `${storeUrl}/checkout?step=payment&payment_status=pending`,
          },
          auto_return: "approved",
        },
      };

      this.logger_.info(`🔔 [MP-INFO] Creando pref. Webhook: ${webhookUrl}`);

      const preference = new Preference(this.mercadoPagoConfig);
      const response = await preference.create(preferenceData);

      if (!response.id) throw new Error("MP no devolvió ID");

      this.logger_.info(`✅ [MP-SUCCESS] ID: ${response.id}`);

      // Retorno LIMPIO (sin objetos raros para que Postgres no explote)
      return {
        id: response.id!,
        data: {
          id: response.id!,
          init_point: response.init_point!, 
          resource_id: cartId, 
          external_reference: cartId
        },
      };

    } catch (error: any) {
      this.logger_.error(`🔥 [MP-CRASH] ${error.message}`);
      throw error;
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