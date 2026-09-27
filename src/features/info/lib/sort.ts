import type { PublicRule, PublicScheduleItem } from '@/features/info/types'

/**
 * Ordering for the Info pages, kept pure so it is directly testable.
 *
 * The database could sort both of these, but a school event has tens of rows,
 * so sorting in the service is free — and it means the ordering contract is a
 * unit test rather than a SQL string nobody reads.
 */

/**
 * A programme is chronological: a participant scans for "what is on at 10am".
 * `sort_order` exists for a manual override, so it breaks ties between items
 * starting at the same time, and `created_at` makes the result stable when both
 * are equal.
 *
 * Note the `schedules` table has no date column — an event is a single day — so
 * there is nothing to group by date and the order above is the whole story.
 */
export function compareScheduleItems(a: PublicScheduleItem, b: PublicScheduleItem): number {
  const byStart = a.startTime.localeCompare(b.startTime)
  if (byStart !== 0) return byStart

  const byOrder = a.sortOrder - b.sortOrder
  if (byOrder !== 0) return byOrder

  return a.id.localeCompare(b.id)
}

/** Rules have no time field, so `sort_order` is the author's own sequence. */
export function compareRules(a: PublicRule, b: PublicRule): number {
  const byOrder = a.sortOrder - b.sortOrder
  if (byOrder !== 0) return byOrder

  return a.id.localeCompare(b.id)
}

export function sortScheduleItems(items: readonly PublicScheduleItem[]): PublicScheduleItem[] {
  return [...items].sort(compareScheduleItems)
}

export function sortRules(rules: readonly PublicRule[]): PublicRule[] {
  return [...rules].sort(compareRules)
}

/**
 * Groups consecutive items that share a start time, so a parallel programme
 * reads as one slot rather than two loose rows. Purely presentational: a schedule
 * has no notion of a slot, this is just how the list is drawn.
 */
export type ScheduleSlot = {
  startTime: string
  endTime: string
  items: PublicScheduleItem[]
}

export function groupIntoSlots(items: readonly PublicScheduleItem[]): ScheduleSlot[] {
  const slots: ScheduleSlot[] = []

  for (const item of items) {
    const last = slots[slots.length - 1]
    if (last && last.startTime === item.startTime) {
      last.items.push(item)
      continue
    }
    slots.push({ startTime: item.startTime, endTime: item.endTime, items: [item] })
  }

  return slots
}
