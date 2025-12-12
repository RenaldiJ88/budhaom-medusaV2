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
    console.log("🔥 [MP-DEBUG] v7.0 - MODO ESPÍA ACTIVO");

    try {
      // 1. URL Saneada
      let storeUrl = process.env.STORE_URL || "http://localhost:8000";
      if (!storeUrl.startsWith("http")) storeUrl = `http://${storeUrl}`;
      if (!storeUrl.includes("/ar") && !storeUrl.includes("localhost")) {
         if (storeUrl.endsWith("/")) storeUrl = storeUrl.slice(0, -1);
         storeUrl = `${storeUrl}/ar`;
      }
      if (storeUrl.endsWith("/")) storeUrl = storeUrl.slice(0, -1);

      // 2. BUSCANDO EL ID (O ESPIANDO LAS LLAVES)
      // Primero intentamos lo obvio
      let resource_id = 
        input.resource_id || 
        input.context?.resource_id || 
        input.id; // El ID de la sesión

      // --- TRUCO DE MAGIA: Si no hay ID, imprimimos las llaves en la referencia ---
      if (!resource_id) {
        // Sacamos una foto de qué diablos tiene el objeto 'input'
        const keys = Object.keys(input || {}).join('_');
        const contextKeys = input.context ? Object.keys(input.context).join('_') : 'no_ctx';
        
        // Creamos un string de debug para leer en la URL
        // Ej: "DEBUG_email_amount_currency_no_ctx"
        resource_id = `DEBUG_K_${keys}_C_${contextKeys}`.substring(0, 60); 
        
        console.warn("⚠️ [MP-WARN] ID no encontrado. Modo Debug activado:", resource_id);
      }

      // Fallback final por si explota el debug
      const final_reference = resource_id || "error_total";

      // 3. Monto y Email
      let amount = input.amount || input.context?.amount;
      if (typeof amount === 'string') amount = parseFloat(amount);
      if (!amount || isNaN(Number(amount))) amount = 1500; 

      const email = input.email || input.context?.email || "guest@test.com";
      const currency = input.currency_code || "ARS";

      // 4. Crear Preferencia
      const preferenceData = {
        body: {
          items: [
            {
              id: final_reference,
              title: "Compra Debug",
              quantity: 1,
              unit_price: Number(amount),
              currency_id: currency.toUpperCase(),
            },
          ],
          payer: { email: email },
          external_reference: final_reference, // <--- Aquí veremos la info
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
          resource_id: final_reference 
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