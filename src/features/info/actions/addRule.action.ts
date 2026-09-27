'use server'

import { revalidatePath } from 'next/cache'
import { actionOk, type ActionResult } from '@/lib/action-result'
import { toActionResult } from '@/lib/action-error'
import { ACTION_ERROR_CODES } from '@/lib/errors'
import { ruleSchema, toFieldErrors } from '@/features/info/schemas/info.schema'
import { addRule } from '@/features/info/services/infoService'
import type { PublicRule } from '@/features/info/types'

export type AddRuleResult = ActionResult<PublicRule>

/**
 * Adds one guideline section.
 *
 * Authorization is the service's job, not the form's: the organizer-only control
 * is rendered conditionally, and this action independently proves ownership
 * before it writes.
 */
export async function addRuleAction(input: unknown): Promise<AddRuleResult> {
  const parsed = ruleSchema.safeParse(input)

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
    const created = await addRule(parsed.data)
    revalidatePath(`/events/${parsed.data.eventId}/rules`)
    return actionOk(created)
  } catch (error) {
    return toActionResult(error)
  }
}
