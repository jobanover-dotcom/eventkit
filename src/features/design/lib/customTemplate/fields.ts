import type { DesignKind } from '@/features/design/types'
import type { ParticipantType } from '@/lib/participantType'

/**
 * The dynamic fields a custom template can place.
 *
 * A `#00B140` rectangle only says *where* content goes, never *what* it is —
 * the colour carries no type information. So the organizer assigns every
 * detected rectangle to one of these fields after uploading, and that mapping is
 * saved with the template. Without this step a generator would be guessing
 * whether a green box wanted a name or a photograph.
 *
 * The list is per design kind and every entry maps to a value the existing data
 * model actually has. There is no field here for something the database does not
 * store, so a template can never be assigned to render invented data.
 */

export const PLACEHOLDER_TYPES = ['TEXT', 'PHOTO', 'QR'] as const

export type PlaceholderType = (typeof PLACEHOLDER_TYPES)[number]

export const TEMPLATE_FIELDS = [
  'recipient_name',
  'event_name',
  'event_date',
  'event_venue',
  'certificate_type',
  'role',
  'title',
  'organization',
  'recipient_photo',
  'verification_qr',
] as const

export type TemplateField = (typeof TEMPLATE_FIELDS)[number]

export type TemplateFieldMeta = {
  field: TemplateField
  label: string
  type: PlaceholderType
  /** True when the value may be absent, so a blank is normal rather than a bug. */
  optional: boolean
  description: string
}

const SHARED: readonly TemplateFieldMeta[] = [
  {
    field: 'recipient_name',
    label: 'Recipient Name',
    type: 'TEXT',
    optional: false,
    description: 'The participant’s or speaker’s full name.',
  },
  {
    field: 'event_name',
    label: 'Event Name',
    type: 'TEXT',
    optional: false,
    description: 'The event this certificate belongs to.',
  },
]

const CERTIFICATE_FIELDS: readonly TemplateFieldMeta[] = [
  {
    field: 'certificate_type',
    label: 'Certificate Type',
    type: 'TEXT',
    optional: false,
    description: 'For example “Certificate of Appreciation”.',
  },
  {
    field: 'event_date',
    label: 'Date',
    type: 'TEXT',
    optional: false,
    description: 'The event date.',
  },
  {
    field: 'event_venue',
    label: 'Venue',
    type: 'TEXT',
    optional: true,
    description: 'Where the event is held.',
  },
  {
    field: 'role',
    label: 'Role',
    type: 'TEXT',
    optional: false,
    description: 'Reads “Participant” or “Speaker”.',
  },
  {
    field: 'title',
    label: 'Role / Title',
    type: 'TEXT',
    optional: true,
    description: 'A speaker’s own title, e.g. “Keynote Speaker”. Empty for participants.',
  },
  {
    field: 'organization',
    label: 'Organization',
    type: 'TEXT',
    optional: true,
    description: 'A speaker’s affiliation. Empty for participants.',
  },
  {
    field: 'recipient_photo',
    label: 'Recipient Photo',
    type: 'PHOTO',
    optional: true,
    description: 'The recipient’s photo, cropped to fill. Blank when none is set.',
  },
  {
    field: 'verification_qr',
    label: 'Verification QR',
    type: 'QR',
    optional: false,
    description: 'The certificate’s verification code. Scannable at print size.',
  },
]

const BADGE_FIELDS: readonly TemplateFieldMeta[] = [
  { field: 'role', label: 'Role', type: 'TEXT', optional: false, description: 'Badge role.' },
  {
    field: 'title',
    label: 'Role / Title',
    type: 'TEXT',
    optional: true,
    description: 'Speaker title.',
  },
  {
    field: 'organization',
    label: 'Organization',
    type: 'TEXT',
    optional: true,
    description: 'Speaker affiliation.',
  },
  {
    field: 'recipient_photo',
    label: 'Recipient Photo',
    type: 'PHOTO',
    optional: true,
    description: 'Recipient photo, cropped to fill.',
  },
]

const POSTER_FIELDS: readonly TemplateFieldMeta[] = [
  {
    field: 'event_date',
    label: 'Event Date',
    type: 'TEXT',
    optional: false,
    description: 'Event date.',
  },
  {
    field: 'event_venue',
    label: 'Venue',
    type: 'TEXT',
    optional: true,
    description: 'Event venue.',
  },
  {
    field: 'verification_qr',
    label: 'Registration QR',
    type: 'QR',
    optional: true,
    description: 'Join QR.',
  },
]

const PHOTO_FRAME_FIELDS: readonly TemplateFieldMeta[] = [
  {
    field: 'event_venue',
    label: 'Venue',
    type: 'TEXT',
    optional: true,
    description: 'Event venue.',
  },
  {
    field: 'event_date',
    label: 'Event Date',
    type: 'TEXT',
    optional: false,
    description: 'Event date.',
  },
]

const FIELDS_BY_KIND: Readonly<Record<DesignKind, readonly TemplateFieldMeta[]>> = {
  certificate: [...SHARED, ...CERTIFICATE_FIELDS],
  badge: [
    ...SHARED,
    {
      field: 'event_date',
      label: 'Event Date',
      type: 'TEXT',
      optional: false,
      description: 'Event date.',
    },
    ...BADGE_FIELDS,
  ],
  poster: [...SHARED, ...POSTER_FIELDS],
  photo_frame: [...SHARED, ...PHOTO_FRAME_FIELDS],
}

export function templateFieldsFor(kind: DesignKind): readonly TemplateFieldMeta[] {
  return FIELDS_BY_KIND[kind]
}

/** Narrows a list to the fields a given placeholder type can accept. */
export function fieldsOfType(
  kind: DesignKind,
  type: PlaceholderType
): readonly TemplateFieldMeta[] {
  return templateFieldsFor(kind).filter((meta) => meta.type === type)
}

export function findFieldMeta(
  kind: DesignKind,
  field: TemplateField
): TemplateFieldMeta | undefined {
  return templateFieldsFor(kind).find((meta) => meta.field === field)
}

/**
 * Every field a template should use to be considered complete.
 *
 * A template missing one of these is still renderable — the slot simply draws
 * nothing — but the organizer is told, because a certificate whose recipient
 * name is unmapped is not a certificate.
 */
export function requiredFieldsFor(kind: DesignKind): readonly TemplateFieldMeta[] {
  return templateFieldsFor(kind).filter((meta) => !meta.optional)
}

export type { ParticipantType }
