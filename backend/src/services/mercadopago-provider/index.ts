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
      // 1. DETECCIÓN DE ID (Basado en tu LOG real)
      let resource_id = 
        input.resource_id || 
        input.context?.resource_id || 
        input.data?.session_id || // <--- ESTO ES LO QUE FALTABA (payses_...)
        input.id;

      if (!resource_id) {
        // Fallback de última instancia
        this.logger_.warn(`⚠️ [MP-WARN] ID no encontrado. Input: ${JSON.stringify(input)}`);
        resource_id = `mp_fallback_${Date.now()}`;
      } else {
        this.logger_.info(`🛒 [MP-DEBUG] ID Confirmado: ${resource_id}`);
      }

      // 2. CONSTRUCCIÓN DE URL SEGURA (Para evitar el 404)
      // Tomamos la variable de Railway
      const rawStoreUrl = process.env.STORE_URL || this.options_.store_url || "http://localhost:8000";
      
      // Usamos la API URL nativa para evitar errores de // dobles
      // Si rawStoreUrl ya tiene /ar, lo respetamos.
      const baseUrl = new URL(rawStoreUrl); 
      
      // Construimos las URLs de retorno
      // Nota: encodeURIComponent no es necesario para la base, pero Next.js debe manejar los params
      const successUrl = new URL("/checkout", baseUrl);
      successUrl.searchParams.set("step", "payment");
      successUrl.searchParams.set("payment_status", "success");

      const failureUrl = new URL("/checkout", baseUrl);
      failureUrl.searchParams.set("step", "payment");
      failureUrl.searchParams.set("payment_status", "failure");
      
      const pendingUrl = new URL("/checkout", baseUrl);
      pendingUrl.searchParams.set("step", "payment");
      pendingUrl.searchParams.set("payment_status", "pending");

      this.logger_.info(`🌐 [MP-DEBUG] Return URL: ${successUrl.toString()}`);

      // 3. DATOS MONETARIOS
      let amount = input.amount || input.context?.amount;
      if (!amount) amount = 100; // Seguridad

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
            success: successUrl.toString(),
            failure: failureUrl.toString(),
            pending: pendingUrl.toString(),
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