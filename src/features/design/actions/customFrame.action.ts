'use server'

import { revalidatePath } from 'next/cache'
import { actionFail, actionOk, type ActionResult } from '@/lib/action-result'
import { toActionResult } from '@/lib/action-error'
import { ACTION_ERROR_CODES } from '@/lib/errors'
import {
  createPhotoFrameTemplate,
  deletePhotoFrameTemplate,
  renamePhotoFrameTemplate,
  type PhotoFrameTemplate,
} from '@/features/design/services/photoFrameTemplateService'
import { defaultPhotoFrameConfig } from '@/features/design/schemas/photoFrameConfig'

/**
 * Custom photo frame commands.
 *
 * Note what is *not* validated here: whether the uploaded artwork actually
 * contains a key colour. The server has no image decoder, and adding one purely
 * to police a boolean would be the wrong trade — so the key-colour check happens
 * in the browser at upload time, purely so the organizer gets told straight
 * away rather than after a round trip.
 *
 * That is acceptable because nothing in the payload can turn the check into a
 * security property. The saved configuration holds no detection result, and the
 * photo mask is derived from the stored PNG every time the frame is loaded to
 * render. A frame with no key colour in it renders with no photo area, which the
 * organizer sees immediately in their own preview.
 *
 * Ownership is proved in the service, never taken from the payload. An event id in
 * a request is a claim, not a fact.
 */

export type PhotoFrameTemplateResult = ActionResult<PhotoFrameTemplate>

const NAME_MAX = 80

/**
 * Uploads the organizer's frame artwork.
 *
 * `File` cannot cross a Server Action boundary inside a plain object, so the PNG
 * arrives in `FormData`. The bytes are untrusted: the service sniffs the PNG
 * signature and range-checks the reported dimensions.
 */
export async function createPhotoFrameAction(
  formData: FormData
): Promise<PhotoFrameTemplateResult> {
  const eventId = String(formData.get('eventId') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  const width = Number(formData.get('imageWidth'))
  const height = Number(formData.get('imageHeight'))
  const file = formData.get('file')

  if (name.length < 1 || name.length > NAME_MAX) {
    return actionFail(
      ACTION_ERROR_CODES.VALIDATION_FAILED,
      `Give the frame a name of ${NAME_MAX} characters or fewer.`
    )
  }

  if (!(file instanceof Blob) || file.size === 0) {
    return actionFail(ACTION_ERROR_CODES.VALIDATION_FAILED, 'The frame image is missing.')
  }

  try {
    const saved = await createPhotoFrameTemplate({
      eventId,
      name,
      imageSize: { width, height },
      // The key colour is the product's, not the organizer's, and no detection
      // result rides along with it.
      designConfig: defaultPhotoFrameConfig(),
      file,
    })
    revalidatePath(`/events/${eventId}/design/photo-frame`)
    return actionOk(saved)
  } catch (error) {
    return toActionResult(error)
  }
}

export async function renamePhotoFrameAction(input: {
  eventId: string
  templateId: string
  name: string
}): Promise<PhotoFrameTemplateResult> {
  const name = input.name.trim()
  if (name.length < 1 || name.length > NAME_MAX) {
    return actionFail(
      ACTION_ERROR_CODES.VALIDATION_FAILED,
      `Give the frame a name of ${NAME_MAX} characters or fewer.`
    )
  }

  try {
    const saved = await renamePhotoFrameTemplate({ ...input, name })
    revalidatePath(`/events/${input.eventId}/design/photo-frame`)
    return actionOk(saved)
  } catch (error) {
    return toActionResult(error)
  }
}

export async function deletePhotoFrameAction(input: {
  eventId: string
  templateId: string
}): Promise<ActionResult<{ deleted: true }>> {
  try {
    await deletePhotoFrameTemplate(input.eventId, input.templateId)
    revalidatePath(`/events/${input.eventId}/design/photo-frame`)
    return actionOk({ deleted: true as const })
  } catch (error) {
    return toActionResult(error)
  }
}
