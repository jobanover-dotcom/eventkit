import type { Metadata } from 'next'
import { PosterGenerator } from '@/features/design/components/PosterGenerator'
import { getDesignContext } from '@/features/design/services/designService'
import { notFoundUnlessHidden } from '@/lib/page-errors'

type PosterPageProps = {
  params: Promise<{ eventId: string }>
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Posters' }
}

export default async function PosterPage({ params }: PosterPageProps) {
  const { eventId } = await params

  let context
  try {
    context = await getDesignContext(eventId)
  } catch (error) {
    notFoundUnlessHidden(error)
  }

  return <PosterGenerator event={context.event} />
}
