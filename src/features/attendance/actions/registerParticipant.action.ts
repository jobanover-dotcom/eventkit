'use server'

import { revalidatePath } from 'next/cache'
import { actionOk, type ActionResult } from '@/lib/action-result'
import { toActionResult } from '@/lib/action-error'
import { ACTION_ERROR_CODES } from '@/lib/errors'
import { registrationSchema, toFieldErrors } from '@/features/attendance/schemas/attendance.schema'
import { registerParticipant } from '@/features/attendance/services/attendanceService'
import type { EventRow } from '@/features/events/repositories/eventRepository'

/**
 * What the form needs to render the pass straight after registering: the token to
 * encode, and just enough event detail to label it.
 *
 * The token is returned in the action result and rendered in place. It is
 * deliberately never put in a URL, because a pass link is a bearer secret and
 * this module does not add a token-shaped public surface.
 */
export type RegistrationPass = {
  participantId: string
  qrToken: string
  event: {
    name: string
    date: string
    startTime: string
    endTime: string
    venue: string
    organizerName: string
  }
  participant: {
    name: string
    code: string
  }
}

export type RegisterParticipantResult = ActionResult<RegistrationPass>

/**
 * Public registration. Anyone with the event link may call it, which is exactly
 * what `register_participant()` is for: it is a `SECURITY DEFINER` function that
 * carries its own authorization and mints the `qr_token` from the column
 * default, so no visitor can write a row or choose their own credential.
 */
export async function registerParticipantAction(
  input: unknown
): Promise<RegisterParticipantResult> {
  const parsed = registrationSchema.safeParse(input)

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
    const result = await registerParticipant(parsed.data)

    // The organizer's roster and attendance sheets are now one row different.
    // The public pages are not cached, so nothing else needs revalidating.
    revalidatePath(`/events/${result.event.id}/participants`)
    revalidatePath(`/events/${result.event.id}/attendance`)

    return actionOk(
      toPass(
        result.event,
        result.participantId,
        result.qrToken,
        parsed.data.name,
        parsed.data.studentId
      )
    )
  } catch (error) {
    return toActionResult(error)
  }
}

function toPass(
  event: EventRow,
  participantId: string,
  qrToken: string,
  name: string,
  studentId: string
): RegistrationPass {
  return {
    participantId,
    qrToken,
    event: {
      name: event.name,
      date: event.date,
      startTime: event.start_time,
      endTime: event.end_time,
      venue: event.venue,
      organizerName: event.organizer_name,
    },
    participant: {
      name,
      // Matches the organizer-side code derivation, so the same person is
      // labelled identically on the pass and in the roster.
      code: studentId.trim() || participantId.slice(0, 8).toUpperCase(),
    },
  }
}
