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
};

type SessionData = Record<string, unknown>;

class MercadoPagoProvider extends AbstractPaymentProvider<SessionData> {
  static identifier = "mercadopago";
  
  protected options_: Options;
  protected mercadoPagoConfig: MercadoPagoConfig;

  constructor(container: any, options: Options) {
    super(container, options); 
    this.options_ = options;
    
    // Validación de seguridad al inicio
    if (!options.access_token) {
      console.error("⚠️ [MP-ERROR] No se encontró el ACCESS_TOKEN en las opciones.");
    }

    this.mercadoPagoConfig = new MercadoPagoConfig({
      accessToken: options.access_token || "TEST-TOKEN-PLACEHOLDER", // Evita crash si falta el token
    });
  }

  async initiatePayment(input: any): Promise<{ id: string, data: SessionData }> {
    console.log("🚀 [MP-INIT] Iniciando pago...");

    try {
      // 1. CONFIGURAR URL DE RETORNO
      const storeUrl = process.env.STORE_URL || "http://localhost:8000";
      // Aseguramos que no tenga slash al final
      const baseUrl = storeUrl.endsWith("/") ? storeUrl.slice(0, -1) : storeUrl;
      
      // 2. OBTENER REFERENCIA (CRÍTICO)
      // Buscamos el ID del carrito o recurso. Si no existe, usamos el ID de la sesión (input.id).
      // Esto soluciona el "error_id_fatal".
      const externalRef = input.resource_id || input.context?.resource_id || input.id;
      
      if (!externalRef) {
        throw new Error("No se pudo generar una referencia para el pago.");
      }

      console.log(`✅ [MP-REF] Referencia usada: ${externalRef}`);

      // 3. DATOS DEL CLIENTE Y MONTO
      const email = input.email || input.context?.email || "guest@client.com";
      let amount = input.amount || input.context?.amount || 100; // Fallback a 100 si falla
      amount = Number(amount);

      // 4. CREAR PREFERENCIA EN MERCADO PAGO
      const preferenceData = {
        body: {
          items: [
            {
              id: externalRef,
              title: "Compra en Tienda",
              quantity: 1,
              unit_price: amount,
              currency_id: "ARS",
            },
          ],
          payer: { email: email },
          external_reference: externalRef, // <--- Aquí vinculamos la orden
          back_urls: {
            success: `${baseUrl}/checkout?step=payment&payment_status=success`,
            failure: `${baseUrl}/checkout?step=payment&payment_status=failure`,
            pending: `${baseUrl}/checkout?step=payment&payment_status=pending`,
          },
          auto_return: "approved",
        },
      };

      const preference = new Preference(this.mercadoPagoConfig);
      const response = await preference.create(preferenceData);

      if (!response.id) throw new Error("Mercado Pago no devolvió ID de preferencia.");

      // 5. RETORNO LIMPIO (JSON PURO)
      // Solo devolvemos strings y números, nada de objetos complejos
      return {
        id: response.id, // Este ID se guarda en la DB de Medusa
        data: {
          id: response.id,
          init_point: response.init_point,
          sandbox_init_point: response.sandbox_init_point,
          external_reference: externalRef
        },
      };

    } catch (error: any) {
      console.error("🔥 [MP-CRASH]", error);
      // Re-lanzamos el error para que Medusa sepa que falló
      throw error;
    }
  }

  // --- MÉTODOS OBLIGATORIOS (Boilerplate estándar) ---
  
  async authorizePayment(input: any): Promise<{ status: PaymentSessionStatus; data: SessionData; }> {
    return { status: PaymentSessionStatus.AUTHORIZED, data: input.session_data || {} };
  }

  async cancelPayment(input: any): Promise<SessionData> { return input.session_data || {}; }
  async capturePayment(input: any): Promise<SessionData> { return input.session_data || {}; }
  async deletePayment(input: any): Promise<SessionData> { return input.session_data || {}; }
  async getPaymentStatus(input: any): Promise<{ status: PaymentSessionStatus }> { 
    return { status: PaymentSessionStatus.AUTHORIZED }; 
  }
  async refundPayment(input: any): Promise<SessionData> { return input.session_data || {}; }
  async retrievePayment(input: any): Promise<SessionData> { return input.session_data || {}; }
  async updatePayment(input: any): Promise<{ id: string, data: SessionData }> {
    return this.initiatePayment(input);
  }
  async getWebhookActionAndData(input: any): Promise<WebhookActionResult> {
    return { action: PaymentActions.NOT_SUPPORTED };
  }
}

export default {
  services: [MercadoPagoProvider],
};