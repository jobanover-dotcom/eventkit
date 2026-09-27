import { z } from 'zod'
import { CERTIFICATE_TYPES } from '@/features/design/types'
import { PARTICIPANT_TYPES } from '@/lib/participantType'

/**
 * Validation for the organizer-only certificate issuance command.
 *
 * The recipient type is an enum of exactly two values rather than a free string,
 * so a request cannot name a third group. The ids are checked for shape here and
 * for eligibility in the service, which is the check that actually matters.
 */

export const issueCertificatesSchema = z.object({
  eventId: z.uuid('That event link is not valid.'),
  type: z.enum(PARTICIPANT_TYPES, { message: 'Choose participants or speakers.' }),
  certificateType: z.enum(CERTIFICATE_TYPES, { message: 'Choose a certificate type.' }),
  participantIds: z
    .array(z.uuid('One of the selected recipients is not valid.'))
    .min(1, 'Choose at least one recipient.')
    .max(500, 'Select at most 500 recipients at a time.'),
  /** Free text, shown on the certificate beside the type. */
  award: z.string().trim().max(200, 'Keep the award under 200 characters').optional().default(''),
  signatory: z
    .string()
    .trim()
    .max(120, 'Keep the signatory under 120 characters')
    .optional()
    .default(''),
})

export type IssueCertificatesInput = z.input<typeof issueCertificatesSchema>
export type IssueCertificatesValues = z.output<typeof issueCertificatesSchema>
