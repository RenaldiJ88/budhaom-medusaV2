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
    this.logger_.info(`🔥 [MP-INIT] Procesando solicitud...`);

    try {
      // --- 1. DETECCIÓN INTELIGENTE DE ID DE CARRITO (FIX CRÍTICO) ---
      // Buscamos explícitamente un ID que empiece con "cart_"
      let resource_id = input.resource_id;

      // Si el resource_id actual NO es un carrito (es una sesión o undefined), buscamos más profundo
      if (!resource_id || !resource_id.startsWith("cart_")) {
         // Intentamos sacar el cart_id del contexto o de la sesión
         resource_id = 
            input.context?.cart_id || 
            input.cart?.id ||
            input.context?.resource_id; // A veces el resource_id sí es el carrito
      }

      // Si seguimos sin encontrar un "cart_", usamos el ID que tengamos pero avisamos
      if (!resource_id) {
         // Último recurso: Usamos el ID de sesión, pero esto podría fallar al crear la orden
         resource_id = input.id || input.data?.session_id; 
         this.logger_.warn(`⚠️ [MP-WARN] Usando ID de Sesión (${resource_id}) porque no se halló Cart ID.`);
      } else {
         this.logger_.info(`🛒 [MP-DEBUG] Cart ID Correcto detectado: ${resource_id}`);
      }

      // --- 2. URL FRONTEND ---
      let rawStoreUrl = process.env.STORE_URL || this.options_.store_url || "http://localhost:8000";
      if (rawStoreUrl.endsWith("/")) rawStoreUrl = rawStoreUrl.slice(0, -1);
      const baseUrlStr = `${rawStoreUrl}/checkout`;

      const successUrl = `${baseUrlStr}?step=payment&payment_status=success`;
      const failureUrl = `${baseUrlStr}?step=payment&payment_status=failure`;
      const pendingUrl = `${baseUrlStr}?step=payment&payment_status=pending`;

      // --- 3. URL WEBHOOK (HTTPS FIX) ---
      let backendDomain = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.BACKEND_URL || "http://localhost:9000";
      if (!backendDomain.startsWith("http")) backendDomain = `https://${backendDomain}`; // Force HTTPS
      
      const cleanBackendUrl = backendDomain.endsWith("/") ? backendDomain.slice(0, -1) : backendDomain;
      const webhookUrl = `${cleanBackendUrl}/hooks/mp`;

      this.logger_.info(`🌐 [MP-DEBUG] Return URL: ${successUrl}`);
      this.logger_.info(`📡 [MP-DEBUG] Webhook URL: ${webhookUrl}`);

      // --- 4. PREFERENCIA ---
      let amount = input.amount || input.context?.amount;
      if (!amount) amount = 100;
      const email = input.email || input.context?.email || "guest@budhaom.com";

      const preferenceData = {
        body: {
          items: [
            {
              id: resource_id, // Aquí va el Cart ID
              title: "Compra en BUDHA.Om",
              quantity: 1,
              unit_price: Number(amount),
              currency_id: "ARS",
            },
          ],
          payer: { email: email },
          external_reference: resource_id, // CLAVE: Esto es lo que el Webhook usará para cerrar la orden
          notification_url: webhookUrl,
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
          metadata: {
            cart_id: resource_id // Respaldo extra
          }
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