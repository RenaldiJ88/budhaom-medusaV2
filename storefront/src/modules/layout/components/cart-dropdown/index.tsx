"use client"

import { Button } from "@medusajs/ui"
import Link from "next/link"
import { HttpTypes } from "@medusajs/types"
import DeleteButton from "@modules/common/components/delete-button"
import LineItemOptions from "@modules/common/components/line-item-options"
import Thumbnail from "@modules/products/components/thumbnail"
// Eliminamos @headlessui/react por completo para evitar el crash

const formatPrice = (amount: number, currencyCode: string) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currencyCode.toUpperCase(),
  }).format(amount)
}

const CartDropdown = ({
  cart,
  countryCode,
}: {
  cart?: HttpTypes.StoreCart | null
  countryCode: string
}) => {
  
  const totalItems =
    cart?.items?.reduce((acc, item) => {
      return acc + item.quantity
    }, 0) || 0

  const subtotal = cart?.subtotal ?? 0

  return (
    // USAMOS LA CLASE 'group' PARA DETECTAR EL HOVER
    <div className="h-full z-50 flex items-center relative group">
      
      {/* 1. EL ENLACE AL CARRITO (Visible siempre) */}
      <Link
        href={`/${countryCode}/cart`}
        className="hover:text-gray-300 text-white transition-colors h-full flex items-center outline-none py-4"
      >
        {`Cart (${totalItems})`}
      </Link>

      {/* 2. EL PANEL DESPLEGABLE (CSS Puro)
          hidden = oculto por defecto
          group-hover:block = visible cuando pasas el mouse por el padre
      */}
      <div className="hidden group-hover:block absolute top-[calc(100%-10px)] right-0 pt-4 z-50 w-[420px]">
        {/* Fondo blanco y borde */}
        <div className="bg-white border border-gray-200 text-black shadow-xl rounded-lg p-4">
            <div className="p-4 flex items-center justify-center border-b pb-4">
              <h3 className="text-large-semi font-bold">Carrito</h3>
            </div>
            
            {cart && cart.items?.length ? (
              <>
                <div className="overflow-y-scroll max-h-[402px] px-4 grid grid-cols-1 gap-y-8 no-scrollbar p-px py-4">
                  {cart.items
                    .sort((a: any, b: any) => {
                      return (a.created_at ?? "") > (b.created_at ?? "") ? -1 : 1
                    })
                    .map((item) => (
                      <div
                        className="grid grid-cols-[80px_1fr] gap-x-4"
                        key={item.id}
                      >
                        <Link
                          href={`/${countryCode}/products/${item.variant?.product?.handle}`}
                          className="w-20"
                        >
                          <Thumbnail
                            thumbnail={item.variant?.product?.thumbnail}
                            size="square"
                          />
                        </Link>
                        <div className="flex flex-col justify-between flex-1 text-sm">
                          <div className="flex flex-col flex-1">
                            <div className="flex items-start justify-between">
                              <div className="flex flex-col overflow-ellipsis whitespace-nowrap mr-4 w-[180px]">
                                <h3 className="font-medium overflow-hidden text-ellipsis">
                                  <Link
                                    href={`/${countryCode}/products/${item.variant?.product?.handle}`}
                                  >
                                    {item.title}
                                  </Link>
                                </h3>
                                <LineItemOptions
                                  variant={item.variant}
                                  data-testid="cart-item-variant"
                                />
                                <span className="text-gray-500 mt-1">
                                  Cant: {item.quantity}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-end justify-between mt-2">
                            <DeleteButton
                              id={item.id}
                              className="text-red-500 hover:text-red-700 text-xs font-bold uppercase"
                            >
                              Eliminar
                            </DeleteButton>
                            <span className="font-semibold">
                              {formatPrice(item.unit_price, cart.currency_code)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
                <div className="p-4 flex flex-col gap-y-4 text-small-regular border-t pt-4">
                  <div className="flex items-center justify-between font-bold">
                    <span className="text-gray-900">
                      Subtotal{" "}
                      <span className="font-normal text-gray-500">
                        (sin imp.)
                      </span>
                    </span>
                    <span className="text-large-semi">
                      {formatPrice(subtotal, cart.currency_code)}
                    </span>
                  </div>
                  <Link href={`/${countryCode}/cart`} className="w-full">
                    <Button
                      className="w-full bg-black text-white hover:bg-gray-800"
                      size="large"
                    >
                      Ir al Carrito
                    </Button>
                  </Link>
                </div>
              </>
            ) : (
              <div>
                <div className="flex py-16 flex-col gap-y-4 items-center justify-center">
                  <div className="bg-gray-900 flex items-center justify-center w-6 h-6 rounded-full text-white text-xs">
                    <span>0</span>
                  </div>
                  <span>Tu carrito está vacío.</span>
                  <div>
                    <Link href={`/${countryCode}/store`}>
                      <Button className="bg-black text-white hover:bg-gray-800">
                        Explorar productos
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            )}
        </div>
      </div>
    </div>
  )
}

export default CartDropdown