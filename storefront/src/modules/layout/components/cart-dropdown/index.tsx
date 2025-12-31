"use client"

import { Popover, Transition } from "@headlessui/react"
import { Button } from "@medusajs/ui"
import { usePathname } from "next/navigation"
import { Fragment, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { HttpTypes } from "@medusajs/types"
import DeleteButton from "@modules/common/components/delete-button"
import LineItemOptions from "@modules/common/components/line-item-options"
import Thumbnail from "@modules/products/components/thumbnail"

// Función auxiliar
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
  // Usamos 'ReturnType<typeof setTimeout>' para evitar error de NodeJS.Timer en navegador
  const [activeTimer, setActiveTimer] = useState<ReturnType<typeof setTimeout> | undefined>(undefined)
  const [cartDropdownOpen, setCartDropdownOpen] = useState(false)

  const open = () => setCartDropdownOpen(true)
  const close = () => setCartDropdownOpen(false)

  const totalItems =
    cart?.items?.reduce((acc, item) => {
      return acc + item.quantity
    }, 0) || 0

  const subtotal = cart?.subtotal ?? 0
  const itemRef = useRef<number>(totalItems || 0)

  const timedOpen = () => {
    open()
    const timer = setTimeout(close, 5000)
    setActiveTimer(timer)
  }

  const openAndCancel = () => {
    if (activeTimer) {
      clearTimeout(activeTimer)
    }
    open()
  }

  useEffect(() => {
    return () => {
      if (activeTimer) {
        clearTimeout(activeTimer)
      }
    }
  }, [activeTimer])

  const pathname = usePathname()

  useEffect(() => {
    if (itemRef.current !== totalItems && !pathname.includes("/cart")) {
      timedOpen()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalItems, itemRef.current])

  return (
    <div
      className="h-full z-50"
      onMouseEnter={openAndCancel}
      onMouseLeave={close}
    >
      <Popover className="relative h-full flex items-center">
        {/* 🔴 CAMBIO CRÍTICO AQUÍ:
            Antes: <Popover.Button><Link>...</Link></Popover.Button> (ILEGAL: a dentro de button)
            Ahora: <Popover.Button as={Link} ...> (LEGAL: el botón SE COMPORTA como un link)
        */}
        <Popover.Button
            as={Link}
            href={`/${countryCode}/cart`}
            className="h-full outline-none hover:text-gray-300 text-white transition-colors flex items-center"
        >
            {`Cart (${totalItems})`}
        </Popover.Button>

        <Transition
          show={cartDropdownOpen}
          as={Fragment}
          enter="transition ease-out duration-200"
          enterFrom="opacity-0 translate-y-1"
          enterTo="opacity-100 translate-y-0"
          leave="transition ease-in duration-150"
          leaveFrom="opacity-100 translate-y-0"
          leaveTo="opacity-0 translate-y-1"
        >
          <Popover.Panel
            static
            className="hidden small:block absolute top-[calc(100%+1px)] right-0 bg-white border border-gray-200 w-[420px] text-black shadow-xl rounded-lg p-4 z-50"
          >
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
                      <span className="font-normal text-gray-500">(sin imp.)</span>
                    </span>
                    <span className="text-large-semi">
                      {formatPrice(subtotal, cart.currency_code)}
                    </span>
                  </div>
                  <Link href={`/${countryCode}/cart`} className="w-full">
                    <Button className="w-full bg-black text-white hover:bg-gray-800" size="large">
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
          </Popover.Panel>
        </Transition>
      </Popover>
    </div>
  )
}

export default CartDropdown