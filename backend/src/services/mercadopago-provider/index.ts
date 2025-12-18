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

// 🔥 IMPORTANTE: Necesitamos esto para consultar la DB
import { ContainerRegistrationKeys } from "@medusajs/framework/utils";

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
  protected container_: any; // Guardamos el container para usarlo después

  constructor(container: any, options: Options) {
    super(container, options); 
    this.container_ = container; // <--- Guardamos referencia al sistema
    this.options_ = options;
    this.logger_ = container.logger;
    this.mercadoPagoConfig = new MercadoPagoConfig({
      accessToken: options.access_token,
    });
  }

  async initiatePayment(input: any): Promise<{ id: string, data: SessionData }> {
    this.logger_.info(`🔥 [MP-INIT] Procesando solicitud (Modo Experto)...`);

    // 1. INTENTAR OBTENER ID DEL INPUT (Método Rápido)
    let resource_id = input.resource_id; // Generalmente es payses_...

    // 2. ESTRATEGIA "STRIPE": CONSULTAR LA BASE DE DATOS
    // Si tenemos una sesión (payses_), buscamos su carrito asociado en la DB.
    
    let cartIdReal: string | undefined = undefined;

    // Buscamos si ya vino en el input (poco probable según tus logs)
    const candidates = [
        input.resource_id, input.context?.cart_id, input.cart?.id, input.data?.cart_id
    ];
    for (const c of candidates) {
        if (typeof c === 'string' && c.startsWith("cart_")) {
            cartIdReal = c;
            break;
        }
    }

    // SI NO LO ENCONTRAMOS, USAMOS LA ARTILLERÍA PESADA (REMOTE QUERY)
    if (!cartIdReal && resource_id && resource_id.startsWith("payses_")) {
        this.logger_.info(`🕵️‍♂️ [MP-DB] Consultando DB para sesión: ${resource_id}`);
        
        try {
            // Invocamos al Remote Query (El motor de búsqueda de Medusa v2)
            const remoteQuery = this.container_.resolve(ContainerRegistrationKeys.REMOTE_QUERY);
            
            // Query: "Dame el payment_collection de esta sesión, y de ahí dame el cart_id"
            const query = {
                entryPoint: "payment_session",
                fields: ["payment_collection.cart_id"],
                filters: { id: resource_id }
            };

            const result = await remoteQuery(query);
            
            // El resultado es un array. Sacamos el cart_id.
            const fetchedCartId = result[0]?.payment_collection?.cart_id;

            if (fetchedCartId) {
                cartIdReal = fetchedCartId;
                this.logger_.info(`🎯 [MP-DB] ¡EUREKA! Carrito encontrado en DB: ${cartIdReal}`);
            } else {
                this.logger_.warn(`⚠️ [MP-DB] La DB no devolvió cart_id para esta sesión.`);
            }

        } catch (error) {
            this.logger_.error(`❌ [MP-DB-ERROR] Falló la consulta a DB: ${error}`);
        }
    }

    // Si falló todo, usamos el resource_id original (payses_) y rezamos
    const finalId = cartIdReal || resource_id || `fallback_${Date.now()}`;
    
    this.logger_.info(`🛒 [MP-FINAL] ID Vinculado para Webhook: ${finalId}`);

    // --- CONFIGURACIÓN DE URLS Y PREFERENCIA ---
    // (Esto ya funcionaba bien, lo mantenemos igual)
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

    let amount = input.amount || input.context?.amount;
    if (!amount) amount = 100;
    const email = input.email || input.context?.email || "guest@budhaom.com";

    const preferenceData = {
      body: {
        items: [
          {
            id: finalId,
            title: "Compra en BUDHA.Om",
            quantity: 1,
            unit_price: Number(amount),
            currency_id: "ARS",
          },
        ],
        payer: { email: email },
        external_reference: finalId, // <--- AHORA SÍ SERÁ EL CART_ID
        notification_url: webhookUrl,
        back_urls: {
          success: successUrl,
          failure: failureUrl,
          pending: pendingUrl,
        },
        auto_return: "approved",
        metadata: {
          cart_id: finalId
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
        resource_id: finalId 
      },
    };
  }

  // ... Resto de métodos (authorizePayment, updatePayment, etc) IGUAL QUE ANTES ...
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