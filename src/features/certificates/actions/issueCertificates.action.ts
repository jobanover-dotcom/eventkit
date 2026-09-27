'use server'

import { revalidatePath } from 'next/cache'
import { actionOk, type ActionResult } from '@/lib/action-result'
import { toActionResult } from '@/lib/action-error'
import { ACTION_ERROR_CODES } from '@/lib/errors'
import { toFieldErrors } from '@/features/info/schemas/info.schema'
import { issueCertificatesSchema } from '@/features/certificates/schemas/certificate.schema'
import {
  issueCertificates,
  type IssueCertificatesOutcome,
} from '@/features/certificates/services/certificateService'

export type IssueCertificatesResult = ActionResult<IssueCertificatesOutcome>

/**
 * Creates or refreshes the certificate records for a set of recipients.
 *
 * This does not draw anything. It mints the records — and therefore the
 * verification tokens — that the browser then renders. Keeping the two apart
 * means a failed render can be retried without issuing a second certificate, and
 * the authorization decision happens once, on the server, against the roster
 * rather than against whatever the client believes it selected.
 */
export async function issueCertificatesAction(input: unknown): Promise<IssueCertificatesResult> {
  const parsed = issueCertificatesSchema.safeParse(input)

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
    const outcome = await issueCertificates(parsed.data)
    revalidatePath(`/events/${parsed.data.eventId}/design/certificate`)
    return actionOk(outcome)
  } catch (error) {
    return toActionResult(error)
  }
}
