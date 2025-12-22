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
    this.logger_.info(`🔥 [MP-INIT] Iniciando proceso de pago...`);
    
    // 1. OBTENER ID
    let resource_id = input.data?.session_id || input.id || input.resource_id;
    if (!resource_id) {
        resource_id = `fallback_${Date.now()}`;
    }

    // 2. --- URLS HARDCODEADAS (SOLUCIÓN ERROR CELULAR) ---
    // Ponemos tu URL de Railway directo para evitar errores de localhost
    const HARDCODED_URL = "https://storefront-production-6152.up.railway.app";
    
    const successUrl = `${HARDCODED_URL}/ar/checkout?payment_status=approved`;
    const failureUrl = `${HARDCODED_URL}/ar/checkout?payment_status=failure`;
    const pendingUrl = `${HARDCODED_URL}/ar/checkout?payment_status=pending`;

    // URL Webhook (Backend)
    // Asegúrate de que esta sea la URL de tu BACKEND en Railway
    let backendUrl = process.env.RAILWAY_PUBLIC_DOMAIN || process.env.BACKEND_URL;
    if (!backendUrl) backendUrl = "https://backend-production-a7f0.up.railway.app"; // Pon tu URL de back real aquí si falla
    if (!backendUrl.startsWith("http")) backendUrl = `https://${backendUrl}`;
    const webhookUrl = `${backendUrl}/hooks/mp`;

    this.logger_.info(`🌐 [MP-DEBUG] URLs configuradas: Front: ${HARDCODED_URL} | Webhook: ${webhookUrl}`);

    // 3. --- PREPARAR ITEMS ---
    let amount = input.amount || input.context?.amount;
    if (!amount) amount = 100;
    
    const email = input.email || input.context?.email || "guest@budhaom.com";

    // Intentamos obtener los items reales del carrito si Medusa los envió en el contexto
    let itemsMp: any[] = [];

    // Verificamos si hay items en el input (depende de la versión de Medusa)
    const cartItems = input.context?.cart?.items || input.cart?.items;

    if (cartItems && Array.isArray(cartItems) && cartItems.length > 0) {
        this.logger_.info(`🛒 [MP-DEBUG] Enviando ${cartItems.length} items reales a MP`);
        
        itemsMp = cartItems.map((item: any) => ({
            id: item.variant_id || item.id,
            title: item.title,
            description: item.description || item.title,
            picture_url: item.thumbnail, // Esto hace que se vea la foto en la app
            quantity: Number(item.quantity),
            unit_price: Number(item.unit_price), // Medusa maneja unit_price igual que el total a veces
            currency_id: "ARS"
        }));
    } else {
        // Fallback: Si no hay info de items, mandamos el total genérico (Tu código anterior)
        this.logger_.info(`⚠️ [MP-DEBUG] No se detectaron items individuales, enviando total genérico.`);
        itemsMp = [{
            id: resource_id,
            title: "Compra en BUDHA.Om",
            quantity: 1,
            unit_price: Number(amount),
            currency_id: "ARS",
        }];
    }

    const preferenceData = {
      body: {
        items: itemsMp,
        payer: { email: email },
        external_reference: resource_id,
        notification_url: webhookUrl,
        back_urls: { 
            success: successUrl, 
            failure: failureUrl, 
            pending: pendingUrl 
        },
        auto_return: "approved",
        // Evita que MP pida loguearse obligatoriamente a veces
        binary_mode: true, 
        metadata: { 
            original_id: resource_id
        }
      },
    };

    try {
        const preference = new Preference(this.mercadoPagoConfig);
        const response = await preference.create(preferenceData);
        
        if (!response.id) throw new Error("Mercado Pago no devolvió ID");

        this.logger_.info(`✅ [MP-SUCCESS] Preferencia creada: ${response.id}`);

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

  // Boilerplate standard
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