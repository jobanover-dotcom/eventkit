'use server'

import { revalidatePath } from 'next/cache'
import { actionOk, type ActionResult } from '@/lib/action-result'
import { toActionResult } from '@/lib/action-error'
import { ACTION_ERROR_CODES } from '@/lib/errors'
import { eventSchema, toFieldErrors } from '@/features/events/schemas/event.schema'
import { createEvent } from '@/features/events/services/eventService'

export type CreateEventResult = ActionResult<{ eventId: string }>

/**
 * Server Action entry point. Server Actions are public endpoints, so this
 * validates untrusted input, then the service authenticates and authorizes
 * before touching the database. The caller receives only the new event id.
 *
 * Navigation is the caller's job: a redirect thrown here would have to be
 * distinguished from a real failure, and the form already knows where to go.
 */
export async function createEventAction(input: unknown): Promise<CreateEventResult> {
  const parsed = eventSchema.safeParse(input)

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
    const created = await createEvent(parsed.data)
    revalidatePath('/dashboard')
    return actionOk({ eventId: created.id })
  } catch (error) {
    return toActionResult(error)
  }
}
