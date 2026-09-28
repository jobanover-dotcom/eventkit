'use server'

import { revalidatePath } from 'next/cache'
import { actionFail, actionOk, type ActionResult } from '@/lib/action-result'
import { toActionResult } from '@/lib/action-error'
import { ACTION_ERROR_CODES } from '@/lib/errors'
import { removeEventLogo, uploadEventLogo } from '@/features/design/services/eventLogoService'

/**
 * Event logo commands.
 *
 * `File` cannot cross a Server Action boundary inside a plain object, so the image
 * arrives in `FormData` and the bytes are untrusted: the service sniffs them and
 * re-checks the declared type against what it actually is.
 *
 * Ownership is proved in the service, never taken from the payload. An event id in
 * a request is a claim, not a fact.
 *
 * The logo is a shared event field rather than a per-design one, so every design
 * route is revalidated: changing it changes what every template draws.
 */

export type EventLogoResult = ActionResult<{ logoUrl: string | null }>

/** Every page whose preview depends on the logo. */
function revalidateDesign(eventId: string): void {
  for (const section of ['badge', 'certificate', 'poster', 'photo-frame']) {
    revalidatePath(`/events/${eventId}/design/${section}`)
  }
}

export async function setEventLogoAction(formData: FormData): Promise<EventLogoResult> {
  const eventId = String(formData.get('eventId') ?? '')
  const file = formData.get('file')

  if (!(file instanceof Blob) || file.size === 0) {
    return actionFail(ACTION_ERROR_CODES.VALIDATION_FAILED, 'Choose a logo image first.')
  }

  // `FormData.get` yields a real `File` here, which is what the service checks
  // the declared type on. No conversion is needed, and a defensive rebuild would
  // drop the browser's type anyway.
  const upload = file

  try {
    const saved = await uploadEventLogo(eventId, upload)
    revalidateDesign(eventId)
    return actionOk({ logoUrl: saved.logoUrl })
  } catch (error) {
    return toActionResult(error)
  }
}

export async function clearEventLogoAction(input: { eventId: string }): Promise<EventLogoResult> {
  try {
    await removeEventLogo(input.eventId)
    revalidateDesign(input.eventId)
    return actionOk({ logoUrl: null })
  } catch (error) {
    return toActionResult(error)
  }
}
