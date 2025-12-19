import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/utils";
import { MercadoPagoConfig, Payment } from 'mercadopago';

export async function POST(req: MedusaRequest, res: MedusaResponse) {
  const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);

  try {
    const eventData = req.body as any;
    const type = eventData.type;
    const data = eventData.data;

    // Solo nos interesan los eventos de tipo "payment"
    if (type !== "payment") {
       res.status(200).send("Ignored");
       return; 
    }

    const id = data?.id;
    if (!id) {
       res.status(400).send("No ID found");
       return;
    }

    logger.info(`🔍 Procesando Webhook para ID: ${id}`);

    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!accessToken) {
        logger.error("❌ ERROR CRÍTICO: No se encontró MP_ACCESS_TOKEN");
        res.status(500).send("Server Configuration Error");
        return;
    }

    const client = new MercadoPagoConfig({ accessToken: accessToken });
    const payment = new Payment(client);
    
    // Consultamos a MercadoPago
    const paymentInfo = await payment.get({ id: id });
    
    const status = paymentInfo.status;
    const externalReference = paymentInfo.external_reference;

    logger.info(`📊 ESTADO MP: ${status}`);
    logger.info(`🛒 REFERENCIA MEDUSA: ${externalReference}`);

    if (status === 'approved') {
        logger.info("✅ PAGO APROBADO - Iniciando creación de orden en Medusa...");

        // --- CORRECCIÓN AQUÍ ---
        // Usamos 'as any' para evitar errores de importación de tipos.
        // Esto le dice a TypeScript: "Confía en mí, estos servicios existen".
        const cartService = req.scope.resolve("cartService") as any;
        const paymentProviderService = req.scope.resolve("paymentProviderService") as any;

        let cartId = externalReference;

        // Lógica para recuperar el ID real del carrito si viene 'payses_'
        if (externalReference && externalReference.startsWith("payses_")) {
            try {
                const session = await paymentProviderService.retrieveSession(externalReference);
                if (session && session.cart_id) {
                    cartId = session.cart_id;
                    logger.info(`🔗 Cart ID encontrado: ${cartId} (desde sesión de pago)`);
                }
            } catch (err) {
                logger.warn(`⚠️ No se pudo recuperar la sesión. Usando referencia original.`);
            }
        }

        if (cartId) {
            try {
                // 1. Autorizar el pago
                try {
                    await cartService.authorizePayment(cartId);
                    logger.info(`💳 Pago autorizado en Medusa para el carrito ${cartId}`);
                } catch (authErr) {
                    // Casteamos el error a 'any' para leer el mensaje sin problemas
                    logger.warn(`⚠️ Nota sobre autorización: ${(authErr as any).message}`);
                }

                // 2. Completar el carrito (CREAR ORDEN)
                const order = await cartService.complete(cartId);
                
                if (order && order.type === "order") {
                    logger.info(`🎉 ¡ORDEN CREADA EXITOSAMENTE! ID: ${order.id}`);
                } else {
                    logger.info(`ℹ️ Respuesta no fue orden directa. Tipo: ${order.type}`);
                }

            } catch (orderError) {
                const message = (orderError as any).message;
                if (message && message.includes("completed")) {
                     logger.info("✅ La orden ya había sido creada anteriormente.");
                } else {
                     logger.error(`❌ Error FATAL creando la orden: ${message}`);
                }
            }
        } else {
            logger.error("❌ No se pudo determinar el Cart ID.");
        }
    }

    res.status(200).send("OK");

  } catch (error) {
    logger.error(`Error general en Webhook MP: ${(error as any).message || error}`);
    res.status(200).send("Error processed"); 
  }
}