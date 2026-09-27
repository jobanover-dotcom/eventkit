'use client'

import { useMemo, useState, useTransition } from 'react'
import { CheckCircle2, Loader2, TriangleAlert, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FormField } from '@/components/shared/FormField'
import {
  CERTIFICATE_TYPES,
  type CertificateType,
  type EventBrand,
  type ParticipantInfo,
} from '@/features/design/types'
import {
  PARTICIPANT_TYPES,
  participantTypeLabel,
  type ParticipantType,
} from '@/lib/participantType'
import {
  isAlreadyIssued,
  selectCertificateCandidates,
  type CertificateCandidate,
  type IssuedCertificate,
} from '@/features/certificates/lib/eligibility'
import { issueCertificatesAction } from '@/features/certificates/actions/issueCertificates.action'
import {
  certificateVerificationUrl,
  downloadCertificateArchive,
  generateCertificatesInBulk,
  type BulkFailure,
  type BulkProgress,
} from '@/features/certificates/lib/bulkGenerate'
import type { DesignTemplate } from '@/features/design/lib/types'
import type { CertificateData } from '@/features/design/types'

/**
 * Choose a group, choose recipients, generate in bulk.
 *
 * Participants and speakers are separate populations and this panel keeps them
 * that way: the toggle is a single source of truth for what the list shows and
 * what is sent to the server, which re-derives eligibility from the roster
 * regardless of what arrives. Eligibility defaults to checked-in people, and
 * widening it is a labelled, explicit choice that produces a warning rather than
 * a silent certificate for somebody who was not present.
 */

type BulkTemplate = DesignTemplate<CertificateData>

export function CertificateIssuancePanel({
  eventId,
  event,
  participants,
  issued,
  template,
  onIssued,
}: {
  eventId: string
  event: EventBrand
  participants: readonly ParticipantInfo[]
  issued: readonly IssuedCertificate[]
  template: BulkTemplate
  onIssued?: () => void
}) {
  const [type, setType] = useState<ParticipantType>('PARTICIPANT')
  const [certificateType, setCertificateType] = useState<CertificateType>('Participation')
  const [showEveryone, setShowEveryone] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<BulkProgress | null>(null)
  const [result, setResult] = useState<{ completed: number; failed: BulkFailure[] } | null>(null)
  const [isPending, startTransition] = useTransition()

  const candidates = useMemo<CertificateCandidate[]>(
    () =>
      participants.map((participant) => ({
        id: participant.id,
        name: participant.name,
        role: participant.sourceRole,
        type: participant.sourceRole === 'Speaker' ? 'SPEAKER' : 'PARTICIPANT',
        title: participant.title,
        organization: participant.organization,
        checkedIn: participant.checkedIn,
      })),
    [participants]
  )

  const eligibility = useMemo(
    () => selectCertificateCandidates(candidates, { type, includeNotCheckedIn: showEveryone }),
    [candidates, type, showEveryone]
  )

  // Switching group must not carry a selection across into the other
  // population, which is the one way the two could get mixed.
  function changeType(next: ParticipantType) {
    setType(next)
    setSelected([])
    setResult(null)
    setError(null)
  }

  // A person who already holds this exact certificate is a regeneration, not a
  // new issue. Saying so up front is what stops a re-run looking like a second
  // certificate rather than a refresh of the first.
  const alreadyIssuedFor = (candidate: CertificateCandidate) =>
    isAlreadyIssued(issued, candidate, certificateType)

  const selectable = eligibility.eligible
  const allSelected = selectable.length > 0 && selected.length === selectable.length

  function toggleAll() {
    setSelected(allSelected ? [] : selectable.map((candidate) => candidate.id))
  }

  function toggleOne(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]
    )
  }

  function generate() {
    setError(null)
    setResult(null)
    setProgress({ completed: 0, total: selected.length, currentName: '' })

    startTransition(async () => {
      // Records first: the verification QR is derived from a real token, so a
      // certificate is never drawn against a token that does not exist.
      const issuedResult = await issueCertificatesAction({
        eventId,
        type,
        certificateType,
        participantIds: selected,
      })

      if (!issuedResult.ok) {
        setProgress(null)
        setError(issuedResult.error.message)
        return
      }

      const { issued: records, skipped } = issuedResult.data

      const skippedCount =
        skipped.notInGroup.length + skipped.notCheckedIn.length + skipped.unknown.length

      const recipients = records
        .map((record) => {
          const participant = participants.find((entry) => entry.id === record.participantId)
          if (!participant) return null
          return {
            participant,
            verificationToken: record.verificationToken,
            title: participant.title,
            organization: participant.organization,
          }
        })
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)

      try {
        const bulk = await generateCertificatesInBulk({
          event,
          recipients,
          certificateType,
          template,
          origin: window.location.origin,
          onProgress: setProgress,
        })

        await downloadCertificateArchive(bulk)
        setProgress(null)
        setResult({ completed: bulk.completed, failed: bulk.failed })
        onIssued?.()

        if (skippedCount > 0) {
          setError(
            `${skippedCount} selected recipient${skippedCount === 1 ? ' was' : 's were'} ` +
              'skipped because they are not eligible for this group.'
          )
        }
      } catch (cause) {
        setProgress(null)
        setError(
          cause instanceof Error ? cause.message : 'The certificates could not be generated.'
        )
      }
    })
  }

  const busy = isPending || progress !== null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Generate in bulk</CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-5">
        <FormField
          label="Recipient type"
          htmlFor="certificate-recipient-type"
          hint="Certificates are never generated for both groups at once."
        >
          <div className="flex gap-2" id="certificate-recipient-type">
            {PARTICIPANT_TYPES.map((option) => (
              <Button
                key={option}
                type="button"
                variant={type === option ? 'default' : 'outline'}
                size="sm"
                onClick={() => changeType(option)}
                disabled={busy}
              >
                {option === 'SPEAKER' ? 'Speakers' : 'Participants'}
              </Button>
            ))}
          </div>
        </FormField>

        <FormField label="Certificate" htmlFor="certificate-bulk-type">
          <Select
            value={certificateType}
            onValueChange={(next) => setCertificateType(next as CertificateType)}
          >
            <SelectTrigger id="certificate-bulk-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CERTIFICATE_TYPES.map((option) => (
                <SelectItem key={option} value={option}>
                  Certificate of {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <div className="bg-muted/40 flex flex-col gap-1 rounded-lg px-3 py-2 text-sm">
          <p className="font-medium">
            {eligibility.eligibleCount} checked-in {participantTypeLabel(type).toLowerCase()}
            {eligibility.eligibleCount === 1 ? '' : 's'}
          </p>
          <p className="text-muted-foreground text-xs">
            Certificates are issued on the strength of an attendance record.
          </p>
        </div>

        {eligibility.excludedNotCheckedIn.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setShowEveryone((current) => !current)
              setSelected([])
            }}
            className="self-start"
            disabled={busy}
          >
            {showEveryone
              ? 'Only show checked in'
              : `Include ${eligibility.excludedNotCheckedIn.length} who did not check in`}
          </Button>
        )}

        {showEveryone && eligibility.includesUnchecked && (
          <p
            role="alert"
            className="border-chart-3/40 bg-chart-3/10 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm"
          >
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              {eligibility.excludedNotCheckedIn.length} of these people have no attendance record. A
              certificate asserts that somebody attended, so these cannot be issued until they are
              checked in.
            </span>
          </p>
        )}

        {selectable.length > 0 && (
          <>
            <Separator />
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  disabled={busy}
                  className="size-4"
                />
                Select all eligible ({selectable.length})
              </label>

              <ul className="max-h-64 overflow-y-auto rounded-lg border">
                {selectable.map((candidate) => (
                  <li
                    key={candidate.id}
                    className="flex items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0"
                  >
                    <input
                      type="checkbox"
                      checked={selected.includes(candidate.id)}
                      onChange={() => toggleOne(candidate.id)}
                      disabled={busy}
                      className="size-4"
                      aria-label={`Select ${candidate.name}`}
                    />
                    <span className="flex-1 truncate">{candidate.name}</span>
                    {candidate.type === 'SPEAKER' && <Badge variant="secondary">Speaker</Badge>}
                    {alreadyIssuedFor(candidate) && (
                      <Badge variant="outline">Already issued — will update</Badge>
                    )}
                    {!candidate.checkedIn && <Badge variant="outline">Not checked in</Badge>}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}

        {progress && (
          <div className="flex flex-col gap-2" data-testid="bulk-progress">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Generating certificates… {progress.completed} / {progress.total}
            </p>
            <div
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={progress.completed}
              aria-label="Certificate generation progress"
              className="bg-muted h-2 w-full overflow-hidden rounded-full"
            >
              <div
                className="bg-primary h-full rounded-full transition-[width]"
                style={{
                  width: `${
                    progress.total === 0 ? 0 : (progress.completed / progress.total) * 100
                  }%`,
                }}
              />
            </div>
            {progress.currentName && (
              <p className="text-muted-foreground truncate text-xs">{progress.currentName}</p>
            )}
          </div>
        )}

        {result && (
          <p
            role="status"
            className="border-chart-4/40 bg-chart-4/10 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
          >
            <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
            {result.completed} certificate{result.completed === 1 ? '' : 's'} generated.
            {result.failed.length > 0 && ` ${result.failed.length} could not be rendered.`}
          </p>
        )}

        {result && result.failed.length > 0 && (
          <ul className="flex flex-col gap-1 text-sm">
            {result.failed.map((failure) => (
              <li key={failure.name} className="text-muted-foreground">
                {failure.name}: {failure.reason}
              </li>
            ))}
          </ul>
        )}

        {error && (
          <p
            role="alert"
            className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-3 py-2 text-sm"
          >
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={generate} disabled={busy || selected.length === 0}>
            {busy ? (
              <Loader2 className="animate-spin" aria-hidden="true" />
            ) : (
              <Users aria-hidden="true" />
            )}
            {busy
              ? 'Generating…'
              : `Generate ${selected.length} certificate${selected.length === 1 ? '' : 's'}`}
          </Button>
          {selected.length === 0 && (
            <p className="text-muted-foreground text-sm">Choose at least one recipient.</p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export { certificateVerificationUrl }
