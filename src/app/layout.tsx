import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { ThemeProvider } from '@/components/shared/ThemeProvider'
import { ThemeScript } from '@/components/shared/ThemeScript'
import { Toaster } from '@/components/ui/sonner'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'EventKit — the simple event toolkit',
    template: '%s · EventKit',
  },
  description:
    'Create an event once, then reuse its name, date, venue, and branding across badges, certificates, posters, photo frames, and QR check-in.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#17141c' },
  ],
}

/**
 * Only document-level concerns live here. Each route group supplies its own
 * chrome, so the root layout never renders a second header.
 */
export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // `suppressHydrationWarning` is required, not cosmetic: the theme script
    // below adds a class to <html> before React hydrates, so the server-rendered
    // element and the client DOM genuinely differ.
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh antialiased">
        {/*
          First child of the body so it runs before anything paints. Server
          rendered on purpose: React does not execute a <script> produced while
          rendering on the client, and reports it as an error.
        */}
        <ThemeScript />
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
