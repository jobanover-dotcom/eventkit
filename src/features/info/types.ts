/**
 * Read models for the participant-facing Info pages.
 *
 * These are not database rows. Keeping them separate means a column rename
 * cannot leak into a component prop, and it lets the owner-only authoring
 * commands return a different shape from the public reads.
 */

export type PublicScheduleItem = {
  id: string
  title: string
  description: string
  startTime: string
  endTime: string
  location: string
  sortOrder: number
}

export type PublicRule = {
  id: string
  title: string
  content: string
  sortOrder: number
}

/** The venue half of the Map & Venue page, straight off the event row. */
export type PublicVenue = {
  name: string
  venue: string
  mapUrl: string | null
}

export type InfoSection = 'schedule' | 'map' | 'rules'

export const INFO_SECTIONS: readonly InfoSection[] = ['schedule', 'map', 'rules']
