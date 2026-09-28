'use client'

import { useMemo, useState, useTransition } from 'react'
import { CheckCircle2, Loader2, TriangleAlert } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { FormField } from '@/components/shared/FormField'
import {
  downloadBadgeArchive,
  generateBadgesInBulk,
  type BulkBadgeFailure,
  type BulkBadgeOutput,
  type BulkBadgeTarget,
} from '@/features/design/lib/bulkBadges'
import { supportsOutput } from '@/features/design/lib/export'
import {
  BADGE_ROLES,
  toBadgeRole,
  type BadgeRole,
  type EventBrand,
  type ParticipantInfo,
} from '@/features/design/types'
import type { DesignTemplate } from '@/features/design/lib/types'
import type { BadgeData } from '@/features/design/types'

/**
 * The bulk badge run: pick who, pick a format, get a ZIP.
 *
 * Structured like the certificate issuance panel, deliberately, because the two
 * solve the same problem and an organizer who has used one should not have to
 * learn the other. The differences are all forced by the badge itself: a badge's
 * QR already exists, so there is no issuing step and no server call before the run
 * starts, and a badge is not gated on attendance, so there is no eligibility
 * filter to explain.
 *
 * Nothing here knows a participant's check-in token. Each target carries a name
 * and a role; the QR is resolved from the participant record inside the renderer.
 */

/** Sentinel for "print each person's own registered role". */
const OWN_ROLE = '__own' as const
type RoleChoice = typeof OWN_ROLE | BadgeRole

type BadgeBulkPanelProps = {
  event: EventBrand
  participants: readonly ParticipantInfo[]
  templates: readonly DesignTemplate<BadgeData>[]
  /** Mirrors the single flow, so a bulk run defaults to what is on screen. */
  templateId: string
  onTemplateChange: (id: string) => void
}

export function BadgeBulkPanel({
  event,
  participants,
  templates,
  templateId,
  onTemplateChange,
}: BadgeBulkPanelProps) {
  const [selected, setSelected] = useState<string[]>([])
  const [roleChoice, setRoleChoice] = useState<RoleChoice>(OWN_ROLE)
  const [output, setOutput] = useState<BulkBadgeOutput>('pdf')
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<{
    completed: number
    total: number
    name: string
  } | null>(null)
  const [result, setResult] = useState<{ completed: number; failed: BulkBadgeFailure[] } | null>(
    null
  )
  const [isPending, startTransition] = useTransition()

  const template = useMemo(
    () => templates.find((candidate) => candidate.id === templateId) ?? templates[0] ?? null,
    [templates, templateId]
  )

  const busy = isPending || progress !== null

  // A template that cannot produce the chosen format is not offered it, so the
  // picker cannot put the organizer in a state the run cannot fulfil.
  const outputChoices = useMemo(
    () =>
      (['png', 'pdf'] as const).filter((choice) =>
        supportsOutput(template as DesignTemplate<never>, choice)
      ),
    [template]
  )
  const effectiveOutput: BulkBadgeOutput = outputChoices.includes(output) ? output : 'png'

  const checkedIn = participants.filter((participant) => participant.checkedIn)
  const waiting = participants.filter((participant) => !participant.checkedIn)
  const allSelected = participants.length > 0 && selected.length === participants.length

  function toggleAll() {
    setSelected(allSelected ? [] : participants.map((participant) => participant.id))
  }

  function toggleOne(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]
    )
  }

  function generate() {
    if (!template || selected.length === 0) return
    setError(null)
    setResult(null)
    setProgress({ completed: 0, total: selected.length, name: '' })

    // Resolved here rather than in the library, because whose role to print is a
    // UI decision. Every other badge detail comes from the participant record.
    const targets: BulkBadgeTarget[] = selected
      .map((id) => participants.find((participant) => participant.id === id))
      .filter((participant): participant is ParticipantInfo => participant !== undefined)
      .map((participant) => ({
        participant,
        role: roleChoice === OWN_ROLE ? toBadgeRole(participant.sourceRole) : roleChoice,
      }))

    startTransition(async () => {
      try {
        const bulk = await generateBadgesInBulk({
          event,
          targets,
          template,
          output: effectiveOutput,
          onProgress: (update) =>
            setProgress({
              completed: update.completed,
              total: update.total,
              name: update.currentName,
            }),
        })

        // Throws when nothing rendered, so a run that produced nothing surfaces an
        // error instead of a misleading empty archive.
        await downloadBadgeArchive(bulk)
        setProgress(null)
        setResult({ completed: bulk.completed, failed: bulk.failed })
      } catch (cause) {
        setProgress(null)
        setError(
          cause instanceof Error && cause.message
            ? cause.message
            : 'The badges could not be prepared. Please try again.'
        )
      }
    })
  }

  if (!template) return null

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Generate badges in bulk</CardTitle>
        </CardHeader>

        <CardContent className="flex flex-col gap-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              label="Badge template"
              htmlFor="badge-bulk-template"
              hint="The same templates the single badge uses."
            >
              <Select value={template.id} onValueChange={onTemplateChange} disabled={busy}>
                <SelectTrigger id="badge-bulk-template" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>

            <FormField
              label="File format"
              htmlFor="badge-bulk-output"
              hint="PDF prints straight onto A4. PNG is lighter for a long list."
            >
              <Select
                value={effectiveOutput}
                onValueChange={(next) => setOutput(next as BulkBadgeOutput)}
                disabled={busy}
              >
                <SelectTrigger id="badge-bulk-output" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {outputChoices.map((choice) => (
                    <SelectItem key={choice} value={choice}>
                      {choice.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>

          {/* Labelled distinctly from the single badge's own role control: two
              controls reading simply "Badge role" on one page is ambiguous, and
              they do different things. */}
          <FormField
            label="Role on every badge"
            htmlFor="badge-bulk-role"
            hint="By default each person gets the role they registered with."
          >
            <Select
              value={roleChoice}
              onValueChange={(next) => setRoleChoice(next as RoleChoice)}
              disabled={busy}
            >
              <SelectTrigger id="badge-bulk-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={OWN_ROLE}>Each person’s registered role</SelectItem>
                {BADGE_ROLES.map((role) => (
                  <SelectItem key={role} value={role}>
                    {role} for everyone
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium" data-testid="badge-selected-count">
                {selected.length} participant{selected.length === 1 ? '' : 's'} selected
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={toggleAll}
                  disabled={busy || participants.length === 0}
                >
                  {allSelected ? 'Clear selection' : `Select all ${participants.length}`}
                </Button>
              </div>
            </div>

            {participants.length === 0 ? (
              <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-2 text-sm">
                Nobody has registered for this event yet, so there is nothing to generate.
              </p>
            ) : (
              <ul className="max-h-64 overflow-y-auto rounded-lg border">
                {checkedIn.map((participant) => (
                  <ParticipantRow
                    key={participant.id}
                    participant={participant}
                    selected={selected.includes(participant.id)}
                    busy={busy}
                    onToggle={toggleOne}
                  />
                ))}
                {waiting.map((participant) => (
                  <ParticipantRow
                    key={participant.id}
                    participant={participant}
                    selected={selected.includes(participant.id)}
                    busy={busy}
                    onToggle={toggleOne}
                    showNotCheckedIn
                  />
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={generate} disabled={busy || selected.length === 0}>
              {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              {busy
                ? 'Generating…'
                : `Generate ${selected.length || ''} badge${selected.length === 1 ? '' : 's'}`}
            </Button>
            {selected.length === 0 && participants.length > 0 && (
              <p className="text-muted-foreground text-sm">
                Choose at least one participant to generate badges.
              </p>
            )}
          </div>

          {progress && (
            <div className="flex flex-col gap-2" data-testid="badge-bulk-progress">
              <p className="flex items-center gap-2 text-sm font-medium">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                Generating badges… {progress.completed} / {progress.total}
              </p>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={progress.total}
                aria-valuenow={progress.completed}
                aria-label="Badge generation progress"
                className="bg-muted h-2 w-full overflow-hidden rounded-full"
              >
                <div
                  className="bg-primary h-full rounded-full transition-[width]"
                  style={{
                    width: progress.total === 0 ? 0 : (progress.completed / progress.total) * 100,
                  }}
                />
              </div>
              {progress.name && (
                <p className="text-muted-foreground truncate text-xs">{progress.name}</p>
              )}
            </div>
          )}

          {result && (
            <p
              role="status"
              className="border-chart-4/40 bg-chart-4/10 flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
            >
              <CheckCircle2 className="size-4 shrink-0" aria-hidden="true" />
              {result.completed} badge{result.completed === 1 ? '' : 's'} generated and downloaded.
              {result.failed.length > 0 && ` ${result.failed.length} could not be rendered.`}
            </p>
          )}

          {result && result.failed.length > 0 && (
            <ul className="flex flex-col gap-1 text-sm" data-testid="badge-bulk-failures">
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
              className="border-destructive/30 bg-destructive/10 text-destructive flex items-start gap-2 rounded-lg border px-3 py-2 text-sm"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}
        </CardContent>
      </Card>

      <Separator />
    </div>
  )
}

function ParticipantRow({
  participant,
  selected,
  busy,
  onToggle,
  showNotCheckedIn = false,
}: {
  participant: ParticipantInfo
  selected: boolean
  busy: boolean
  onToggle: (id: string) => void
  showNotCheckedIn?: boolean
}) {
  return (
    <li className="flex items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0">
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggle(participant.id)}
        disabled={busy}
        className="size-4"
        aria-label={`Select ${participant.name}`}
      />
      <span className="flex-1 truncate">{participant.name}</span>
      {showNotCheckedIn && <Badge variant="outline">Not checked in</Badge>}
    </li>
  )
}
