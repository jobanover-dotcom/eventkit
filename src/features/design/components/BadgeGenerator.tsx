'use client'

import { useMemo, useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { DesignStudio } from '@/features/design/components/DesignStudio'
import { FormField } from '@/components/shared/FormField'
import { ParticipantSelect } from '@/features/design/components/ParticipantSelect'
import { EventLogoField } from '@/features/design/components/EventLogoField'
import { BadgeBulkPanel } from '@/features/design/components/BadgeBulkPanel'
import { BADGE_TEMPLATES } from '@/features/design/lib/templates'
import {
  BADGE_ROLES,
  toBadgeRole,
  type BadgeData,
  type BadgeRole,
  type EventBrand,
  type ParticipantInfo,
} from '@/features/design/types'
import { SAMPLE_PARTICIPANT } from '@/features/design/lib/sampleData'

type BadgeGeneratorProps = {
  eventId: string
  event: EventBrand
  participants: readonly ParticipantInfo[]
}

/**
 * Badge flow: logo, participant, then template, then preview, generate, download.
 * Everything already known about the event and the participant is filled in
 * from the database — the organizer only picks who, which look, and whether there
 * is a logo to print.
 *
 * A bulk run for a whole room sits below the single badge, separated, because it is
 * a different job rather than a next step in this one: it needs no preview and no
 * per-person choice, and it must not be reachable by a stray click.
 */
export function BadgeGenerator({ eventId, event, participants }: BadgeGeneratorProps) {
  const [participantId, setParticipantId] = useState('')
  const [role, setRole] = useState<BadgeRole>('Participant')

  // The bulk run picks its own template, seeded from the built-ins rather than from
  // the preview, so changing the single badge's look does not silently restyle a
  // run that is half set up. Certificates do the same.
  const [bulkTemplateId, setBulkTemplateId] = useState(BADGE_TEMPLATES[0]?.id ?? '')

  const participant = useMemo(
    () => participants.find((candidate) => candidate.id === participantId) ?? null,
    [participants, participantId]
  )

  // A sensible preview before anyone is chosen, so the page is never empty.
  const previewParticipant = participant ?? SAMPLE_PARTICIPANT

  const data: BadgeData = useMemo(
    () => ({
      event,
      participant: previewParticipant,
      role: participant ? toBadgeRole(participant.sourceRole) : role,
    }),
    [event, previewParticipant, participant, role]
  )

  const filenameBase = participant
    ? `${event.name} badge ${participant.name}`
    : `${event.name} badge`

  return (
    <div className="flex flex-col gap-10">
      <DesignStudio<BadgeData>
        kind="badge"
        heading="Badges"
        description="A printable badge for one participant, with their check-in QR code. Names, course, and participant code come from the registration record."
        templates={BADGE_TEMPLATES}
        data={data}
        includeQr
        filenameBase={filenameBase}
        blockedReason={participant ? undefined : 'Choose a participant to generate their badge.'}
        fields={
          <>
            <EventLogoField eventId={eventId} logoUrl={event.logoUrl} />

            <ParticipantSelect
              id="badge-participant"
              label="Participant"
              hint="The QR code is the participant's own check-in token."
              participants={participants}
              value={participantId}
              onChange={setParticipantId}
              emptyMessage="Nobody has registered for this event yet."
            />

            <FormField
              label="Badge role"
              htmlFor="badge-role"
              hint={
                participant
                  ? `Registered as ${participant.sourceRole}. Change it if this badge is not for their registered role.`
                  : 'Shown on the badge next to the participant name.'
              }
            >
              <Select value={role} onValueChange={(next) => setRole(next as BadgeRole)}>
                <SelectTrigger id="badge-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BADGE_ROLES.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </>
        }
      />

      <BadgeBulkPanel
        event={event}
        participants={participants}
        templates={BADGE_TEMPLATES}
        templateId={bulkTemplateId}
        onTemplateChange={setBulkTemplateId}
      />
    </div>
  )
}
