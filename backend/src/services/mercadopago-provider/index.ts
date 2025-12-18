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
// Importamos el ContainerRegistrationKeys para poder acceder a la DB si hace falta
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
    this.container_ = container;
    this.options_ = options;
    this.logger_ = container.logger;
    this.mercadoPagoConfig = new MercadoPagoConfig({
      accessToken: options.access_token,
    });
  }

  async initiatePayment(input: any): Promise<{ id: string, data: SessionData }> {
    this.logger_.info(`🔥 [MP-INIT] Iniciando...`);

    // 🚨 LOG DE LA VERDAD: ESTO NOS DIRÁ QUÉ TIENE EL INPUT REALMENTE
    // Busca esto en tu consola de Railway cuando falles
    console.log("📦 [MP-FULL-DUMP]:", JSON.stringify(input, null, 2));

    // --- ESTRATEGIA DE BÚSQUEDA AGRESIVA ---
    let resource_id: string | undefined = undefined;

    // Lista ampliada de candidatos (Orden de prioridad)
    const candidates = [
      input.resource_id,              // A veces viene directo
      input.context?.cart_id,         // Estándar
      input.context?.id,              // 🔥 NUEVO: A veces el contexto ES el carrito
      input.cart?.id,                 // Objeto cart
      input.data?.cart_id,            // Data previa
      input.payment_session?.cart_id 
    ];

    // 1. Buscamos cualquier cosa que parezca un cart_id ("cart_...")
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.startsWith("cart_")) {
        resource_id = candidate;
        this.logger_.info(`🎯 [MP-DEBUG] Cart ID encontrado en lista: ${resource_id}`);
        break; 
      }
    }

    // 2. Si no encontramos "cart_", probamos con la DB (Remote Query) usando lo que tengamos
    if (!resource_id) {
        // ¿Tenemos algún ID de sesión (payses_...)?
        const sessionId = input.resource_id || input.id;
        
        if (sessionId && typeof sessionId === 'string' && sessionId.startsWith("payses_")) {
            this.logger_.info(`🕵️‍♂️ [MP-DB] Buscando carrito para sesión: ${sessionId}`);
            try {
                const remoteQuery = this.container_.resolve(ContainerRegistrationKeys.REMOTE_QUERY);
                const query = {
                    entryPoint: "payment_session",
                    fields: ["payment_collection.cart_id"],
                    filters: { id: sessionId }
                };
                const result = await remoteQuery(query);
                const fetchedCartId = result[0]?.payment_collection?.cart_id;

                if (fetchedCartId) {
                    resource_id = fetchedCartId;
                    this.logger_.info(`🎯 [MP-DB] ¡EUREKA! Carrito recuperado de DB: ${resource_id}`);
                }
            } catch (e) {
                this.logger_.error(`❌ [MP-DB] Error en consulta: ${e}`);
            }
        }
    }

    // 3. Fallback Final (Si llegamos acá, estamos creando una orden fantasma)
    if (!resource_id) {
        resource_id = `fallback_${Date.now()}`;
        this.logger_.warn(`⚠️ [MP-WARN] IMPOSIBLE ENCONTRAR CART ID. Usando Fallback: ${resource_id}`);
    }

    // --- CONFIGURACIÓN DE URLS ---
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

    this.logger_.info(`🌐 [MP-DEBUG] Return: ${successUrl}`);

    // --- PREFERENCIA MERCADO PAGO ---
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
        external_reference: resource_id, // CLAVE: Esto vincula la orden
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