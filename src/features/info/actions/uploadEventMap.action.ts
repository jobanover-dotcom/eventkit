'use server'

import { revalidatePath } from 'next/cache'
import { actionOk, type ActionResult } from '@/lib/action-result'
import { toActionResult } from '@/lib/action-error'
import { ACTION_ERROR_CODES } from '@/lib/errors'
import { uploadEventMap } from '@/features/info/services/infoService'
import { z } from 'zod'

export type UploadEventMapResult = ActionResult<{ mapUrl: string }>

/**
 * A `File` cannot be described by a plain JSON payload, so the upload accepts
 * `FormData` and takes the two fields it needs. Everything else in the form is
 * ignored rather than trusted.
 */
const uploadFormSchema = z.object({
  eventId: z.uuid('That event link is not valid.'),
})

export async function uploadEventMapAction(input: unknown): Promise<UploadEventMapResult> {
  if (!(input instanceof FormData)) {
    return {
      ok: false,
      error: { code: ACTION_ERROR_CODES.VALIDATION_FAILED, message: 'Choose an image to upload.' },
    }
  }

  const parsed = uploadFormSchema.safeParse({
    eventId: input.get('eventId'),
  })

  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: ACTION_ERROR_CODES.VALIDATION_FAILED,
        message: 'Choose an image to upload.',
        fieldErrors: { eventId: ['That event link is not valid.'] },
      },
    }
  }

  const file = input.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return {
      ok: false,
      error: { code: ACTION_ERROR_CODES.VALIDATION_FAILED, message: 'Choose an image to upload.' },
    }
  }

  try {
    // The service authenticates, proves ownership of `eventId`, validates the
    // file, and writes through the caller's own session so the storage policy is
    // a real second check.
    const result = await uploadEventMap(parsed.data.eventId, file)
    revalidatePath(`/events/${parsed.data.eventId}/map`)
    revalidatePath(`/events/${parsed.data.eventId}`)
    return actionOk(result)
  } catch (error) {
    return toActionResult(error)
  }
}
