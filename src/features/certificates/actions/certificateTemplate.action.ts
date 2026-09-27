'use server'

import { revalidatePath } from 'next/cache'
import { actionFail, actionOk, type ActionResult } from '@/lib/action-result'
import { toActionResult } from '@/lib/action-error'
import { ACTION_ERROR_CODES } from '@/lib/errors'
import {
  certificateDesignConfigSchema,
  toDesignConfig,
  toLayerFieldErrors,
} from '@/features/certificates/templates/configSchema'
import {
  createCertificateTemplate,
  deleteCertificateTemplate,
  updateCertificateTemplateDesign,
  type CertificateTemplate,
} from '@/features/certificates/services/certificateTemplateService'

/**
 * Custom certificate template commands.
 *
 * The design configuration is re-validated here even though the client validated
 * it too. It is a `jsonb` column feeding the renderer for every generated
 * certificate, and a Server Action is a public endpoint: the payload is
 * untrusted however carefully the editor built it.
 *
 * Ownership is proved in the service, never taken from the payload. An event id in
 * a request is a claim, not a fact.
 */

export type TemplateResult = ActionResult<CertificateTemplate>

const NAME_MAX = 80

/**
 * Uploads a cleaned background and its layout together.
 *
 * `File` cannot cross a Server Action boundary inside a plain object, so the PNG
 * arrives in `FormData` beside the JSON configuration. Both are untrusted: the
 * service sniffs the bytes and range-checks the reported dimensions.
 */
export async function createTemplateAction(formData: FormData): Promise<TemplateResult> {
  const eventId = String(formData.get('eventId') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  const width = Number(formData.get('imageWidth'))
  const height = Number(formData.get('imageHeight'))
  const file = formData.get('file')

  if (name.length < 1 || name.length > NAME_MAX) {
    return actionFail(
      ACTION_ERROR_CODES.VALIDATION_FAILED,
      `Give the template a name of ${NAME_MAX} characters or fewer.`
    )
  }

  const parsed = certificateDesignConfigSchema.safeParse(parseJson(formData.get('designConfig')))
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: ACTION_ERROR_CODES.VALIDATION_FAILED,
        message: 'One of the text areas is not configured correctly.',
        fieldErrors: toLayerFieldErrors(parsed.error),
      },
    }
  }

  if (!(file instanceof Blob) || file.size === 0) {
    return actionFail(ACTION_ERROR_CODES.VALIDATION_FAILED, 'The template image is missing.')
  }

  try {
    const saved = await createCertificateTemplate({
      eventId,
      name,
      imageSize: { width, height },
      designConfig: toDesignConfig(parsed.data),
      file,
    })
    revalidatePath(`/events/${eventId}/design/certificate`)
    return actionOk(saved)
  } catch (error) {
    return toActionResult(error)
  }
}

/** Saves an edited layout. The artwork is untouched, so nothing is re-uploaded. */
export async function updateTemplateAction(input: unknown): Promise<TemplateResult> {
  if (typeof input !== 'object' || input === null) {
    return actionFail(ACTION_ERROR_CODES.VALIDATION_FAILED, 'Nothing to save.')
  }

  const raw = input as Record<string, unknown>
  const eventId = String(raw.eventId ?? '')
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''

  if (name.length < 1 || name.length > NAME_MAX) {
    return actionFail(
      ACTION_ERROR_CODES.VALIDATION_FAILED,
      `Give the template a name of ${NAME_MAX} characters or fewer.`
    )
  }

  const parsed = certificateDesignConfigSchema.safeParse(raw.designConfig)
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: ACTION_ERROR_CODES.VALIDATION_FAILED,
        message: 'One of the text areas is not configured correctly.',
        fieldErrors: toLayerFieldErrors(parsed.error),
      },
    }
  }

  try {
    const saved = await updateCertificateTemplateDesign({
      eventId,
      templateId: String(raw.templateId ?? ''),
      name,
      designConfig: toDesignConfig(parsed.data),
    })
    revalidatePath(`/events/${eventId}/design/certificate`)
    return actionOk(saved)
  } catch (error) {
    return toActionResult(error)
  }
}

/**
 * Removes a template.
 *
 * Issued certificates are unaffected: no certificate record, and no verification
 * token, depends on a template still existing.
 */
export async function deleteTemplateAction(input: {
  eventId: string
  templateId: string
}): Promise<ActionResult<{ deleted: true }>> {
  try {
    await deleteCertificateTemplate(input.eventId, input.templateId)
    revalidatePath(`/events/${input.eventId}/design/certificate`)
    return actionOk({ deleted: true as const })
  } catch (error) {
    return toActionResult(error)
  }
}

function parseJson(raw: FormDataEntryValue | null): unknown {
  if (typeof raw !== 'string' || raw === '') return null
  try {
    return JSON.parse(raw)
  } catch {
    // A malformed payload becomes a validation failure rather than a crash.
    return null
  }
}
