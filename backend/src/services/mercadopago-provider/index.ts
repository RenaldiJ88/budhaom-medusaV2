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
  store_url?: string; // Agregamos esto por si viene en options
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

    try {
      // 1. DETECCIÓN ROBUSTA DEL ID (Medusa v2)
      // En v2, el Cart ID SIEMPRE viene en context.resource_id
      const resource_id = input.context?.resource_id || input.data?.resource_id;

      if (!resource_id) {
        // Si entra aquí, es crítico. Logueamos todo para ver qué llega.
        this.logger_.error(`❌ [MP-ERROR] No se encontró resource_id (Cart ID). Input: ${JSON.stringify(input)}`);
        throw new Error("Cart ID not found in context");
      }

      this.logger_.info(`🛒 [MP-DEBUG] Cart ID detectado: ${resource_id}`);

      // 2. URL BASE (Redirección)
      // Prioridad: Variable de entorno > Options > Localhost
      let storeUrl = process.env.STORE_URL || this.options_.store_url || "http://localhost:8000";
      
      // Limpieza de URL (quitar slash final si existe)
      if (storeUrl.endsWith("/")) storeUrl = storeUrl.slice(0, -1);
      
      // Asegurar que apunte a la región (esto depende de tu estructura, ajusta '/ar' si es necesario)
      // Si tu front maneja country codes en la URL, déjalo así. Si no, quita el '/ar'.
      const redirectUrl = storeUrl.includes("/ar") ? storeUrl : `${storeUrl}/ar`;

      this.logger_.info(`🌐 [MP-DEBUG] Return URL configurada: ${redirectUrl}`);

      // 3. DATOS DEL PAGO
      const amount = input.amount || input.context?.amount;
      const email = input.email || input.context?.email || "guest@budhaom.com";
      const currency = input.currency_code || input.context?.currency_code || "ARS";

      // 4. CONFIGURACIÓN DE PREFERENCIA (El objeto que va a MP)
      const preferenceData = {
        body: {
          items: [
            {
              id: resource_id, // Usamos el Cart ID como ID del ítem
              title: "Compra en BUDHA.Om",
              quantity: 1,
              unit_price: Number(amount),
              currency_id: currency.toUpperCase(),
            },
          ],
          payer: { email: email },
          external_reference: resource_id, // CLAVE: Esto permite que el Webhook cierre el carrito correcto
          
          // URLs de Redirección (Donde va el usuario al terminar)
          back_urls: {
            success: `${redirectUrl}/checkout?step=payment&payment_status=success`,
            failure: `${redirectUrl}/checkout?step=payment&payment_status=failure`,
            pending: `${redirectUrl}/checkout?step=payment&payment_status=pending`,
          },
          auto_return: "approved",

          // CONFIGURACIÓN DE ENVÍO / RETIRO
          // Como ahora tenemos "Retiro por Local", le decimos a MP que no pida envío obligatorio
          shipments: {
            mode: "not_specified",
            local_pickup: true, 
          },
          
          // Metadata extra para debugging
          metadata: {
            cart_id: resource_id
          }
        },
      };

      const preference = new Preference(this.mercadoPagoConfig);
      const response = await preference.create(preferenceData);

      if (!response.id) throw new Error("Mercado Pago no devolvió un ID de preferencia");

      return {
        id: response.id!,
        data: {
          id: response.id!,
          init_point: response.init_point!, 
          sandbox_init_point: response.sandbox_init_point!,
          resource_id: resource_id 
        },
      };

    } catch (error: any) {
      this.logger_.error(`🔥 [MP-ERROR-CRITICAL]: ${error.message}`);
      throw error;
    }
  }

  async updatePayment(input: any): Promise<{ id: string, data: SessionData }> {
    // En v2, updatePayment suele llamarse cuando cambia el carrito.
    // Simplemente re-iniciamos la preferencia con los datos nuevos.
    return this.initiatePayment(input);
  }

  // --- MÉTODOS REQUERIDOS POR MEDUSA v2 (Boilerplate) ---
  
  async authorizePayment(input: any): Promise<{ status: PaymentSessionStatus; data: SessionData; }> {
    // Asumimos autorizado si llegamos aquí, el Webhook confirmará la captura real
    return { status: PaymentSessionStatus.AUTHORIZED, data: input.session_data || {} };
  }

  async cancelPayment(input: any): Promise<SessionData> { 
    return input.session_data || {}; 
  }

  async capturePayment(input: any): Promise<SessionData> { 
    // La captura real la maneja MP automáticamente o el Webhook
    return input.session_data || {}; 
  }

  async deletePayment(input: any): Promise<SessionData> { 
    return input.session_data || {}; 
  }

  async getPaymentStatus(input: any): Promise<{ status: PaymentSessionStatus }> { 
    // Siempre devolvemos autorizado para no bloquear el flujo de Medusa
    // La verdad absoluta la tiene el Webhook cuando completa la orden.
    return { status: PaymentSessionStatus.AUTHORIZED }; 
  }

  async refundPayment(input: any): Promise<SessionData> { 
    return input.session_data || {}; 
  }

  async retrievePayment(input: any): Promise<SessionData> { 
    return input.session_data || {}; 
  }

  async getWebhookActionAndData(input: any): Promise<WebhookActionResult> {
    return { action: PaymentActions.NOT_SUPPORTED };
  }
}

export default {
  services: [MercadoPagoProvider],
};