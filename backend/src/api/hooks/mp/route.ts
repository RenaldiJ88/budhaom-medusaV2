import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/utils";
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { completeCartWorkflow } from "@medusajs/medusa/core-flows";

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);

  try {
    const eventData = req.body as any;
    
    // 1. Verificación básica del tipo de evento
    if (eventData.type !== "payment") {
       res.status(200).send("Ignored");
       return; 
    }

    const paymentId = eventData.data?.id;
    if (!paymentId) {
       res.status(400).send("No ID found");
       return;
    }

    // 2. Configuración e instanciación de MercadoPago
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!accessToken) {
        logger.error("❌ Critical: MERCADOPAGO_ACCESS_TOKEN not configured.");
        res.status(500).send("Server Configuration Error");
        return;
    }

    const client = new MercadoPagoConfig({ accessToken: accessToken });
    const payment = new Payment(client);
    
    // 3. Consultar estado real a MercadoPago (Seguridad)
    const paymentInfo = await payment.get({ id: paymentId });
    const { status, external_reference: externalReference } = paymentInfo;

    // Solo procesamos si está aprobado y tiene referencia de Medusa (payses_...)
    if (status === 'approved' && externalReference) {
        
        logger.info(`💳 Procesando pago aprobado MP: ${paymentId}`);

        const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
        
        // 4. Búsqueda Relacional (Graph Query) - LA LÓGICA CLAVE
        // Buscamos el Cart ID navegando los links: Session -> Collection -> Cart
        const { data: sessions } = await query.graph({
            entity: "payment_session",
            fields: [
                "payment_collection.cart.id"
            ],
            filters: {
                id: externalReference
            }
        });

        const cartId = sessions[0]?.payment_collection?.cart?.id;

        if (cartId) {
            try {
                // 5. Ejecutar Workflow para crear la Orden
                const { result } = await completeCartWorkflow(req.scope)
                    .run({
                        input: { id: cartId }
                    });

                logger.info(`✅ Orden creada exitosamente en Medusa: ${result.id}`);
            } catch (workflowError) {
                const msg = (workflowError as any).message || "";
                // Si el error dice "completed", es idempotencia (ya se creó antes), no es error real.
                if (msg.includes("completed")) {
                    logger.info("ℹ️ La orden ya había sido procesada anteriormente.");
                } else {
                    logger.error(`⚠️ Error al completar el carrito: ${msg}`);
                }
            }
        } else {
            logger.warn(`⚠️ No se encontró Cart ID asociado a la sesión ${externalReference}`);
        }
    }

    // Siempre responder 200 a MP para confirmar recepción
    res.status(200).send("OK");

  } catch (error) {
    logger.error(`❌ Error general en Webhook MP: ${(error as any).message}`);
    res.status(200).send("Error processed"); 
  }
}