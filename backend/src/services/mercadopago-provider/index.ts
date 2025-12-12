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
    console.log("🔥 [MP-DEBUG] v8.0 - FINAL (MEMORIA)");

    try {
      // 1. URL Saneada
      let storeUrl = process.env.STORE_URL || "http://localhost:8000";
      if (!storeUrl.startsWith("http")) storeUrl = `http://${storeUrl}`;
      if (!storeUrl.includes("/ar") && !storeUrl.includes("localhost")) {
         if (storeUrl.endsWith("/")) storeUrl = storeUrl.slice(0, -1);
         storeUrl = `${storeUrl}/ar`;
      }
      if (storeUrl.endsWith("/")) storeUrl = storeUrl.slice(0, -1);

      // --- 2. LÓGICA INTELIGENTE DE ID ---
      // A) Intentamos obtener el ID fresco (Nueva Sesión)
      let resource_id = 
        input.resource_id || 
        input.context?.resource_id;

      // B) Si no hay ID fresco, buscamos en la memoria (Update Sesión)
      if (!resource_id && input.data && input.data.resource_id) {
        console.log("♻️ [MP-INFO] Recuperando ID de la memoria:", input.data.resource_id);
        resource_id = input.data.resource_id;
      }

      // C) Fallback de emergencia (Si fallan A y B, usamos ID de sesión o error)
      if (!resource_id) {
         resource_id = input.id; // Intentar usar ID de sesión "payses_..."
         console.warn("⚠️ [MP-WARN] ID no encontrado en input ni memoria. Usando Session ID:", resource_id);
      }
      
      const final_reference = resource_id || "error_fatal_no_id";

      // 3. Monto
      let amount = input.amount || input.context?.amount;
      if (typeof amount === 'string') amount = parseFloat(amount);
      if (!amount || isNaN(Number(amount))) amount = 1500; 

      const email = input.email || input.context?.email || "guest@test.com";
      const currency = input.currency_code || "ARS";

      // 4. Preferencia
      const preferenceData = {
        body: {
          items: [
            {
              id: final_reference,
              title: "Compra Tienda",
              quantity: 1,
              unit_price: Number(amount),
              currency_id: currency.toUpperCase(),
            },
          ],
          payer: { email: email },
          external_reference: final_reference,
          back_urls: {
            success: `${storeUrl}/checkout?step=payment&payment_status=success`,
            failure: `${storeUrl}/checkout?step=payment&payment_status=failure`,
            pending: `${storeUrl}/checkout?step=payment&payment_status=pending`,
          },
          auto_return: "approved",
        },
      };

      const preference = new Preference(this.mercadoPagoConfig);
      const response = await preference.create(preferenceData);

      if (!response.id) throw new Error("MP no devolvió ID");

      return {
        id: response.id!,
        data: {
          id: response.id!,
          init_point: response.init_point!, 
          sandbox_init_point: response.sandbox_init_point!,
          resource_id: final_reference // <--- 🔥 CLAVE: Guardamos el ID para el futuro
        },
      };

    } catch (error: any) {
      console.error("🔥 [MP-ERROR]", error);
      throw error;
    }
  }

  // --- BOILERPLATE ---
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
  async updatePayment(input: any): Promise<{ id: string, data: SessionData }> {
    return this.initiatePayment(input);
  }
  async getWebhookActionAndData(input: any): Promise<WebhookActionResult> {
    return { action: PaymentActions.NOT_SUPPORTED };
  }
}

export default {
  services: [MercadoPagoProvider],
};