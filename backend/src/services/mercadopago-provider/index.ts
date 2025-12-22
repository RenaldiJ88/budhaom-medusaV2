import { 
  AbstractPaymentProvider, 
  PaymentSessionStatus, 
  PaymentActions 
} from "@medusajs/framework/utils";
import { 
  Logger, 
  WebhookActionResult 
} from "@medusajs/framework/types";
// AGREGAMOS 'Payment' AQUI EN LOS IMPORTS
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago';

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
    
    let resource_id = input.data?.session_id || input.id || input.resource_id;
    if (!resource_id) resource_id = `fallback_${Date.now()}`;

    // REEMPLAZA ESTO CON TU URL REAL DE RAILWAY
    const STORE_DOMAIN = "https://storefront-production-6152.up.railway.app";
    const BACKEND_DOMAIN = "https://backend-production-a7f0.up.railway.app"; 

    const successUrl = `${STORE_DOMAIN}/ar/checkout?payment_status=approved`;
    const failureUrl = `${STORE_DOMAIN}/ar/checkout?payment_status=failure`;
    const pendingUrl = `${STORE_DOMAIN}/ar/checkout?payment_status=pending`;
    const webhookUrl = `${BACKEND_DOMAIN}/hooks/mp`;

    let itemsMp: any[] = [];
    const cartItems = input.context?.cart?.items || input.cart?.items;

    if (cartItems && Array.isArray(cartItems) && cartItems.length > 0) {
        itemsMp = cartItems.map((item: any) => {
            let safePrice = 0;
            if (typeof item.unit_price === 'object' && item.unit_price !== null) {
                safePrice = Number(item.unit_price.amount || item.unit_price.value || 0);
            } else {
                safePrice = Number(item.unit_price);
            }
            if (isNaN(safePrice) || safePrice <= 0) safePrice = 100;

            return {
                id: item.variant_id || item.id,
                title: item.title || "Producto",
                quantity: Number(item.quantity) || 1,
                unit_price: safePrice, 
                currency_id: "ARS",
            };
        });
    } else {
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
        payer: { email: input.email || "guest_payer@test.com" },
        external_reference: resource_id,
        notification_url: webhookUrl,
        back_urls: { success: successUrl, failure: failureUrl, pending: pendingUrl },
        auto_return: "approved",
        binary_mode: true,
        metadata: { original_id: resource_id }
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

  async updatePayment(input: any): Promise<{ id: string, data: SessionData }> { return this.initiatePayment(input); }

  // --- 🛠️ LA SOLUCIÓN ESTÁ AQUÍ ---
  // Ahora "authorizePayment" no confía ciegamente, VERIFICA en MP.
  async authorizePayment(input: any): Promise<{ status: PaymentSessionStatus; data: SessionData; }> { 
      const sessionData = input.session_data || {};
      const resourceId = sessionData.resource_id;

      // Si no tenemos ID, seguimos pendientes
      if (!resourceId) {
        return { status: PaymentSessionStatus.PENDING, data: sessionData };
      }

      try {
        // Consultamos a Mercado Pago: "¿Existe un pago aprobado para este ID?"
        const payment = new Payment(this.mercadoPagoConfig);
        const searchResult = await payment.search({ options: { external_reference: resourceId }});
        
        // Buscamos si alguno de los resultados está APROBADO
        const approvedPayment = searchResult.results?.find((p) => p.status === 'approved');

        if (approvedPayment) {
           this.logger_.info(`✅ [MP-AUTH] Pago verificado: ${approvedPayment.id}. Autorizando sesión.`);
           return { 
             status: PaymentSessionStatus.AUTHORIZED, 
             data: { ...sessionData, mp_payment_id: approvedPayment.id } 
           };
        }
      } catch (err) {
         this.logger_.error(`⚠️ [MP-AUTH-CHECK] Error verificando estado: ${err}`);
      }

      // Si falló la verificación o no está aprobado aún, devolvemos PENDING
      return { 
          status: PaymentSessionStatus.PENDING, 
          data: sessionData 
      }; 
  }

  async cancelPayment(input: any): Promise<SessionData> { return input.session_data || {}; }
  async capturePayment(input: any): Promise<SessionData> { return input.session_data || {}; }
  async deletePayment(input: any): Promise<SessionData> { return input.session_data || {}; }
  
  // Mantenemos esto en PENDING por defecto, salvo que queramos hacer la misma verificación que arriba
  async getPaymentStatus(input: any): Promise<{ status: PaymentSessionStatus }> { 
      return { status: PaymentSessionStatus.PENDING }; 
  }
  
  async refundPayment(input: any): Promise<SessionData> { return input.session_data || {}; }
  async retrievePayment(input: any): Promise<SessionData> { return input.session_data || {}; }
  async getWebhookActionAndData(input: any): Promise<WebhookActionResult> { return { action: PaymentActions.NOT_SUPPORTED }; }
}

export default {
  services: [MercadoPagoProvider],
};