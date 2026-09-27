'use server'

import { revalidatePath } from 'next/cache'
import { actionOk, type ActionResult } from '@/lib/action-result'
import { toActionResult } from '@/lib/action-error'
import { ACTION_ERROR_CODES } from '@/lib/errors'
import { scheduleItemSchema, toFieldErrors } from '@/features/info/schemas/info.schema'
import { addScheduleItem } from '@/features/info/services/infoService'
import type { PublicScheduleItem } from '@/features/info/types'

export type AddScheduleItemResult = ActionResult<PublicScheduleItem>

/**
 * Adds one programme item.
 *
 * A Server Action is a public endpoint, so nothing here is trusted: the payload
 * is parsed, then the service authenticates, proves the caller owns the event,
 * and only then writes. The organizer flag on the page is a convenience; this
 * check is the control.
 */
export async function addScheduleItemAction(input: unknown): Promise<AddScheduleItemResult> {
  const parsed = scheduleItemSchema.safeParse(input)

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
    const created = await addScheduleItem(parsed.data)
    revalidatePath(`/events/${parsed.data.eventId}/schedule`)
    return actionOk(created)
  } catch (error) {
    return toActionResult(error)
  }
}
