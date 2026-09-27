import { describe, expect, it } from 'vitest'
import { PARTICIPANT_ROLES } from '@/features/attendance/types'
import {
  PARTICIPANT_TYPE_LABELS,
  isParticipant,
  isSpeaker,
  participantTypeLabel,
  participantTypeLabelForRole,
  toParticipantType,
} from '@/lib/participantType'

describe('toParticipantType', () => {
  it('classifies exactly one of the database role values as a speaker', () => {
    const speakers = PARTICIPANT_ROLES.filter((role) => toParticipantType(role) === 'SPEAKER')
    expect(speakers).toEqual(['Speaker'])
  })

  it('classifies every other existing role as a participant', () => {
    for (const role of PARTICIPANT_ROLES.filter((role) => role !== 'Speaker')) {
      expect(toParticipantType(role)).toBe('PARTICIPANT')
    }
  })

  it('is case sensitive, so "speaker" is not a speaker', () => {
    expect(toParticipantType('speaker')).toBe('PARTICIPANT')
    expect(toParticipantType('SPEAKER')).toBe('PARTICIPANT')
    expect(toParticipantType('Speakers')).toBe('PARTICIPANT')
  })

  it('defaults to participant for values outside the enum', () => {
    // An unrecognised role must never inherit speaker-only privileges.
    for (const role of ['', 'Admin', 'Superuser', 'speaker ']) {
      expect(toParticipantType(role)).toBe('PARTICIPANT')
    }
  })

  it('treats a missing role as a participant', () => {
    expect(toParticipantType(null)).toBe('PARTICIPANT')
    expect(toParticipantType(undefined)).toBe('PARTICIPANT')
  })
})

describe('isSpeaker / isParticipant', () => {
  it('are exact complements', () => {
    for (const role of [...PARTICIPANT_ROLES, null, 'Unknown']) {
      expect(isSpeaker(role)).toBe(!isParticipant(role))
    }
  })

  it('is true for the Speaker role only', () => {
    expect(isSpeaker('Speaker')).toBe(true)
    expect(isParticipant('Speaker')).toBe(false)
  })
})

describe('labels', () => {
  it('names each group', () => {
    expect(participantTypeLabel('PARTICIPANT')).toBe('Participant')
    expect(participantTypeLabel('SPEAKER')).toBe('Speaker')
  })

  it('has a label for every type', () => {
    expect(Object.keys(PARTICIPANT_TYPE_LABELS).sort()).toEqual(['PARTICIPANT', 'SPEAKER'])
  })

  it('derives the label from a stored role', () => {
    expect(participantTypeLabelForRole('Speaker')).toBe('Speaker')
    expect(participantTypeLabelForRole('Student')).toBe('Participant')
    expect(participantTypeLabelForRole('Judge')).toBe('Participant')
  })
})
