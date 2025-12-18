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
// 🔥 IMPORTANTE: Importamos las llaves para acceder a la Base de Datos
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
  protected container_: any;

  constructor(container: any, options: Options) {
    super(container, options); 
    this.container_ = container; // Guardamos el container para poder consultar la DB
    this.options_ = options;
    this.logger_ = container.logger;
    this.mercadoPagoConfig = new MercadoPagoConfig({
      accessToken: options.access_token,
    });
  }

  async initiatePayment(input: any): Promise<{ id: string, data: SessionData }> {
    this.logger_.info(`🔥 [MP-INIT] Iniciando...`);
    
    // 1. OBTENER ID DE SESIÓN (payses_)
    // Tu log confirmó que viene en input.data.session_id
    const sessionId = input.data?.session_id || input.id;
    
    let resource_id = sessionId; // Por defecto usamos la sesión
    let cartIdFound: string | undefined = undefined;

    // 2. CONSULTAR A LA BASE DE DATOS (REMOTE QUERY)
    // Usamos el ID de sesión para buscar el cart_id real
    if (sessionId && sessionId.startsWith("payses_")) {
        this.logger_.info(`🕵️‍♂️ [MP-DB] Consultando DB para sesión: ${sessionId}`);
        
        try {
            const remoteQuery = this.container_.resolve(ContainerRegistrationKeys.REMOTE_QUERY);
            
            // Query: "Busca en payment_session, trae el payment_collection, y de ahí el cart_id"
            const query = {
                entryPoint: "payment_session",
                fields: ["payment_collection.cart_id"],
                filters: { id: sessionId }
            };

            const result = await remoteQuery(query);
            
            // El resultado suele ser un array
            const fetchedCartId = result[0]?.payment_collection?.cart_id;

            if (fetchedCartId) {
                cartIdFound = fetchedCartId;
                resource_id = fetchedCartId; // ¡REEMPLAZAMOS EL ID!
                this.logger_.info(`🎯 [MP-DB] ¡EUREKA! Carrito encontrado: ${resource_id}`);
            } else {
                this.logger_.warn(`⚠️ [MP-DB] La consulta funcionó pero no trajo cart_id.`);
                // Intento de fallback: buscar si el contexto tiene cart_id
                if (input.context?.cart_id) {
                    resource_id = input.context.cart_id;
                    this.logger_.info(`📦 [MP-CTX] Usando cart_id del contexto: ${resource_id}`);
                }
            }

        } catch (error) {
            this.logger_.error(`❌ [MP-DB-ERROR] Falló la consulta a DB: ${error}`);
        }
    } else {
        // Si por milagro ya vino un cart_id en el input
        if (input.resource_id?.startsWith("cart_")) resource_id = input.resource_id;
        if (input.context?.cart_id) resource_id = input.context.cart_id;
    }

    if (!resource_id) {
        resource_id = `fallback_${Date.now()}`;
        this.logger_.warn(`⚠️ [MP-CRITICAL] IMPOSIBLE ENCONTRAR CART ID. Usando Fallback.`);
    }

    // --- CONFIGURACIÓN DE URLS ---
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
    this.logger_.info(`🛒 [MP-FINAL] ID Vinculado: ${resource_id}`);

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
        external_reference: resource_id, // AQUÍ VA EL CART_ID (O PAYSES SI FALLÓ TODO)
        notification_url: webhookUrl,
        back_urls: { success: successUrl, failure: failureUrl, pending: pendingUrl },
        auto_return: "approved",
        metadata: { 
            cart_id: resource_id,
            session_id: sessionId
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