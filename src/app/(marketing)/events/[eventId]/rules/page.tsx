import type { Metadata } from 'next'
import { InfoEmptyState, InfoPageShell } from '@/features/info/components/InfoPageShell'
import { RulesList } from '@/features/info/components/RulesList'
import { AddRuleForm } from '@/features/info/components/AddRuleForm'
import { getPublicRules } from '@/features/info/services/infoService'
import { notFoundUnlessHidden } from '@/lib/page-errors'

type RulesPageProps = {
  params: Promise<{ eventId: string }>
}

export const metadata: Metadata = {
  title: 'Rules',
  description: 'Guidelines for this event.',
}

/**
 * The public guidelines.
 *
 * Public for the same reason as the schedule: `/rules` is absent from the
 * organizer route pattern so the proxy does not intercept a participant.
 */
export default async function RulesPage({ params }: RulesPageProps) {
  const { eventId } = await params

  let page
  try {
    page = await getPublicRules(eventId)
  } catch (error) {
    notFoundUnlessHidden(error)
  }

  return (
    <InfoPageShell
      eventId={page.event.id}
      eventName={page.event.name}
      title="Rules"
      description="What to know before you arrive."
    >
      {page.rules.length > 0 ? (
        <RulesList rules={page.rules} />
      ) : (
        <InfoEmptyState message="No rules have been published yet." />
      )}

      {page.isOrganizer && (
        <section aria-label="Organizer tools" className="flex flex-col gap-3">
          <h2 className="text-muted-foreground text-sm font-medium">Organizer</h2>
          <AddRuleForm eventId={page.event.id} />
        </section>
      )}
    </InfoPageShell>
  )
}
