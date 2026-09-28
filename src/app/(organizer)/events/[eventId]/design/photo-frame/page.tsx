import type { Metadata } from 'next'
import { PhotoFrameGenerator } from '@/features/design/components/PhotoFrameGenerator'
import { CustomFrameManager } from '@/features/design/components/CustomFrameManager'
import { CustomFrameUpload } from '@/features/design/components/CustomFrameUpload'
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

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          Use one of the built-in frames, or add your own artwork with a {`#22ff00`} photo area.
        </p>
        <CustomFrameUpload eventId={eventId} />
      </div>

      <CustomFrameManager eventId={eventId} frames={context.customPhotoFrames} />

      <PhotoFrameGenerator event={context.event} customFrames={context.customPhotoFrames} />
    </div>
  )
}
