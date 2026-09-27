import type { Metadata } from 'next'
import Link from 'next/link'
import { BadgeCheck, CalendarDays, MapPin, ShieldX } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { formatEventDate } from '@/lib/format'
import { verifyCertificateToken } from '@/features/certificates/services/verificationService'

type VerifyPageProps = {
  params: Promise<{ verificationToken: string }>
}

export async function generateMetadata({ params }: VerifyPageProps): Promise<Metadata> {
  const { verificationToken } = await params
  const certificate = await verifyCertificateToken(verificationToken)

  return {
    title: certificate ? 'Certificate verified' : 'Certificate not found',
    // A verification page has nothing useful to index, and the token is a
    // credential; keep it out of search results and referrers.
    robots: { index: false, follow: false },
  }
}

/**
 * The public destination a certificate's QR code points at.
 *
 * The QR encodes *this* certificate's token, not the event's id, so scanning it
 * proves a specific certificate was issued to a specific person — a link to the
 * event page alone would only prove the event exists.
 *
 * The page is deliberately read-only and shows no login, no contact details, and
 * no check-in token. Everything here is what somebody holding the printed
 * certificate is entitled to see.
 */
export default async function VerifyCertificatePage({ params }: VerifyPageProps) {
  const { verificationToken } = await params
  const certificate = await verifyCertificateToken(verificationToken)

  if (!certificate) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-12">
        <header className="flex flex-col gap-2">
          <h1 className="font-heading text-2xl font-extrabold tracking-tight sm:text-3xl">
            Certificate Verification
          </h1>
        </header>

        <Card>
          <CardContent className="flex flex-col items-start gap-3 py-8 text-center">
            <ShieldX className="text-destructive size-10" aria-hidden="true" />
            <p className="font-heading text-lg font-bold">Not valid</p>
            <p className="text-muted-foreground mx-auto max-w-md text-sm">
              This certificate could not be verified. The link may be incomplete, or the certificate
              may have been withdrawn. Please check the QR code and try again.
            </p>
          </CardContent>
        </Card>
      </main>
    )
  }

  const details: { label: string; value: string }[] = [
    { label: 'Recipient', value: certificate.recipientName },
    { label: 'Certificate', value: certificate.certificateTitle },
    { label: 'Event', value: certificate.eventName },
    { label: 'Date', value: formatEventDate(certificate.eventDate) },
    { label: 'Role', value: certificate.recipientRoleLabel },
  ]

  // Speaker credentials only. An ordinary participant has neither, and printing
  // an empty row would be worse than omitting it.
  if (certificate.recipientTitle) {
    details.push({ label: 'Title', value: certificate.recipientTitle })
  }
  if (certificate.recipientOrganization) {
    details.push({ label: 'Organization', value: certificate.recipientOrganization })
  }
  if (certificate.award) {
    details.push({ label: 'Award', value: certificate.award })
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-extrabold tracking-tight sm:text-3xl">
          Certificate Verification
        </h1>
        <p className="text-muted-foreground text-sm">
          Scanned from a certificate issued by EventKit.
        </p>
      </header>

      <Card>
        <CardContent className="flex flex-col gap-5 py-6">
          <div className="flex flex-wrap items-center gap-3">
            <BadgeCheck className="text-chart-4 size-8" aria-hidden="true" />
            <p className="font-heading text-xl font-extrabold tracking-tight text-chart-4 uppercase">
              Valid
            </p>
            <Badge variant="secondary">{certificate.recipientRoleLabel}</Badge>
          </div>

          <Separator />

          <dl className="grid gap-4 sm:grid-cols-2">
            {details.map((detail) => (
              <div key={detail.label} className="flex flex-col gap-0.5">
                <dt className="text-muted-foreground text-xs tracking-wide uppercase">
                  {detail.label}
                </dt>
                <dd className="font-medium break-words">{detail.value}</dd>
              </div>
            ))}
          </dl>

          <Separator />

          <div className="text-muted-foreground flex flex-col gap-2 text-sm">
            <p className="flex items-center gap-2">
              <MapPin className="size-4 shrink-0" aria-hidden="true" />
              {certificate.eventVenue}
            </p>
            <p className="flex items-center gap-2">
              <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
              {formatEventDate(certificate.eventDate)}
            </p>
          </div>

          <Button asChild variant="outline" className="w-fit">
            <Link href={`/events/${certificate.eventId}`}>View Event</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}
