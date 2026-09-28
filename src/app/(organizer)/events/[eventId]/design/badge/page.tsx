import type { Metadata } from 'next'
import { BadgeGenerator } from '@/features/design/components/BadgeGenerator'
import { getDesignContext } from '@/features/design/services/designService'
import { notFoundUnlessHidden } from '@/lib/page-errors'

type BadgePageProps = {
  params: Promise<{ eventId: string }>
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Badges' }
}

export default async function BadgePage({ params }: BadgePageProps) {
  const { eventId } = await params

  let context
  try {
    context = await getDesignContext(eventId)
  } catch (error) {
    notFoundUnlessHidden(error)
  }

  return (
    <BadgeGenerator eventId={eventId} event={context.event} participants={context.participants} />
  )
}
