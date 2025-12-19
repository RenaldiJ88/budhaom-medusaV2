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
    this.logger_.info(`🔥 [MP-INIT] Iniciando (Modo Simple)...`);
    
    // 1. OBTENER ID (Sin consultas complejas)
    // Preferimos cart_id si viene, sino usamos session_id (payses_)
    let resource_id = input.resource_id;

    if (!resource_id || !resource_id.startsWith("cart_")) {
        // Buscamos en lugares comunes
        resource_id = input.context?.cart_id || input.data?.session_id || input.id;
    }

    if (!resource_id) {
        resource_id = `fallback_${Date.now()}`;
        this.logger_.warn(`⚠️ [MP-WARN] No se halló ID. Usando Fallback: ${resource_id}`);
    } else {
        this.logger_.info(`🛒 [MP-DEBUG] Usando ID para referencia: ${resource_id}`);
    }

    // --- URLS ---
    let rawStoreUrl = process.env.STORE_URL || this.options_.store_url || "http://localhost:8000";
    if (rawStoreUrl.endsWith("/")) rawStoreUrl = rawStoreUrl.slice(0, -1);
    
    // URL Frontend
    const successUrl = `${rawStoreUrl}/checkout?step=payment&payment_status=success`;
    const failureUrl = `${rawStoreUrl}/checkout?step=payment&payment_status=failure`;
    const pendingUrl = `${rawStoreUrl}/checkout?step=payment&payment_status=pending`;

    // URL Webhook (Backend)
    let backendDomain = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.BACKEND_URL || "http://localhost:9000";
    if (!backendDomain.startsWith("http")) backendDomain = `https://${backendDomain}`;
    const cleanBackendUrl = backendDomain.endsWith("/") ? backendDomain.slice(0, -1) : backendDomain;
    const webhookUrl = `${cleanBackendUrl}/hooks/mp`;

    this.logger_.info(`🌐 [MP-DEBUG] Webhook apuntando a: ${webhookUrl}`);

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
        external_reference: resource_id, // Enviamos payses_... o cart_...
        notification_url: webhookUrl,
        back_urls: { success: successUrl, failure: failureUrl, pending: pendingUrl },
        auto_return: "approved",
        metadata: { 
            original_id: resource_id
        }
      },
    };

    try {
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

  // Métodos Boilerplate
  async updatePayment(input: any): Promise<{ id: string, data: SessionData }> { return this.initiatePayment(input); }
  async authorizePayment(input: any): Promise<{ status: PaymentSessionStatus; data: SessionData; }> { return { status: PaymentSessionStatus.AUTHORIZED, data: input.session_data || {} }; }
  async cancelPayment(input: any): Promise<SessionData> { return input.session_data || {}; }
  async capturePayment(input: any): Promise<SessionData> { return input.session_data || {}; }
  async deletePayment(input: any): Promise<SessionData> { return input.session_data || {}; }
  async getPaymentStatus(input: any): Promise<{ status: PaymentSessionStatus }> { return { status: PaymentSessionStatus.AUTHORIZED }; }
  async refundPayment(input: any): Promise<SessionData> { return input.session_data || {}; }
  async retrievePayment(input: any): Promise<SessionData> { return input.session_data || {}; }
  async getWebhookActionAndData(input: any): Promise<WebhookActionResult> { return { action: PaymentActions.NOT_SUPPORTED }; }
}

export default {
  services: [MercadoPagoProvider],
};