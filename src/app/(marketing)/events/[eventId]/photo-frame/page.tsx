import type { Metadata } from 'next'
import { PublicPhotoFrameGenerator } from '@/features/design/components/PublicPhotoFrameGenerator'
import { getPublicEvent } from '@/features/events/services/eventService'
import { toEventBrand } from '@/features/design/services/designService'
import { listPublicPhotoFrameTemplates } from '@/features/design/services/publicPhotoFrameTemplateService'
import { notFoundUnlessHidden } from '@/lib/page-errors'

type PublicPhotoFramePageProps = {
  params: Promise<{ eventId: string }>
}

export async function generateMetadata({ params }: PublicPhotoFramePageProps): Promise<Metadata> {
  const { eventId } = await params
  try {
    const { event } = await getPublicEvent(eventId)
    return { title: `Photo frame · ${event.name}`, description: event.description || undefined }
  } catch {
    return { title: 'Photo frame' }
  }
}

/**
 * The public photo-frame page: an anonymous utility attached to an event.
 *
 * `getPublicEvent` is the whole authorization decision, and it is the same one
 * the event page itself makes — `events_select_visible` admits a visitor to a
 * published event and nobody to a closed one, so this page cannot become a way
 * around that. There is no organizer session here, no participant lookup, and
 * nothing written about the visitor.
 *
 * Custom frames come from the organizer's own uploads through the public read
 * path, which is a security-definer function rather than an `anon` grant on
 * `event_design_templates`. If that function is not present — the migration not
 * applied yet — the list is empty and the built-in frames are offered, so the
 * page degrades instead of failing.
 */
export default async function PublicPhotoFramePage({ params }: PublicPhotoFramePageProps) {
  const { eventId } = await params

  let event
  try {
    const publicEvent = await getPublicEvent(eventId)
    event = publicEvent.event
  } catch (error) {
    notFoundUnlessHidden(error)
  }

  const customFrames = await listPublicPhotoFrameTemplates(eventId)

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10 sm:px-6 sm:py-14">
      <PublicPhotoFrameGenerator event={toEventBrand(event)} customFrames={customFrames} />
    </div>
  )
}
