import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http";
import { ContainerRegistrationKeys } from "@medusajs/utils";
import { MercadoPagoConfig, Payment } from 'mercadopago';

export async function POST(req: MedusaRequest, res: MedusaResponse) {
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

    const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);
    logger.info(`🔍 Procesando Webhook para ID: ${id}`);

    // --- AQUÍ ESTÁ EL CAMBIO ---
    // Usamos process.env para leer la variable de Railway
    // Asegúrate que en Railway la variable se llame exactamente 'MP_ACCESS_TOKEN'
    const accessToken = process.env.MP_ACCESS_TOKEN;

    if (!accessToken) {
        logger.error("❌ ERROR CRÍTICO: No se encontró MP_ACCESS_TOKEN en las variables de entorno");
        res.status(500).send("Server Configuration Error");
        return;
    }

    const client = new MercadoPagoConfig({ accessToken: accessToken });
    // ---------------------------

    const payment = new Payment(client);
    const paymentInfo = await payment.get({ id: id });
    
    const status = paymentInfo.status;
    const externalReference = paymentInfo.external_reference;

    logger.info(`📊 ESTADO MP: ${status}`);
    logger.info(`🛒 REFERENCIA MEDUSA: ${externalReference}`);

    if (status === 'approved') {
        logger.info("✅ PAGO APROBADO - Listo para capturar");
    }

    res.status(200).send("OK");

  } catch (error) {
    const logger = req.scope.resolve(ContainerRegistrationKeys.LOGGER);
    logger.error(`Error en Webhook MP: ${error}`);
    res.status(200).send("Error processed"); 
  }
}