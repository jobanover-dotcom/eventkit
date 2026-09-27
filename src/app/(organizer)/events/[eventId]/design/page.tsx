import type { Metadata } from 'next'
import { DesignHub } from '@/features/design/components/DesignHub'
import { getDesignContext } from '@/features/design/services/designService'
import { notFoundUnlessHidden } from '@/lib/page-errors'

type DesignHubPageProps = {
  params: Promise<{ eventId: string }>
}

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Design' }
}

export default async function DesignHubPage({ params }: DesignHubPageProps) {
  const { eventId } = await params

  // The try block only awaits data. Rendering happens after it, because a
  // component that throws during render is not something a try/catch can catch.
  let context
  try {
    // Authorization happens here, not in the child links: a design page for
    // somebody else's event must 404, not render a hub of empty generators.
    context = await getDesignContext(eventId)
  } catch (error) {
    notFoundUnlessHidden(error)
  }

  return <DesignHub eventId={context.eventId} />
}
