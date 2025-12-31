import { Metadata } from "next"
import Footer from "@modules/layout/templates/footer"
import Nav from "@modules/layout/templates/nav"
import { getBaseURL } from "@lib/util/env"

export const metadata: Metadata = {
  metadataBase: new URL(getBaseURL()),
}

export default async function MainLayout(props: {
  children: React.ReactNode
  params: { countryCode: string }
}) {
  return (
    <>
      <Nav countryCode={props.params.countryCode} />
      {props.children}
      <Footer />
    </>
  )
}