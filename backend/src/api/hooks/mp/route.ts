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
        
        logger.info("🕵️ Buscando el camino desde la Sesión hasta el Carrito...");

        // --- ESTRATEGIA UNIFICADA V2 ---
        // En lugar de ir paso a paso, pedimos la ruta completa.
        // La clave es "payment_collection.cart.id"
        // Esto le dice a Medusa: "Usa los Links para traerme el ID del carrito conectado"
        const { data: sessions } = await query.graph({
            entity: "payment_session",
            fields: [
                "id", 
                "payment_collection.id",
                "payment_collection.cart.id" // <--- LA CLAVE MÁGICA
            ],
            filters: {
                id: externalReference
            }
        });

        // Verificamos qué encontramos para poder depurar si falla
        const session = sessions[0];
        const paymentCollection = session?.payment_collection;
        const cart = paymentCollection?.cart;
        const cartId = cart?.id;

        if (cartId) {
            logger.info(`🛒 Cart ID encontrado: ${cartId}. Ejecutando Workflow...`);
            
            try {
                // --- COMPLETAR EL CARRITO ---
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
            // Logs detallados para saber dónde se rompió la cadena
            logger.error("❌ No se pudo resolver el Cart ID.");
            logger.info(`   - Sesión encontrada: ${!!session}`);
            logger.info(`   - Collection encontrada: ${!!paymentCollection} (${paymentCollection?.id})`);
            logger.info(`   - Cart objeto encontrado: ${!!cart}`);
        }
    }

    res.status(200).send("OK");

  } catch (error) {
    logger.error(`Error Webhook: ${(error as any).message}`);
    res.status(200).send("Error processed"); 
  }
}