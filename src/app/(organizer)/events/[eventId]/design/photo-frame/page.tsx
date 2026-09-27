import type { Metadata } from 'next'
import { PhotoFrameGenerator } from '@/features/design/components/PhotoFrameGenerator'
import { getDesignContext } from '@/features/design/services/designService'
import { notFoundUnlessHidden } from '@/lib/page-errors'

type PhotoFramePageProps = {
  params: Promise<{ eventId: string }>
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Photo frames' }
}

export default async function PhotoFramePage({ params }: PhotoFramePageProps) {
  const { eventId } = await params

  let context
  try {
    context = await getDesignContext(eventId)
  } catch (error) {
    notFoundUnlessHidden(error)
  }

  return <PhotoFrameGenerator event={context.event} />
}
