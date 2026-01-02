"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { retrieveCart } from "@lib/data/cart" // Asegúrate que esta importación funcione, si no usa fetch directo

export default function CartButton() {
  const [qty, setQty] = useState(0)

  // Esta función busca el carrito fresco
  const fetchCart = async () => {
    try {
      // Intentamos obtener el carrito del servidor de Medusa
      // Si esto falla, avísame y usamos otro método
      const cartId = localStorage.getItem("cart_id")
      if (cartId) {
        // Opción A: Si tienes acceso a las funciones de lib
        const cart = await retrieveCart().catch(() => null)
        if (cart?.items) {
           const total = cart.items.reduce((acc, item) => acc + item.quantity, 0)
           setQty(total)
        }
      }
    } catch (e) {
      console.log(e)
    }
  }

  useEffect(() => {
    fetchCart()
    
    // TRUCO: Escuchamos cuando alguien agrega al carrito
    window.addEventListener("cart-updated", fetchCart)
    return () => window.removeEventListener("cart-updated", fetchCart)
  }, [])

  return (
    <Link href="/cart" className="hover:text-ui-fg-base flex items-center gap-x-2 font-poppins">
      CARRITO ({qty})
    </Link>
  )
}