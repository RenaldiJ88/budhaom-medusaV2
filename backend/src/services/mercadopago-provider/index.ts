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
    console.log("🔥 [MP-DEBUG] v6.0 - BUSCANDO EL ID PERDIDO");
    
    // --- CHIVATO DE DATOS (Para ver qué nos manda Medusa realmente) ---
    // Esto imprimirá en tu terminal las llaves del objeto input
    try {
      console.log("🔥 [MP-DATA] Keys recibidas:", Object.keys(input));
      if (input.context) console.log("🔥 [MP-DATA] Context keys:", Object.keys(input.context));
      // console.log("🔥 [MP-DATA] FULL INPUT:", JSON.stringify(input)); // Descomentar solo si es necesario
    } catch (e) { console.log("Error logueando input"); }

    try {
      let storeUrl = process.env.STORE_URL || "http://localhost:8000";
      if (!storeUrl.startsWith("http")) storeUrl = `http://${storeUrl}`;
      if (!storeUrl.includes("/ar") && !storeUrl.includes("localhost")) {
         if (storeUrl.endsWith("/")) storeUrl = storeUrl.slice(0, -1);
         storeUrl = `${storeUrl}/ar`;
      }
      if (storeUrl.endsWith("/")) storeUrl = storeUrl.slice(0, -1);

      // --- ESTRATEGIA DE BÚSQUEDA DE ID ---
      // 1. Buscamos el resource_id estándar
      let resource_id = input.resource_id || input.context?.resource_id;

      // 2. Si falla, buscamos en lugares exóticos de Medusa v2
      if (!resource_id) resource_id = input.payment_collection_id || input.data?.resource_id;

      // 3. (EL SALVAVIDAS) Si sigue sin haber ID de carrito, usamos el ID de la sesión de pago
      // Esto asegura que SIEMPRE haya una referencia válida
      if (!resource_id) {
        console.warn("⚠️ [MP-WARN] No se encontró Cart ID. Usando Payment Session ID como fallback.");
        resource_id = input.id; // Ej: "payses_01..."
      }

      console.log(`🔥 [MP-DEBUG] REFERENCIA FINAL A USAR: ${resource_id}`);

      // Validación final para no mandar "undefined" a MP
      const final_reference = resource_id || "error_id_fatal";

      // --- MONTO ---
      let amount = input.amount || input.context?.amount || input.data?.amount;
      if (typeof amount === 'string') amount = parseFloat(amount);
      if (!amount || isNaN(Number(amount))) amount = 1500; 

      const email = input.email || input.context?.email || "guest@test.com";
      const currency = input.currency_code || "ARS";

      // --- PREFERENCIA ---
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
          external_reference: final_reference, // <--- Aquí va el ID recuperado
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