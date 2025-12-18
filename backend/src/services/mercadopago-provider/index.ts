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

    // --- DIAGNÓSTICO CURSOR: ISSUE 1 (BÚSQUEDA PROFUNDA DE ID) ---
    // Cursor indica que input.resource_id suele ser la sesión (payses_) y no el carrito.
    // Buscamos activamente el cart_id en todas las propiedades posibles.

    let resource_id: string | undefined = undefined;

    const candidates = [
      input.resource_id,              // A veces es el carrito
      input.context?.resource_id,     // Contexto medusa v2
      input.context?.cart_id,         // Contexto explícito
      input.cart?.id,                 // Objeto cart directo
      input.payment_session?.cart_id, // Objeto sesión
      input.data?.cart_id,            // Data persistida
      input.data?.resource_id
    ];

    // Iteramos: Buscamos cualquier cosa que empiece con "cart_"
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.startsWith("cart_")) {
        resource_id = candidate;
        this.logger_.info(`🛒 [MP-DEBUG] Cart ID encontrado en input: ${resource_id}`);
        break; 
      }
    }

    // Si no encontramos "cart_", usamos el fallback (payses_)
    if (!resource_id) {
       const fallback = input.resource_id || input.id || input.data?.session_id;
       this.logger_.warn(`⚠️ [MP-WARN] No se halló 'cart_' en el input. Usando ID de Sesión: ${fallback}`);
       this.logger_.warn(`📦 [MP-DEBUG-DUMP] Input Keys: ${Object.keys(input).join(', ')}`);
       
       // Asignamos el fallback. Si esto es 'payses_', el Webhook tendrá que hacer trabajo extra.
       resource_id = fallback;
    }

    // Seguridad final
    if (!resource_id) {
        resource_id = `mp_fallback_${Date.now()}`;
    }

    try {
      // --- DIAGNÓSTICO CURSOR: ISSUE 2 (URLS DE RETORNO) ---
      // Aseguramos URLs limpias para evitar el 404 del Middleware
      
      let rawStoreUrl = process.env.STORE_URL || this.options_.store_url || "http://localhost:8000";
      if (rawStoreUrl.endsWith("/")) rawStoreUrl = rawStoreUrl.slice(0, -1);
      const baseUrlStr = `${rawStoreUrl}/checkout`;

      const successUrl = `${baseUrlStr}?step=payment&payment_status=success`;
      const failureUrl = `${baseUrlStr}?step=payment&payment_status=failure`;
      const pendingUrl = `${baseUrlStr}?step=payment&payment_status=pending`;

      // --- WEBHOOK URL (HTTPS FIX) ---
      let backendDomain = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.BACKEND_URL || "http://localhost:9000";
      if (!backendDomain.startsWith("http")) backendDomain = `https://${backendDomain}`;
      const cleanBackendUrl = backendDomain.endsWith("/") ? backendDomain.slice(0, -1) : backendDomain;
      const webhookUrl = `${cleanBackendUrl}/hooks/mp`;

      this.logger_.info(`🌐 [MP-DEBUG] Return URL: ${successUrl}`);
      this.logger_.info(`📡 [MP-DEBUG] Webhook URL: ${webhookUrl}`);

      // --- PREFERENCIA ---
      let amount = input.amount || input.context?.amount;
      if (!amount) amount = 100;
      const email = input.email || input.context?.email || "guest@budhaom.com";

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
          external_reference: resource_id, // MP devolverá esto en el Webhook
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
            // Guardamos ambos datos por seguridad
            cart_id: resource_id.startsWith("cart_") ? resource_id : "unknown",
            session_id: resource_id
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