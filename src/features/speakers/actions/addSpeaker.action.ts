'use server'

import { revalidatePath } from 'next/cache'
import { actionOk, type ActionResult } from '@/lib/action-result'
import { toActionResult } from '@/lib/action-error'
import { ACTION_ERROR_CODES } from '@/lib/errors'
import { speakerSchema } from '@/features/speakers/schemas/speaker.schema'
import { toFieldErrors } from '@/features/info/schemas/info.schema'
import { addSpeaker } from '@/features/speakers/services/speakerService'
import type { SpeakerSummary } from '@/features/speakers/types'

export type AddSpeakerResult = ActionResult<SpeakerSummary>

/**
 * Adds a speaker to an event.
 *
 * The role is chosen by the server, not the form. `speakerSchema` has no role
 * field, so even a hand-crafted request naming itself a speaker cannot create
 * one: the payload simply does not carry the value, and the service writes
 * `role = 'Speaker'` itself. Authorization is re-proven inside the service
 * rather than trusted from the fact that the organizer can see this button.
 */
export async function addSpeakerAction(input: unknown): Promise<AddSpeakerResult> {
  const parsed = speakerSchema.safeParse(input)

  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: ACTION_ERROR_CODES.VALIDATION_FAILED,
        message: 'Please fix the highlighted fields.',
        fieldErrors: toFieldErrors(parsed.error),
      },
    }
  }

  try {
    const created = await addSpeaker(parsed.data)
    revalidatePath(`/events/${parsed.data.eventId}/participants`)
    revalidatePath(`/events/${parsed.data.eventId}/attendance`)
    revalidatePath(`/events/${parsed.data.eventId}/design/certificate`)
    return actionOk(created)
  } catch (error) {
    return toActionResult(error)
  }
}
