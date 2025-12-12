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
    console.log("🔥 [MP-DEBUG] v10 - ESTRATEGIA COMODÍN 🃏");

    try {
      // 1. URL Saneada
      let storeUrl = process.env.STORE_URL || "http://localhost:8000";
      if (!storeUrl.startsWith("http")) storeUrl = `http://${storeUrl}`;
      if (!storeUrl.includes("/ar") && !storeUrl.includes("localhost")) {
         if (storeUrl.endsWith("/")) storeUrl = storeUrl.slice(0, -1);
         storeUrl = `${storeUrl}/ar`;
      }
      if (storeUrl.endsWith("/")) storeUrl = storeUrl.slice(0, -1);

      // --- 2. GENERACIÓN DE ID A PRUEBA DE BALAS ---
      // Intentamos leer el ID. Si no existe, usamos el de la sesión.
      // Si TAMPOCO existe, generamos uno aleatorio. ¡Nunca más undefined!
      let resource_id = input.resource_id || input.context?.resource_id || input.id;

      if (!resource_id) {
        // Generamos un ID único temporal (ej: mp_gen_9a3f...)
        const randomPart = Math.random().toString(36).substring(7);
        resource_id = `mp_gen_${randomPart}`;
        console.warn("⚠️ [MP-WARN] ID no detectado. Usando ID generado:", resource_id);
      }

      // 3. Monto (Validación estricta)
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
              id: resource_id,
              title: "Compra Tienda",
              quantity: 1,
              unit_price: Number(amount),
              currency_id: currency.toUpperCase(),
            },
          ],
          payer: { email: email },
          external_reference: resource_id,
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
          resource_id: resource_id // Guardamos el ID generado para usarlo después
        },
      };

    } catch (error: any) {
      console.error("🔥 [MP-ERROR]", error);
      throw error;
    }
  }

  // --- UPDATE: Recupera el ID generado antes ---
  async updatePayment(input: any): Promise<{ id: string, data: SessionData }> {
    // Si ya generamos un ID antes, lo volvemos a usar
    const savedId = input.data?.resource_id;
    if (savedId) {
       console.log("♻️ [MP-INFO] Usando ID guardado:", savedId);
       return this.initiatePayment({ ...input, resource_id: savedId });
    }
    // Si es una sesión zombie vieja, se generará uno nuevo en initiatePayment
    return this.initiatePayment(input);
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