import { getCategoriesList } from "@lib/data/categories"
import { getCollectionsList } from "@lib/data/collections"
import LocalizedClientLink from "@modules/common/components/localized-client-link"

export default async function Footer() {
  // Traemos los datos reales del backend para no romper la lógica
  const { collections } = await getCollectionsList(0, 6)
  const { product_categories } = await getCategoriesList(0, 6)

  return (
    <footer className="bg-[#101010] border-t border-gray-800 text-white mt-20">
      <div className="px-4 md:px-6 py-12 md:py-16">
        <div className="mx-auto grid max-w-6xl gap-8 grid-cols-2 md:grid-cols-4">
          
          {/* COLUMNA 1: MARCA */}
          <div className="col-span-2 md:col-span-1 text-center md:text-left">
            <h3 className="mb-4 font-poppins text-2xl font-bold text-white uppercase tracking-widest">
              BUDHA.Om
            </h3>
            <p className="font-inter text-sm leading-relaxed text-gray-400">
              © {new Date().getFullYear()} BUDHA.Om.<br/>Todos los derechos reservados.
            </p>
          </div>

          {/* COLUMNA 2: TIENDA (DINÁMICA + ESTATICA) */}
          <div className="text-center md:text-left">
            <h4 className="mb-4 font-inter text-base font-semibold text-white">Explorar</h4>
            <ul className="space-y-3">
              {/* Link estático a la tienda general */}
              <li>
                <LocalizedClientLink 
                  href="/store" 
                  className="font-inter text-sm text-gray-300 transition-colors hover:text-[#00FFFF]"
                >
                  Ver Todo
                </LocalizedClientLink>
              </li>

              {/* Categorías Dinámicas de Medusa */}
              {product_categories?.slice(0, 4).map((c) => {
                if (c.parent_category) return null // Solo categorías principales
                return (
                  <li key={c.id}>
                    <LocalizedClientLink
                      href={`/categories/${c.handle}`}
                      className="font-inter text-sm text-gray-300 transition-colors hover:text-[#00FFFF]"
                    >
                      {c.name}
                    </LocalizedClientLink>
                  </li>
                )
              })}
              
              {/* Colecciones Dinámicas de Medusa */}
               {collections?.slice(0, 2).map((c) => (
                <li key={c.id}>
                  <LocalizedClientLink
                    href={`/collections/${c.handle}`}
                    className="font-inter text-sm text-gray-300 transition-colors hover:text-[#00FFFF]"
                  >
                    {c.title}
                  </LocalizedClientLink>
                </li>
              ))}
            </ul>
          </div>

          {/* COLUMNA 3: INSTITUCIONAL */}
          <div className="text-center md:text-left">
            <h4 className="mb-4 font-inter text-base font-semibold text-white">Nosotros</h4>
            <ul className="space-y-3">
              <li>
                <LocalizedClientLink href="/filosofia" className="font-inter text-sm text-gray-300 transition-colors hover:text-[#00FFFF]">
                  Nuestra Filosofía
                </LocalizedClientLink>
              </li>
              <li>
                <LocalizedClientLink href="/tecnologia" className="font-inter text-sm text-gray-300 transition-colors hover:text-[#00FFFF]">
                  Tecnología Cuántica
                </LocalizedClientLink>
              </li>
              <li>
                <LocalizedClientLink href="/contacto" className="font-inter text-sm text-gray-300 transition-colors hover:text-[#00FFFF]">
                  Contacto
                </LocalizedClientLink>
              </li>
              <li>
                <LocalizedClientLink href="/terms" className="font-inter text-sm text-gray-300 transition-colors hover:text-[#00FFFF]">
                  Términos y Condiciones
                </LocalizedClientLink>
              </li>
            </ul>
          </div>

          {/* COLUMNA 4: REDES SOCIALES */}
          <div className="col-span-2 md:col-span-1 text-center md:text-left">
            <h4 className="mb-4 font-inter text-base font-semibold text-white">Seguinos</h4>
            <div className="flex gap-4 justify-center md:justify-start">
              <a href="#" className="text-gray-300 transition-colors hover:text-[#00FFFF]" aria-label="Instagram">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                  <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                  <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
                </svg>
              </a>
              <a href="#" className="text-gray-300 transition-colors hover:text-[#00FFFF]" aria-label="Facebook">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path>
                </svg>
              </a>
              <a href="#" className="text-gray-300 transition-colors hover:text-[#00FFFF]" aria-label="Email">
                <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <rect x="2" y="4" width="20" height="16" rx="2"></rect>
                  <path d="M22 7l-10 6L2 7"></path>
                </svg>
              </a>
            </div>
          </div>

        </div>
      </div>
    </footer>
  )
}