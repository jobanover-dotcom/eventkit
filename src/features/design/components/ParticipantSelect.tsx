'use client'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FormField } from '@/components/shared/FormField'
import type { ParticipantInfo } from '@/features/design/types'

/**
 * Participant chooser shared by the badge and certificate generators.
 *
 * Checked-in participants are listed first so the common case is one click, and
 * the check-in state is shown inline because the certificate flow depends on it.
 */

type ParticipantSelectProps = {
  id: string
  label: string
  hint?: string
  participants: readonly ParticipantInfo[]
  value: string
  onChange: (id: string) => void
  emptyMessage: string
}

function optionLabel(participant: ParticipantInfo): string {
  return `${participant.name} · ${participant.code}`
}

export function ParticipantSelect({
  id,
  label,
  hint,
  participants,
  value,
  onChange,
  emptyMessage,
}: ParticipantSelectProps) {
  if (participants.length === 0) {
    return (
      <FormField label={label} htmlFor={id}>
        <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-2 text-sm">
          {emptyMessage}
        </p>
      </FormField>
    )
  }

  const checkedIn = participants.filter((participant) => participant.checkedIn)
  const waiting = participants.filter((participant) => !participant.checkedIn)

  return (
    <FormField label={label} htmlFor={id} hint={hint}>
      <Select value={value === '' ? undefined : value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Choose a participant" />
        </SelectTrigger>
        <SelectContent>
          {checkedIn.length > 0 && (
            <>
              <SelectItem value="__checked-in" disabled>
                Checked in
              </SelectItem>
              {checkedIn.map((participant) => (
                <SelectItem key={participant.id} value={participant.id}>
                  {optionLabel(participant)}
                </SelectItem>
              ))}
            </>
          )}

          {waiting.length > 0 && (
            <>
              <SelectItem value="__waiting" disabled>
                Not checked in
              </SelectItem>
              {waiting.map((participant) => (
                <SelectItem key={participant.id} value={participant.id}>
                  {optionLabel(participant)}
                </SelectItem>
              ))}
            </>
          )}
        </SelectContent>
      </Select>
    </FormField>
  )
}
