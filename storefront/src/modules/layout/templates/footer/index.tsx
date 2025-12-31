import Link from "next/link"
import { getCategoriesList } from "@lib/data/categories"
import { getCollectionsList } from "@lib/data/collections"

export default async function Footer() {
  const { collections } = await getCollectionsList(0, 6).catch(() => ({ collections: [] }))
  const { product_categories } = await getCategoriesList(0, 6).catch(() => ({ product_categories: [] }))

  return (
    <footer className="bg-[#101010] border-t border-gray-800 text-white">
      <div className="px-4 md:px-6 py-12 md:py-16">
        <div className="mx-auto grid max-w-6xl gap-8 grid-cols-2 md:grid-cols-4">

          {/* COLUMNA 1: LOGO Y COPYRIGHT */}
          <div className="col-span-2 md:col-span-1 text-center md:text-left flex flex-col items-center md:items-start">
            {/* REEMPLAZA ESTA LÍNEA CON LA RUTA A TU LOGO */}
            <img src="/img/logo.png" alt="BUDHA.Om Logo" className="mb-4 h-12 w-auto" />
            {/* Si no tienes imagen y quieres el texto, descomenta esto:
            <h3 className="mb-4 font-poppins text-2xl font-bold text-white uppercase tracking-widest">
              BUDHA.Om
            </h3>
            */}
            <p className="font-inter text-sm leading-relaxed text-gray-400">
              © {new Date().getFullYear()} BUDHA.Om.<br/>Todos los derechos reservados.
            </p>
          </div>

          {/* COLUMNA 2: TIENDA (Dinámica) */}
          <div className="text-center md:text-left">
            <h4 className="mb-4 font-inter text-base font-semibold text-white">Explorar</h4>
            <ul className="space-y-3">
              <li>
                <Link 
                  href="/store" 
                  className="font-inter text-sm text-gray-300 transition-colors hover:text-[#00FFFF]"
                >
                  Ver Todo
                </Link>
              </li>

              {/* Categorías */}
              {product_categories?.slice(0, 4).map((c) => {
                if (c.parent_category) return null
                return (
                  <li key={c.id}>
                    <Link
                      href={`/categories/${c.handle}`}
                      className="font-inter text-sm text-gray-300 transition-colors hover:text-[#00FFFF]"
                    >
                      {c.name}
                    </Link>
                  </li>
                )
              })}
              
              {/* Colecciones */}
               {collections?.slice(0, 2).map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/collections/${c.handle}`}
                    className="font-inter text-sm text-gray-300 transition-colors hover:text-[#00FFFF]"
                  >
                    {c.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* COLUMNA 3: INSTITUCIONAL */}
          <div className="text-center md:text-left">
            <h4 className="mb-4 font-inter text-base font-semibold text-white">Nosotros</h4>
            <ul className="space-y-3">
              <li>
                <Link href="/filosofia" className="font-inter text-sm text-gray-300 transition-colors hover:text-[#00FFFF]">
                  Nuestra Filosofía
                </Link>
              </li>
              <li>
                <Link href="/tecnologia" className="font-inter text-sm text-gray-300 transition-colors hover:text-[#00FFFF]">
                  Tecnología Cuántica
                </Link>
              </li>
              <li>
                <Link href="/contacto" className="font-inter text-sm text-gray-300 transition-colors hover:text-[#00FFFF]">
                  Contacto
                </Link>
              </li>
              <li>
                <Link href="/terms" className="font-inter text-sm text-gray-300 transition-colors hover:text-[#00FFFF]">
                  Términos y Condiciones
                </Link>
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
            </div>
          </div>

        </div>
      </div>
    </footer>
  )
}