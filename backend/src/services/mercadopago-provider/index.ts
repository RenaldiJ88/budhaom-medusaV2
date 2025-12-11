import { 
  AbstractPaymentProvider, 
  PaymentSessionStatus,
  PaymentActions
} from "@medusajs/framework/utils";
import { 
  Logger,
  WebhookActionResult
} from "@medusajs/framework/types";

// NO importamos Mercado Pago para descartar que sea la librería la que falla

type Options = {
  access_token: string;
};

type SessionData = Record<string, unknown>;

class MercadoPagoProvider extends AbstractPaymentProvider<SessionData> {
  static identifier = "mercadopago";
  
  protected options_: Options;

  constructor(container: any, options: Options) {
    super(container, options); 
    this.options_ = options;
    console.log("🛠️ [TEST-MODE] Constructor iniciado correctamente.");
  }

  async initiatePayment(input: any): Promise<{ id: string, data: SessionData }> {
    console.log("🛠️ [TEST-MODE] initiatePayment llamado.");
    
    // Simulamos un ID falso para ver si Medusa lo acepta
    const fakeId = "pref_TEST_123456789"; 

    console.log("🛠️ [TEST-MODE] Retornando datos simulados...");

    return {
      id: fakeId,
      data: {
        id: fakeId,
        init_point: "https://www.google.com", // Redirección falsa para probar
        resource_id: input.resource_id || "test_resource"
      },
    };
  }

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