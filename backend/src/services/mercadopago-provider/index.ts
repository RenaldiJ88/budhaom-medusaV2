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
    console.log("🔥 [MP-DEBUG] v9.0 - INICIANDO (Create/Update)...");

    try {
      // 1. URL Saneada
      let storeUrl = process.env.STORE_URL || "http://localhost:8000";
      if (!storeUrl.startsWith("http")) storeUrl = `http://${storeUrl}`;
      if (!storeUrl.includes("/ar") && !storeUrl.includes("localhost")) {
         if (storeUrl.endsWith("/")) storeUrl = storeUrl.slice(0, -1);
         storeUrl = `${storeUrl}/ar`;
      }
      if (storeUrl.endsWith("/")) storeUrl = storeUrl.slice(0, -1);

      // --- 2. BÚSQUEDA DE ID ---
      // Buscamos el ID en la entrada estándar (Create)
      let resource_id = input.resource_id || input.context?.resource_id;

      // Si no viene (es un Update), buscamos si lo guardamos antes en la data
      if (!resource_id && input.data?.resource_id) {
        resource_id = input.data.resource_id;
        console.log("♻️ [MP-INFO] ID recuperado de la memoria:", resource_id);
      }

      // Si sigue sin aparecer, usamos el ID de la sesión como último recurso
      if (!resource_id) {
         resource_id = input.id; 
         console.warn("⚠️ [MP-WARN] Usando Session ID como fallback:", resource_id);
      }

      // VALIDACIÓN FINAL: Si esto sigue vacío, es un error fatal.
      const final_reference = resource_id || "error_fatal_v9";

      // 3. Monto
      let amount = input.amount || input.context?.amount;
      if (typeof amount === 'string') amount = parseFloat(amount);
      if (!amount || isNaN(Number(amount))) amount = 1500; 

      const email = input.email || input.context?.email || "guest@test.com";
      const currency = input.currency_code || "ARS";

      // 4. Preferencia MP
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
          external_reference: final_reference, // <--- Aquí va el ID
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
          resource_id: final_reference // 🔥 GUARDAMOS EL ID PARA SIEMPRE
        },
      };

    } catch (error: any) {
      console.error("🔥 [MP-ERROR]", error);
      throw error;
    }
  }

  // --- 🔥 LA CLAVE: UPDATE PAYMENT CON AUTODESTRUCCIÓN ---
  async updatePayment(input: any): Promise<{ id: string, data: SessionData }> {
    console.log("🔥 [MP-DEBUG] Intentando UPDATE de sesión...");
    
    // Verificamos si esta sesión tiene un ID guardado
    const savedId = input.data?.resource_id;

    if (!savedId) {
      // SI NO TIENE ID, ES UNA SESIÓN ZOMBIE 🧟‍♂️
      console.error("🔥 [MP-CRITICAL] ¡Sesión Zombie detectada! Forzando error para regenerar.");
      throw new Error("INVALID_SESSION_DATA"); 
    }

    // Si tiene ID, inyectamos el ID recuperado y procedemos
    const newInput = {
      ...input,
      resource_id: savedId 
    };
    
    return this.initiatePayment(newInput);
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
  async getWebhookActionAndData(input: any): Promise<WebhookActionResult> {
    return { action: PaymentActions.NOT_SUPPORTED };
  }
}

export default {
  services: [MercadoPagoProvider],
};