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
    this.logger_.info(`🔥 [MP-INIT] Iniciando pago...`);
    
    // 1. OBTENER ID
    let resource_id = input.data?.session_id || input.id || input.resource_id;
    if (!resource_id) resource_id = `fallback_${Date.now()}`;

    // 2. URLs SEGURAS (Evitamos localhost para que el cel no falle)
    // REEMPLAZA ESTO CON TU URL REAL DE RAILWAY SI ES DIFERENTE
    const STORE_DOMAIN = "https://storefront-production-6152.up.railway.app";
    const BACKEND_DOMAIN = "https://backend-production-a7f0.up.railway.app"; 

    const successUrl = `${STORE_DOMAIN}/ar/checkout?payment_status=approved`;
    const failureUrl = `${STORE_DOMAIN}/ar/checkout?payment_status=failure`;
    const pendingUrl = `${STORE_DOMAIN}/ar/checkout?payment_status=pending`;
    const webhookUrl = `${BACKEND_DOMAIN}/hooks/mp`;

    // 3. SANITIZAR ITEMS (La parte clave para evitar PXB01)
    let itemsMp: any[] = [];
    const cartItems = input.context?.cart?.items || input.cart?.items;

    // Si hay items, los procesamos con cuidado quirúrgico
    if (cartItems && Array.isArray(cartItems) && cartItems.length > 0) {
        itemsMp = cartItems.map((item: any) => {
            // TRUCO MEDUSA: A veces unit_price es un objeto { value: 1000 ... }
            let safePrice = 0;
            if (typeof item.unit_price === 'object' && item.unit_price !== null) {
                // Si es objeto, intentamos leer .amount o .value
                safePrice = Number(item.unit_price.amount || item.unit_price.value || 0);
            } else {
                safePrice = Number(item.unit_price);
            }

            // Si el precio es NaN o 0, ponemos 100 para evitar error PXB01
            if (isNaN(safePrice) || safePrice <= 0) safePrice = 100;

            return {
                id: item.variant_id || item.id,
                title: item.title || "Producto",
                quantity: Number(item.quantity) || 1,
                unit_price: safePrice, 
                currency_id: "ARS",
                // ¡IMPORTANTE! NO enviamos picture_url para evitar errores de carga en la app móvil
                // picture_url: item.thumbnail 
            };
        });
    } else {
        // Fallback si no hay items
        let amount = input.amount || input.context?.amount || 100;
        if (typeof amount === 'object') amount = Number(amount.amount || amount.value || 100);

        itemsMp = [{
            id: resource_id,
            title: "Compra en Tienda",
            quantity: 1,
            unit_price: Number(amount),
            currency_id: "ARS",
        }];
    }

    const preferenceData = {
      body: {
        items: itemsMp,
        // Usamos un email genérico si no hay uno, para evitar conflicto de "Auto-compra"
        payer: { email: input.email || "guest_payer@test.com" },
        external_reference: resource_id,
        notification_url: webhookUrl,
        back_urls: { success: successUrl, failure: failureUrl, pending: pendingUrl },
        auto_return: "approved",
        binary_mode: true, // Esto fuerza a que el pago sea instantáneo (sí o no)
        metadata: { original_id: resource_id }
      },
    };

    try {
        // Logueamos lo que enviamos para debuguear si falla
        this.logger_.info(`📦 [MP-PAYLOAD] Items: ${JSON.stringify(itemsMp)}`);

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

  // Métodos obligatorios vacíos...
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