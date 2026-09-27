'use server'

import { actionOk, type ActionResult } from '@/lib/action-result'
import { toActionResult } from '@/lib/action-error'
import { ACTION_ERROR_CODES } from '@/lib/errors'
import { checkInSchema, toFieldErrors } from '@/features/attendance/schemas/attendance.schema'
import { checkInByToken } from '@/features/attendance/services/attendanceService'
import type { CheckInOutcome } from '@/features/attendance/lib/checkIn'

export type CheckInResult = ActionResult<CheckInOutcome>

/**
 * Check-in entry point for the scanner.
 *
 * A Server Action is a public endpoint, so nothing here is trusted: the payload
 * is parsed, the service proves the session and the event ownership, matches the
 * token, and confirms the participant belongs to *this* event before writing.
 * The client only learns whether the scan worked and who it was for.
 *
 * Navigation stays with the caller. A redirect thrown from here would have to be
 * told apart from a real failure, and the scanner deliberately stays on the page
 * between scans.
 */
export async function checkInAction(input: unknown): Promise<CheckInResult> {
  const parsed = checkInSchema.safeParse(input)

  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: ACTION_ERROR_CODES.VALIDATION_FAILED,
        message: 'Scan a participant QR code first.',
        fieldErrors: toFieldErrors(parsed.error),
      },
    }
  }

  try {
    return actionOk(await checkInByToken(parsed.data.eventId, parsed.data.token))
  } catch (error) {
    return toActionResult(error)
  }
}
