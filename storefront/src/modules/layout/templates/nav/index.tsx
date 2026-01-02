import { Suspense } from "react"

import { listRegions } from "@lib/data/regions"
import { getCollectionsList } from "@lib/data/collections"
import { retrieveCart } from "@lib/data/cart"
import { StoreRegion } from "@medusajs/types"
import LocalizedClientLink from "@modules/common/components/localized-client-link"
import SideMenu from "@modules/layout/components/side-menu"
import NavClient from "./nav-client"

export default async function Nav() {
  const regions = await listRegions().then((regions: StoreRegion[]) => regions)
  const cart = await retrieveCart().catch(() => null)
  const { collections } = await getCollectionsList().then((c) => c)
  
  // TypeScript pide un countryCode para el SideMenu. 
  // Usamos "ar" por defecto para que no falle el build.
  const defaultCountryCode = "ar" 

  return (
    <div className="sticky top-0 inset-x-0 z-50 group">
      <header className="relative h-16 mx-auto border-b duration-200 bg-white border-ui-border-base">
        <nav className="content-container txt-xsmall-plus text-ui-fg-subtle flex items-center justify-between w-full h-full text-small-regular">
          <div className="flex-1 basis-0 h-full flex items-center">
            <div className="h-full">
              {/* Pasamos el countryCode dummy para arreglar el Error 1 */}
              <SideMenu regions={regions} countryCode={defaultCountryCode} />
            </div>
          </div>

          <div className="flex items-center h-full">
            <LocalizedClientLink
              href="/"
              className="txt-compact-xlarge-plus hover:text-ui-fg-base uppercase"
              data-testid="nav-store-link"
            >
              Budha.Om
            </LocalizedClientLink>
          </div>

          <div className="flex items-center gap-x-6 h-full flex-1 basis-0 justify-end">
            <div className="hidden small:flex items-center gap-x-6 h-full">
              {process.env.FEATURE_SEARCH_ENABLED && (
                <LocalizedClientLink
                  className="hover:text-ui-fg-base"
                  href="/search"
                  scroll={false}
                  data-testid="nav-search-link"
                >
                  Search
                </LocalizedClientLink>
              )}
              <LocalizedClientLink
                className="hover:text-ui-fg-base"
                href="/account"
                data-testid="nav-account-link"
              >
                Account
              </LocalizedClientLink>
            </div>

            <Suspense
              fallback={
                <LocalizedClientLink
                  className="hover:text-ui-fg-base flex gap-2"
                  href="/cart"
                  data-testid="nav-cart-link"
                >
                  Cart (0)
                </LocalizedClientLink>
              }
            >
              <NavClient cart={cart} collections={collections} />
            </Suspense>
          </div>
        </nav>
      </header>
    </div>
  )
}