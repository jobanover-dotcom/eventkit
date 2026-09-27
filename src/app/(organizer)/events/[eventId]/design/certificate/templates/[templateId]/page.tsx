import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { CertificateTemplateEditor } from '@/features/certificates/components/CertificateTemplateEditor'
import { getCertificateTemplate } from '@/features/certificates/services/certificateTemplateService'
import { notFoundUnlessHidden } from '@/lib/page-errors'
import { ACTION_ERROR_CODES, AppError } from '@/lib/errors'

type TemplateEditorPageProps = {
  params: Promise<{ eventId: string; templateId: string }>
}

export async function generateMetadata({ params }: TemplateEditorPageProps): Promise<Metadata> {
  const { templateId } = await params
  return { title: templateId === 'new' ? 'New certificate template' : 'Edit certificate template' }
}

/**
 * The certificate template editor.
 *
 * One route serves both jobs. `new` starts from a PNG upload, and a real
 * template id loads the stored background and layout for editing, so create and
 * edit share every component and cannot drift apart. Editing never asks for the
 * PNG again: the background is already stored.
 */
export default async function TemplateEditorPage({ params }: TemplateEditorPageProps) {
  const { eventId, templateId } = await params
  const isNew = templateId === 'new'

  if (isNew) {
    return <CertificateTemplateEditor eventId={eventId} />
  }

  let template
  try {
    template = await getCertificateTemplate(eventId, templateId)
  } catch (error) {
    if (error instanceof AppError && error.code === ACTION_ERROR_CODES.NOT_FOUND) notFound()
    // A stored layout that will not parse is a broken template, not a broken
    // page: say so rather than 404 a template the organizer can still delete.
    notFoundUnlessHidden(error)
  }

  return <CertificateTemplateEditor eventId={eventId} template={template} />
}
