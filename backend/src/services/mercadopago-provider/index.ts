import { 
  AbstractPaymentProvider, 
  PaymentSessionStatus, 
  PaymentActions 
} from "@medusajs/framework/utils";
import { 
  Logger, 
  WebhookActionResult 
} from "@medusajs/framework/types";
import { MercadoPagoConfig, Preference } from 'mercadopago';

type Options = {
  access_token: string;
  public_key?: string;
  store_url?: string;
};

type SessionData = Record<string, unknown>;

class MercadoPagoProvider extends AbstractPaymentProvider<SessionData> {
  static identifier = "mercadopago";
  
  protected options_: Options;
  protected logger_: Logger;
  protected mercadoPagoConfig: MercadoPagoConfig;

  constructor(container: any, options: Options) {
    super(container, options); 
    this.options_ = options;
    this.logger_ = container.logger;
    this.mercadoPagoConfig = new MercadoPagoConfig({
      accessToken: options.access_token,
    });
  }

  async initiatePayment(input: any): Promise<{ id: string, data: SessionData }> {
    this.logger_.info(`🔥 [MP-INIT] Procesando solicitud de pago...`);

    try {
      // 1. DETECCIÓN DE ID
      let resource_id = 
        input.resource_id || 
        input.context?.resource_id || 
        input.data?.session_id || 
        input.id;

      if (!resource_id) {
        this.logger_.warn(`⚠️ [MP-WARN] ID no encontrado. Input: ${JSON.stringify(input)}`);
        resource_id = `mp_fallback_${Date.now()}`;
      } else {
        this.logger_.info(`🛒 [MP-DEBUG] ID Confirmado: ${resource_id}`);
      }

      // 2. CONSTRUCCIÓN DE URL (CORREGIDO: Concatenación manual)
      // Tomamos la variable de Railway tal cual está (con /ar)
      let rawStoreUrl = process.env.STORE_URL || this.options_.store_url || "http://localhost:8000";
      
      // Quitamos barra final si existe para que la unión quede limpia
      if (rawStoreUrl.endsWith("/")) rawStoreUrl = rawStoreUrl.slice(0, -1);
      
      // 🔥 AQUÍ ESTABA EL ERROR: Ahora pegamos el /checkout manualmente
      // Esto garantiza que quede: https://.../ar/checkout
      const baseUrlStr = `${rawStoreUrl}/checkout`;

      // Construimos las URLs finales agregando los parámetros
      const successUrl = `${baseUrlStr}?step=payment&payment_status=success`;
      const failureUrl = `${baseUrlStr}?step=payment&payment_status=failure`;
      const pendingUrl = `${baseUrlStr}?step=payment&payment_status=pending`;

      this.logger_.info(`🌐 [MP-DEBUG] Return URL FINAL: ${successUrl}`);

      // 3. DATOS MONETARIOS
      let amount = input.amount || input.context?.amount;
      if (!amount) amount = 100;

      const email = input.email || input.context?.email || "guest@budhaom.com";

      // 4. PREFERENCIA
      const preferenceData = {
        body: {
          items: [
            {
              id: resource_id,
              title: "Compra en BUDHA.Om",
              quantity: 1,
              unit_price: Number(amount),
              currency_id: "ARS",
            },
          ],
          payer: { email: email },
          external_reference: resource_id,
          
          back_urls: {
            success: successUrl,
            failure: failureUrl,
            pending: pendingUrl,
          },
          auto_return: "approved",
          shipments: {
            mode: "not_specified",
            local_pickup: true, 
          },
        },
      };

      const preference = new Preference(this.mercadoPagoConfig);
      const response = await preference.create(preferenceData);

      if (!response.id) throw new Error("Mercado Pago no devolvió ID");

      return {
        id: response.id!,
        data: {
          id: response.id!,
          init_point: response.init_point!, 
          resource_id: resource_id 
        },
      };

    } catch (error: any) {
      this.logger_.error(`🔥 [MP-ERROR]: ${error.message}`);
      throw error;
    }
  }

  async updatePayment(input: any): Promise<{ id: string, data: SessionData }> {
    return this.initiatePayment(input);
  }

  // Boilerplate
  async authorizePayment(input: any): Promise<{ status: PaymentSessionStatus; data: SessionData; }> {
    return { status: PaymentSessionStatus.AUTHORIZED, data: input.session_data || {} };
  }
  async cancelPayment(input: any): Promise<SessionData> { return input.session_data || {}; }
  async capturePayment(input: any): Promise<SessionData> { return input.session_data || {}; }
  async deletePayment(input: any): Promise<SessionData> { return input.session_data || {}; }
  async getPaymentStatus(input: any): Promise<{ status: PaymentSessionStatus }> { return { status: PaymentSessionStatus.AUTHORIZED }; }
  async refundPayment(input: any): Promise<SessionData> { return input.session_data || {}; }
  async retrievePayment(input: any): Promise<SessionData> { return input.session_data || {}; }
  async getWebhookActionAndData(input: any): Promise<WebhookActionResult> {
    return { action: PaymentActions.NOT_SUPPORTED };
  }
}

export default {
  services: [MercadoPagoProvider],
};