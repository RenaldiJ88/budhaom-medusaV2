import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/utils";
import { MercadoPagoConfig, Payment } from 'mercadopago';
import { completeCartWorkflow } from "@medusajs/medusa/core-flows";

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);

  try {
    const eventData = req.body as any;
    const type = eventData.type;
    const data = eventData.data;

    if (type !== "payment") {
       res.status(200).send("Ignored");
       return; 
    }

    const id = data?.id;
    if (!id) {
       res.status(400).send("No ID found");
       return;
    }

    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!accessToken) {
        logger.error("❌ ERROR: Falta MP_ACCESS_TOKEN");
        res.status(500).send("Config Error");
        return;
    }

    const client = new MercadoPagoConfig({ accessToken: accessToken });
    const payment = new Payment(client);
    const paymentInfo = await payment.get({ id: id });
    
    const status = paymentInfo.status;
    const externalReference = paymentInfo.external_reference; 

    logger.info(`🔍 ID: ${id} | Estado: ${status} | Ref: ${externalReference}`);

    if (status === 'approved' && externalReference) {
        const query = req.scope.resolve(ContainerRegistrationKeys.QUERY);
        
        // --- PASO 1: Buscar la Payment Collection usando la Sesión ---
        const { data: sessions } = await query.graph({
            entity: "payment_session",
            fields: ["payment_collection_id"],
            filters: {
                id: externalReference
            }
        });

        const paymentCollectionId = sessions[0]?.payment_collection_id;

        if (!paymentCollectionId) {
            logger.error(`❌ No se encontró payment_collection para la sesión ${externalReference}`);
            res.status(200).send("OK");
            return;
        }

        logger.info(`🔗 Payment Collection encontrada: ${paymentCollectionId}`);

        // --- PASO 2: Buscar el Cart ID dentro de la Payment Collection ---
        // CAMBIO AQUÍ: Preguntamos a la colección directamente por su cart_id
        const { data: collections } = await query.graph({
            entity: "payment_collection",
            fields: ["cart_id"], 
            filters: {
                id: paymentCollectionId
            }
        });

        // Obtenemos el cart_id desde la colección
        const cartId = collections[0]?.cart_id;

        if (cartId) {
            logger.info(`🛒 Cart ID encontrado: ${cartId}. Ejecutando Workflow...`);
            
            try {
                // --- PASO 3: Completar el Carrito (Crear Orden) ---
                const { result } = await completeCartWorkflow(req.scope)
                    .run({
                        input: { id: cartId }
                    });

                logger.info(`🎉 ¡ORDEN CREADA EXITOSAMENTE! ID: ${result.id}`);
            } catch (workflowError) {
                const msg = (workflowError as any).message || "";
                if (msg.includes("completed")) {
                    logger.info("✅ La orden ya estaba creada.");
                } else {
                    logger.error(`⚠️ Error en Workflow: ${msg}`);
                }
            }
        } else {
            logger.error(`❌ La Payment Collection ${paymentCollectionId} no tiene un cart_id asociado.`);
        }
    }

    res.status(200).send("OK");

  } catch (error) {
    logger.error(`Error Webhook: ${(error as any).message}`);
    res.status(200).send("Error processed"); 
  }
}