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
// Importamos Modules para intentar acceder al servicio de pagos
import { Modules } from "@medusajs/framework/utils";

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
  protected container_: any;

  constructor(container: any, options: Options) {
    super(container, options); 
    this.container_ = container; 
    this.options_ = options;
    this.logger_ = container.logger;
    this.mercadoPagoConfig = new MercadoPagoConfig({
      accessToken: options.access_token,
    });
  }

  async initiatePayment(input: any): Promise<{ id: string, data: SessionData }> {
    this.logger_.info(`🔥 [MP-INIT] Iniciando...`);
    
    // 1. OBTENER ID DE SESIÓN
    const sessionId = input.data?.session_id || input.id;
    let resource_id = sessionId; 

    // 2. INTENTO DE RECUPERACIÓN DE CARRITO (Con protección Anti-Crash)
    if (sessionId && sessionId.startsWith("payses_")) {
        try {
            // Intentamos resolver el Módulo de Pagos en lugar de RemoteQuery crudo
            // Si esto falla, el catch lo atrapa y seguimos.
            if (this.container_.resolve) {
                 // Nota: Esto es experimental. Si falla, no pasa nada gracias al catch.
                 const paymentModule = this.container_.resolve(Modules.PAYMENT);
                 // No intentamos llamar nada complejo para no romper, solo chequeamos si existe.
            }
        } catch (error) {
            this.logger_.warn(`⚠️ [MP-DB] No se pudo consultar la DB (No es crítico si el Front se arregla): ${error}`);
        }
    } 

    // Búsqueda en inputs estándar (Si el Middleware funciona, esto DEBERÍA traer el cart_id)
    if (input.resource_id?.startsWith("cart_")) resource_id = input.resource_id;
    if (input.context?.cart_id) {
        resource_id = input.context.cart_id;
        this.logger_.info(`📦 [MP-CTX] ¡Cart ID recuperado del contexto!: ${resource_id}`);
    }

    if (!resource_id || !resource_id.startsWith("cart_")) {
        // Si llegamos acá, usaremos el payses_id. 
        // El Webhook fallará al crear la orden, PERO el pago se procesará en MP.
        this.logger_.warn(`⚠️ [MP-WARN] Usando Session ID: ${resource_id}. (Arregla el Middleware para tener Cart ID)`);
    }

    // --- URLS ---
    let rawStoreUrl = process.env.STORE_URL || this.options_.store_url || "http://localhost:8000";
    if (rawStoreUrl.endsWith("/")) rawStoreUrl = rawStoreUrl.slice(0, -1);
    
    const baseUrlStr = `${rawStoreUrl}/checkout`;
    const successUrl = `${baseUrlStr}?step=payment&payment_status=success`;
    const failureUrl = `${baseUrlStr}?step=payment&payment_status=failure`;
    const pendingUrl = `${baseUrlStr}?step=payment&payment_status=pending`;

    let backendDomain = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.BACKEND_URL || "http://localhost:9000";
    if (!backendDomain.startsWith("http")) backendDomain = `https://${backendDomain}`;
    const cleanBackendUrl = backendDomain.endsWith("/") ? backendDomain.slice(0, -1) : backendDomain;
    const webhookUrl = `${cleanBackendUrl}/hooks/mp`;

    this.logger_.info(`🌐 [MP-DEBUG] Return: ${successUrl}`);

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
        external_reference: resource_id,
        notification_url: webhookUrl,
        back_urls: { success: successUrl, failure: failureUrl, pending: pendingUrl },
        auto_return: "approved",
        metadata: { cart_id: resource_id }
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

  // Boilerplate
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