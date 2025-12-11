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

// Definimos las opciones que vienen del medusa-config
type Options = {
  access_token: string;
  public_key?: string;
  webhook_url?: string;
};

// Usamos el tipo estándar para Medusa V2 para evitar conflictos de tipos
type PaymentProviderSessionResponse = Record<string, unknown>;

class MercadoPagoProvider extends AbstractPaymentProvider<PaymentProviderSessionResponse> {
  static identifier = "mercadopago";
  
  protected options_: Options;
  protected logger_: Logger;
  protected mercadoPagoConfig: MercadoPagoConfig;

  constructor(container: any, options: Options) {
    // @ts-ignore - Ignoramos error estricto de tipos en el constructor base para compatibilidad
    super(container, options); 
    this.options_ = options;
    this.logger_ = container.logger;
    
    const token = options.access_token || process.env.MERCADOPAGO_ACCESS_TOKEN || "NO_TOKEN";
    
    this.mercadoPagoConfig = new MercadoPagoConfig({
      accessToken: token,
    });
  }

  async initiatePayment(input: any): Promise<{ id: string, data: PaymentProviderSessionResponse }> {
    this.logger_.info("🚀 [MP-RAILWAY] initiatePayment ejecutándose...");

    const externalId = input.resource_id || input.id;
    
    // Validación de seguridad
    if (!externalId) {
      throw new Error("MercadoPago: No se encontró resource_id ni input.id para la referencia.");
    }

    try {
      const storeUrl = process.env.STORE_URL || "http://localhost:8000";
      // Asegurar URL limpia sin slash final
      const baseUrl = storeUrl.endsWith("/") ? storeUrl.slice(0, -1) : storeUrl;

      const preferenceData = {
        body: {
          items: [
            {
              id: externalId,
              title: "Compra Online",
              quantity: 1,
              unit_price: Number(input.amount),
              currency_id: "ARS",
            },
          ],
          external_reference: externalId,
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

      if (!response.id) throw new Error("MercadoPago API no devolvió ID");

      // Construimos el objeto de datos SIMPLE para evitar Error 500 en Postgres
      const sessionData = {
        id: response.id,
        external_reference: externalId,
        init_point: response.init_point
      };

      return {
        id: response.id,
        data: sessionData as PaymentProviderSessionResponse, // Cast explícito para TS
      };

    } catch (error: any) {
      this.logger_.error(`🔥 [MP-ERROR] ${error.message}`);
      throw error;
    }
  }

  async authorizePayment(input: any): Promise<{ status: PaymentSessionStatus; data: PaymentProviderSessionResponse; }> {
    return { 
      status: PaymentSessionStatus.AUTHORIZED, 
      data: (input.session_data as PaymentProviderSessionResponse) || {} 
    };
  }

  async cancelPayment(input: any): Promise<PaymentProviderSessionResponse> { 
    return {}; 
  }

  async capturePayment(input: any): Promise<PaymentProviderSessionResponse> { 
    return {}; 
  }

  async deletePayment(input: any): Promise<PaymentProviderSessionResponse> { 
    return {}; 
  }

  async getPaymentStatus(input: any): Promise<{ status: PaymentSessionStatus }> { 
    return { status: PaymentSessionStatus.AUTHORIZED }; 
  }

  async refundPayment(input: any): Promise<PaymentProviderSessionResponse> { 
    return {}; 
  }

  async retrievePayment(input: any): Promise<PaymentProviderSessionResponse> { 
    return (input.session_data as PaymentProviderSessionResponse) || {}; 
  }

  async updatePayment(input: any): Promise<{ id: string, data: PaymentProviderSessionResponse }> {
    return this.initiatePayment(input);
  }

  async getWebhookActionAndData(input: any): Promise<WebhookActionResult> {
    return { action: PaymentActions.NOT_SUPPORTED };
  }
}

export default {
  services: [MercadoPagoProvider],
};