import type {
  AnyDesignData,
  BadgeData,
  CertificateData,
  EventBrand,
  ParticipantInfo,
  PhotoFrameData,
  PosterData,
} from '@/features/design/types'

/**
 * Fixed sample content for template thumbnails and for the "no participant
 * chosen yet" preview.
 *
 * It is deliberately the *worst realistic case*: a long name, a long event name,
 * and a venue with no room to spare. If a template looks right here, it copes
 * with real data.
 */

export const SAMPLE_EVENT: EventBrand = {
  name: 'Information Technology Festival 2026',
  theme: '#6d28d9',
  logoUrl: null,
  coverImageUrl: null,
  date: '2026-11-05',
  startTime: '08:00',
  endTime: '17:00',
  venue: 'Assumption College San Juan, Gymnasium',
  organizerName: 'BSIT Department',
  description: 'A one-day festival for IT students.',
}

export const SAMPLE_PARTICIPANT: ParticipantInfo = {
  id: '00000000-0000-4000-8000-000000000000',
  name: 'Maria Cristina Dela Cruz Santos',
  code: 'BSIT-23-0147',
  course: 'BS Information Technology',
  yearSection: '3A',
  sourceRole: 'Student',
  title: null,
  organization: null,
  // Obviously fake, and long enough to exercise the truncation path.
  qrToken: 'samplepreviewtoken0000000000000000000000',
  checkedIn: true,
}

export const SAMPLE_BADGE_DATA: BadgeData = {
  event: SAMPLE_EVENT,
  participant: SAMPLE_PARTICIPANT,
  role: 'Participant',
}

export const SAMPLE_CERTIFICATE_DATA: CertificateData = {
  event: SAMPLE_EVENT,
  recipient: SAMPLE_PARTICIPANT,
  certificateType: 'Participation',
}

export const SAMPLE_POSTER_DATA: PosterData = {
  event: SAMPLE_EVENT,
  contentType: 'Announcement',
  message: 'Come and take part in a full day of talks, workshops, and demos.',
  showQr: true,
}

export const SAMPLE_PHOTO_FRAME_DATA: PhotoFrameData = {
  event: SAMPLE_EVENT,
  // Deliberately different from the frame's own footer line, so the thumbnail
  // shows two distinct pieces of text rather than a duplicated one.
  caption: 'BSIT Graduation Night 2026',
}

export const SAMPLE_DATA_BY_KIND = {
  badge: SAMPLE_BADGE_DATA,
  certificate: SAMPLE_CERTIFICATE_DATA,
  poster: SAMPLE_POSTER_DATA,
  photo_frame: SAMPLE_PHOTO_FRAME_DATA,
} as const satisfies Record<string, AnyDesignData>
