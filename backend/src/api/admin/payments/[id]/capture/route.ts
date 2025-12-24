import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/utils";

interface CapturePaymentPayload {
  amount: number;
}

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    const { id: paymentId } = req.params;
    const { amount } = req.body as CapturePaymentPayload;

    if (!paymentId) {
      res.status(400).json({ error: "Payment ID is required" });
      return;
    }

    if (!amount || Number(amount) <= 0) {
      res.status(400).json({ error: "Valid amount is required" });
      return;
    }

    const captureAmount = Number(amount);
    const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);

    const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
    
    const { data: payments } = await query.graph({
      entity: "payment",
      fields: [
        "id",
        "amount",
        "currency_code",
        "payment_session.id",
        "payment_session.provider_id",
        "payment_session.data"
      ],
      filters: {
        id: paymentId
      }
    });

    if (!payments || payments.length === 0) {
      res.status(404).json({ error: "Payment not found" });
      return;
    }

    const payment = payments[0];
    const paymentSession = payment.payment_session;

    if (!paymentSession) {
      res.status(400).json({ error: "Payment session not found" });
      return;
    }

    const providerId = paymentSession.provider_id;
    if (!providerId?.includes("mercadopago")) {
      res.status(400).json({ 
        error: "This endpoint only supports MercadoPago payments" 
      });
      return;
    }

    if (captureAmount > payment.amount) {
      res.status(400).json({ 
        error: `Capture amount (${captureAmount}) exceeds authorized amount (${payment.amount})` 
      });
      return;
    }

    let cleanProviderId = providerId;
    if (providerId.startsWith("pp_")) {
      cleanProviderId = providerId.replace(/^pp_/, "");
    }
    if (cleanProviderId.endsWith("_mercadopago") && cleanProviderId !== "mercadopago") {
      cleanProviderId = "mercadopago";
    }

    let provider;
    try {
      provider = req.scope.resolve(cleanProviderId);
    } catch (err) {
      try {
        provider = req.scope.resolve(providerId);
      } catch (err2) {
        logger.error(`Failed to resolve provider: ${cleanProviderId} or ${providerId}`);
        res.status(500).json({ error: "Payment provider not found" });
        return;
      }
    }

    if (!provider || typeof provider.capturePayment !== "function") {
      res.status(500).json({ error: "Payment provider does not support capture" });
      return;
    }

    const captureInput = {
      session_data: paymentSession.data || {},
      amount: captureAmount
    };

    const result = await provider.capturePayment(captureInput);

    logger.info(`✅ [ADMIN-CAPTURE] Payment ${paymentId} captured: $${captureAmount}`);

    res.json({
      success: true,
      data: result,
      captured_amount: captureAmount
    });

  } catch (error: any) {
    const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);
    logger.error(`🔥 [ADMIN-CAPTURE-ERROR]: ${error.message}`);
    
    res.status(500).json({ 
      error: error.message || "Failed to capture payment" 
    });
  }
}

