import { Metadata } from "next"

import OrderCompletedTemplate from "@modules/order/templates/order-completed-template"
import { enrichLineItems } from "@lib/data/cart"
import { retrieveOrder } from "@lib/data/orders"
import { HttpTypes } from "@medusajs/types"

type Props = {
  params: { id: string }
}

async function getOrder(id: string) {
  const order = await retrieveOrder(id)

  if (!order) {
    return
  }

  const enrichedItems = await enrichLineItems(order.items, order.region_id!)

  return {
    ...order,
    items: enrichedItems,
  } as unknown as HttpTypes.StoreOrder
}

export const metadata: Metadata = {
  title: "Order Confirmed",
  description: "You purchase was successful",
}

export default async function OrderConfirmedPage({ params }: Props) {
  const order = await getOrder(params.id)

  if (!order) {
    // UX mejorada: no mostramos 404, sino un estado de "procesando"
    return (
      <div className="py-6 min-h-[calc(100vh-64px)]">
        <div className="content-container flex flex-col justify-center items-center gap-y-6 max-w-2xl h-full w-full text-center">
          <h1 className="text-3xl font-semibold">Processing your order</h1>
          <p className="text-ui-fg-subtle">
            We received your payment, but the order is still being generated.{" "}
            Please wait a moment and refresh this page, or check your orders
            from your account.
          </p>
          <p className="text-sm text-ui-fg-muted">
            Reference ID:{" "}
            <span className="font-mono break-all">{params.id}</span>
          </p>
        </div>
      </div>
    )
  }

  return <OrderCompletedTemplate order={order} />
}
