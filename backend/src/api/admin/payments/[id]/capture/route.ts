import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { capturePaymentWorkflow } from "@medusajs/medusa/core-flows"; // ✅ ESTO ES LO CORRECTO

// 1. Definimos la interfaz para lo que manda el Frontend
type AdminCaptureBody = {
  amount: number | string; // Aceptamos string o number para ser flexibles
};

export async function POST(
  req: MedusaRequest,
  res: MedusaResponse
): Promise<void> {
  try {
    // Obtenemos el ID del pago de la URL
    const { id: paymentId } = req.params;
    
    // Validamos que exista body
    if (!req.body) {
      res.status(400).json({ error: "No body provided" });
      return;
    }

    // 2. Casting y limpieza del monto
    const body = req.body as AdminCaptureBody;
    const amountToCapture = Number(body.amount);

    console.log(`🔍 [ADMIN-CAPTURE] Iniciando captura para Pago ID: ${paymentId}`);
    console.log(`💰 [ADMIN-CAPTURE] Monto solicitado: ${amountToCapture}`);

    if (!paymentId) {
      res.status(400).json({ error: "Payment ID is required" });
      return;
    }

    if (isNaN(amountToCapture) || amountToCapture <= 0) {
      res.status(400).json({ error: `Monto inválido recibido: ${body.amount}` });
      return;
    }

    // 3. EJECUCIÓN DEL WORKFLOW DE MEDUSA V2
    // Usamos el workflow oficial para asegurar que se actualice la Orden y el Pago en la BD
    const { result, errors } = await capturePaymentWorkflow.run({
      container: req.scope, // 👈 IMPORTANTE: Aquí se pasa el contexto
      input: {
        payment_id: paymentId,
        amount: amountToCapture,
      },
      throwOnError: true, // Esto hace que si falla, salte al catch de abajo
    });

    console.log("✅ [ADMIN-CAPTURE] Captura exitosa. Resultado:", result);

    res.json({
      success: true,
      captured_payment: result,
      message: "Pago capturado correctamente"
    });

  } catch (error: any) {
    console.error("🔥 [ADMIN-CAPTURE] Error crítico:", error);
     
    // Intentamos sacar el mensaje de error más limpio posible
    const errorMessage = error.message || "Error desconocido al procesar la captura";
    
    res.status(500).json({ 
      error: errorMessage,
      details: error.stack 
    });
  }
}