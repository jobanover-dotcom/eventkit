'use server'

import { revalidatePath } from 'next/cache'
import { actionOk, type ActionResult } from '@/lib/action-result'
import { toActionResult } from '@/lib/action-error'
import { ACTION_ERROR_CODES } from '@/lib/errors'
import { toFieldErrors } from '@/features/info/schemas/info.schema'
import {
  saveTemplateConfigSchema,
  uploadTemplateSchema,
  type CustomTemplateRecord,
} from '@/features/design/schemas/customTemplate.schema'
import {
  deleteCustomTemplate,
  saveCustomTemplateConfig,
  uploadCustomTemplate,
} from '@/features/design/services/customTemplateService'

export type TemplateResult = ActionResult<CustomTemplateRecord>

/**
 * Uploads a custom template and its placeholder mapping.
 *
 * `File` cannot cross a Server Action boundary as a field of a plain object, so
 * it arrives in the `FormData` alongside the validated payload. Everything in it
 * is untrusted: the service re-authorizes the event, sniffs the bytes, and
 * range-checks the reported dimensions.
 */
export async function uploadTemplateAction(formData: FormData): Promise<TemplateResult> {
  const file = formData.get('file')

  const parsed = uploadTemplateSchema.safeParse({
    eventId: formData.get('eventId'),
    kind: formData.get('kind'),
    name: formData.get('name'),
    placeholders: parsePlaceholders(formData.get('placeholders')),
  })

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

  if (!(file instanceof File) || file.size === 0) {
    return {
      ok: false,
      error: {
        code: ACTION_ERROR_CODES.VALIDATION_FAILED,
        message: 'Choose a PNG file to upload.',
        fieldErrors: { file: ['Choose a PNG file to upload.'] },
      },
    }
  }

  // The client decoded the image to measure it, and reports the size. Treated as
  // a hint: the service range-checks it before it reaches the renderer.
  const width = Number(formData.get('imageWidth'))
  const height = Number(formData.get('imageHeight'))

  try {
    const saved = await uploadCustomTemplate(parsed.data, file, { width, height })
    revalidatePath(`/events/${parsed.data.eventId}/design/${slugFor(parsed.data.kind)}`)
    return actionOk(saved)
  } catch (error) {
    return toActionResult(error)
  }
}

export async function saveTemplateConfigAction(input: unknown): Promise<TemplateResult> {
  const parsed = saveTemplateConfigSchema.safeParse(input)

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
    const saved = await saveCustomTemplateConfig(
      parsed.data.eventId,
      parsed.data.templateId,
      parsed.data.placeholders
    )
    revalidatePath(`/events/${parsed.data.eventId}/design`)
    return actionOk(saved)
  } catch (error) {
    return toActionResult(error)
  }
}

export async function deleteTemplateAction(input: {
  eventId: string
  templateId: string
}): Promise<ActionResult<{ deleted: true }>> {
  try {
    await deleteCustomTemplate(input.eventId, input.templateId)
    revalidatePath(`/events/${input.eventId}/design`)
    return actionOk({ deleted: true as const })
  } catch (error) {
    return toActionResult(error)
  }
}

function parsePlaceholders(raw: FormDataEntryValue | null): unknown {
  if (typeof raw !== 'string' || raw.trim() === '') return []
  try {
    return JSON.parse(raw)
  } catch {
    // A malformed payload falls through to the schema, which reports it as a
    // validation failure rather than crashing the action.
    return null
  }
}

function slugFor(kind: string): string {
  return kind === 'photo_frame' ? 'photo-frame' : kind
}
