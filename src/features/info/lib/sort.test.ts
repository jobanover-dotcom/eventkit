import { describe, expect, it } from 'vitest'
import { compareScheduleItems, groupIntoSlots, sortRules, sortScheduleItems } from './sort'
import type { PublicRule, PublicScheduleItem } from '@/features/info/types'

function item(overrides: Partial<PublicScheduleItem> = {}): PublicScheduleItem {
  return {
    id: '1',
    title: 'Item',
    description: '',
    startTime: '09:00',
    endTime: '10:00',
    location: '',
    sortOrder: 0,
    ...overrides,
  }
}

function rule(overrides: Partial<PublicRule> = {}): PublicRule {
  return { id: '1', title: 'Rule', content: 'Do the thing.', sortOrder: 0, ...overrides }
}

describe('compareScheduleItems', () => {
  it('orders chronologically by start time', () => {
    const later = item({ id: 'a', startTime: '14:00' })
    const earlier = item({ id: 'b', startTime: '08:00' })

    expect(compareScheduleItems(earlier, later)).toBeLessThan(0)
    expect(compareScheduleItems(later, earlier)).toBeGreaterThan(0)
  })

  it('breaks a tie on start time with sort_order', () => {
    const second = item({ id: 'b', sortOrder: 2 })
    const first = item({ id: 'a', sortOrder: 1 })

    expect(compareScheduleItems(first, second)).toBeLessThan(0)
  })

  it('is stable when both start time and sort_order match', () => {
    expect(compareScheduleItems(item({ id: 'a' }), item({ id: 'b' }))).toBeLessThan(0)
  })

  it('sorts a whole programme into the order a participant expects', () => {
    const sorted = sortScheduleItems([
      item({ id: 'c', title: 'Closing', startTime: '17:00' }),
      item({ id: 'a', title: 'Registration', startTime: '07:30' }),
      item({ id: 'b', title: 'Opening', startTime: '09:00' }),
    ])

    expect(sorted.map((entry) => entry.title)).toEqual(['Registration', 'Opening', 'Closing'])
  })

  it('handles a late-morning item sorting before an afternoon one', () => {
    const sorted = sortScheduleItems([
      item({ id: 'a', startTime: '13:00' }),
      item({ id: 'b', startTime: '09:30' }),
    ])

    expect(sorted.map((entry) => entry.startTime)).toEqual(['09:30', '13:00'])
  })

  it('does not mutate its input', () => {
    const input = [item({ id: 'b', startTime: '10:00' }), item({ id: 'a', startTime: '09:00' })]
    const original = input.map((entry) => entry.id)

    sortScheduleItems(input)
    expect(input.map((entry) => entry.id)).toEqual(original)
  })
})

describe('sortRules', () => {
  it('respects the author sort_order', () => {
    const sorted = sortRules([
      rule({ id: 'c', title: 'Third', sortOrder: 3 }),
      rule({ id: 'a', title: 'First', sortOrder: 1 }),
      rule({ id: 'b', title: 'Second', sortOrder: 2 }),
    ])

    expect(sorted.map((entry) => entry.title)).toEqual(['First', 'Second', 'Third'])
  })

  it('is stable when two rules share a sort_order', () => {
    const sorted = sortRules([rule({ id: 'b' }), rule({ id: 'a' })])
    expect(sorted.map((entry) => entry.id)).toEqual(['a', 'b'])
  })

  it('handles an empty list', () => {
    expect(sortRules([])).toEqual([])
  })
})

describe('groupIntoSlots', () => {
  it('gives one slot per distinct start time', () => {
    const slots = groupIntoSlots(
      sortScheduleItems([
        item({ id: 'a', startTime: '09:00' }),
        item({ id: 'b', startTime: '10:00' }),
      ])
    )

    expect(slots).toHaveLength(2)
    expect(slots[0]?.items).toHaveLength(1)
  })

  it('puts items sharing a start time in one slot, so a parallel session reads as a choice', () => {
    const slots = groupIntoSlots(
      sortScheduleItems([
        item({ id: 'a', startTime: '09:00', sortOrder: 1, title: 'Track A' }),
        item({ id: 'b', startTime: '09:00', sortOrder: 2, title: 'Track B' }),
        item({ id: 'c', startTime: '10:00', title: 'Everyone' }),
      ])
    )

    expect(slots).toHaveLength(2)
    expect(slots[0]?.items.map((entry) => entry.title)).toEqual(['Track A', 'Track B'])
    expect(slots[1]?.items).toHaveLength(1)
  })

  it('carries the slot end time from the first item in it', () => {
    const slots = groupIntoSlots([item({ startTime: '09:00', endTime: '10:30' })])
    expect(slots[0]?.endTime).toBe('10:30')
  })

  it('returns nothing for an empty programme', () => {
    expect(groupIntoSlots([])).toEqual([])
  })
})
