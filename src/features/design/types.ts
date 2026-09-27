/**
 * Domain types shared across the Design module's server and client boundary.
 *
 * These describe *data*, never presentation. A template turns one of these into
 * pixels; the generators only ever build one of these.
 */

export const DESIGN_KINDS = ['badge', 'certificate', 'poster', 'photo_frame'] as const

export type DesignKind = (typeof DESIGN_KINDS)[number]

export const DESIGN_OUTPUTS = ['png', 'pdf'] as const

export type DesignOutput = (typeof DESIGN_OUTPUTS)[number]

export type DesignKindMeta = {
  kind: DesignKind
  /** Route segment under /events/[eventId]/design. */
  slug: 'badge' | 'certificate' | 'poster' | 'photo-frame'
  title: string
  description: string
  icon: 'badge' | 'certificate' | 'poster' | 'photo-frame'
}

export const DESIGN_KIND_META: readonly DesignKindMeta[] = [
  {
    kind: 'badge',
    slug: 'badge',
    title: 'Badge',
    description: 'Create printable participant badges from templates.',
    icon: 'badge',
  },
  {
    kind: 'certificate',
    slug: 'certificate',
    title: 'Certificate',
    description: 'Generate event certificates.',
    icon: 'certificate',
  },
  {
    kind: 'poster',
    slug: 'poster',
    title: 'Poster',
    description: 'Create event promotional materials.',
    icon: 'poster',
  },
  {
    kind: 'photo_frame',
    slug: 'photo-frame',
    title: 'Photo Frame',
    description: 'Create branded event photo frames.',
    icon: 'photo-frame',
  },
] as const

/** Event fields the templates are allowed to read. Nothing private, nothing user-editable. */
export type EventBrand = {
  name: string
  theme: string
  logoUrl: string | null
  coverImageUrl: string | null
  date: string
  startTime: string
  endTime: string
  venue: string
  organizerName: string
  description: string
}

/** A participant reduced to what a printed design may show. */
export type ParticipantInfo = {
  id: string
  name: string
  /** `student_id` when set, otherwise a short derived fallback. */
  code: string
  course: string | null
  yearSection: string | null
  /** Role as stored on the participant row, before the badge display mapping. */
  sourceRole: string
  /** Speaker title, e.g. "Keynote Speaker". Null for an ordinary participant. */
  title: string | null
  /** Speaker affiliation. Null for an ordinary participant. */
  organization: string | null
  /** The 256-bit token that is the only thing encoded into a QR code. */
  qrToken: string
  checkedIn: boolean
}

// --- badge -----------------------------------------------------------------

export const BADGE_ROLES = ['Participant', 'Speaker', 'Organizer', 'Staff'] as const

export type BadgeRole = (typeof BADGE_ROLES)[number]

/**
 * The participants table stores `Student`, `Guest`, and `Judge` as well as the
 * badge roles. A badge has no separate vocabulary for those, so they all read
 * as `Participant` unless the organizer picks something else.
 */
export function toBadgeRole(sourceRole: string): BadgeRole {
  const match = BADGE_ROLES.find((role) => role === sourceRole)
  return match ?? 'Participant'
}

export type BadgeData = {
  event: EventBrand
  participant: ParticipantInfo
  role: BadgeRole
}

// --- certificate -----------------------------------------------------------

export const CERTIFICATE_TYPES = [
  'Participation',
  'Completion',
  'Appreciation',
  'Recognition',
  'Achievement',
] as const

export type CertificateType = (typeof CERTIFICATE_TYPES)[number]

export type CertificatePreset = {
  title: string
  recognition: string
}

export const CERTIFICATE_PRESETS: Readonly<Record<CertificateType, CertificatePreset>> = {
  Participation: {
    title: 'Certificate of Participation',
    recognition: 'for taking part in',
  },
  Completion: {
    title: 'Certificate of Completion',
    recognition: 'for successfully completing',
  },
  Appreciation: {
    title: 'Certificate of Appreciation',
    recognition: 'for the valued contribution to',
  },
  Recognition: {
    title: 'Certificate of Recognition',
    recognition: 'in recognition of outstanding service to',
  },
  Achievement: {
    title: 'Certificate of Achievement',
    recognition: 'for demonstrating outstanding achievement in',
  },
}

export type CertificateData = {
  event: EventBrand
  recipient: ParticipantInfo
  certificateType: CertificateType
}

// --- poster ----------------------------------------------------------------

export const POSTER_CONTENT_TYPES = ['Announcement', 'Reminder', 'Thank You'] as const

export type PosterContentType = (typeof POSTER_CONTENT_TYPES)[number]

export type PosterPreset = {
  eyebrow: string
  defaultMessage: string
}

export const POSTER_PRESETS: Readonly<Record<PosterContentType, PosterPreset>> = {
  Announcement: {
    eyebrow: 'You are invited',
    defaultMessage: 'Come and take part in a full day of talks, workshops, and demos.',
  },
  Reminder: {
    eyebrow: 'See you soon',
    defaultMessage: 'Bring your student ID and a charged phone. We start on time.',
  },
  'Thank You': {
    eyebrow: 'Thank you for coming',
    defaultMessage: 'We hope you learned something new. See you next year.',
  },
}

export type PosterData = {
  event: EventBrand
  contentType: PosterContentType
  message: string
  showQr: boolean
}

// --- photo frame -----------------------------------------------------------

export type PhotoFrameData = {
  event: EventBrand
  caption: string
}

// --- registry --------------------------------------------------------------

/** A union so a template can be narrowed by its `kind` at compile time. */
export type AnyDesignData = BadgeData | CertificateData | PosterData | PhotoFrameData
