/**
 * Speaker read models.
 *
 * A speaker is a `participants` row with `role = 'Speaker'`. There is no
 * speaker table, and the view model stays deliberately thin: it is the same
 * person a certificate recipient and a pass holder need, plus the two free-text
 * profile fields that make a speaker's certificate distinguishable from a
 * participant's.
 */

import type { ParticipantType } from '@/lib/participantType'

/** What the organizer sees after adding a speaker. */
export type SpeakerSummary = {
  id: string
  name: string
  email: string | null
  organization: string | null
  title: string | null
  /** The check-in token. Identical in kind to a participant's; not shown here. */
  qrToken: string
  participantType: ParticipantType
}
