import type { Metadata } from 'next'
import { CertificateGenerator } from '@/features/design/components/CertificateGenerator'
import { getDesignContext } from '@/features/design/services/designService'
import { listIssuedCertificates } from '@/features/certificates/services/certificateService'
import { notFoundUnlessHidden } from '@/lib/page-errors'

type CertificatePageProps = {
  params: Promise<{ eventId: string }>
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Certificates' }
}

/**
 * Certificates, single and bulk.
 *
 * Issued records are loaded here so a certificate that has already been minted
 * can show its existing verification token, and so a regeneration is visible as
 * a regeneration rather than looking like a second certificate.
 */
export default async function CertificatePage({ params }: CertificatePageProps) {
  const { eventId } = await params

  let context
  let issued
  try {
    ;[context, issued] = await Promise.all([
      getDesignContext(eventId),
      // A missing certificates table would 500 this page, and the generator
      // itself still works without it, so the read is allowed to fail quietly.
      listIssuedCertificates(eventId).catch(() => []),
    ])
  } catch (error) {
    notFoundUnlessHidden(error)
  }

  return (
    <CertificateGenerator
      eventId={eventId}
      event={context.event}
      participants={context.participants}
      checkedInCount={context.checkedInCount}
      customTemplates={context.customTemplates}
      issued={issued}
    />
  )
}
