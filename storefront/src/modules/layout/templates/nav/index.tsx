import { Suspense } from "react"
import NavClient from "./nav-client"

export default function Nav() {
  // Ya no necesitamos pasar regions si no usas el selector de país en tu diseño.
  return (
    <Suspense fallback={<div className="fixed top-0 w-full h-16 bg-black/50" />}>
      <NavClient />
    </Suspense>
  )
}