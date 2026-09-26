import type { ReactNode } from 'react'
import { SiteFooter } from '@/components/shared/SiteFooter'
import { SiteHeader } from '@/components/shared/SiteHeader'

/**
 * Marketing shell for the landing page and sign-in. Organizer routes live in
 * `(organizer)` and bring their own chrome, so a page never renders two
 * headers.
 */
export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
    </>
  )
}
