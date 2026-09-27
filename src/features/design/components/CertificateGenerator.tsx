'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { DesignStudio } from '@/features/design/components/DesignStudio'
import { FormField } from '@/components/shared/FormField'
import { ParticipantSelect } from '@/features/design/components/ParticipantSelect'
import { CertificateTemplateBar } from '@/features/certificates/components/CertificateTemplateBar'
import { CertificateIssuancePanel } from '@/features/certificates/components/CertificateIssuancePanel'
import { CERTIFICATE_TEMPLATES } from '@/features/design/lib/templates'
import { SAMPLE_PARTICIPANT } from '@/features/design/lib/sampleData'
import { loadCertificateTemplates } from '@/features/certificates/templates/loadTemplate'
import type { DesignTemplate } from '@/features/design/lib/types'
import type { CertificateTemplate } from '@/features/certificates/services/certificateTemplateService'
import type { IssuedCertificate } from '@/features/certificates/lib/eligibility'
import {
  CERTIFICATE_TYPES,
  type CertificateData,
  type CertificateType,
  type EventBrand,
  type ParticipantInfo,
} from '@/features/design/types'

type CertificateGeneratorProps = {
  eventId: string
  event: EventBrand
  participants: readonly ParticipantInfo[]
  checkedInCount: number
  customTemplates?: readonly CertificateTemplate[]
  issued?: readonly IssuedCertificate[]
  onIssued?: () => void
}

/**
 * Certificate flow, in two halves.
 *
 * The top half generates one certificate and previews it. The bottom half is the
 * bulk path: choose a population, tick recipients, generate a ZIP.
 *
 * Both default to people who actually checked in. That rule is not only a UI
 * default — the `certificates` table refuses to store a record for anybody
 * without an attendance row, so the checkbox beside the list is a convenience and
 * the data policy is the control. Widening the list is therefore explicit, and
 * says so.
 */
export function CertificateGenerator({
  eventId,
  event,
  participants,
  checkedInCount,
  customTemplates = [],
  issued = [],
  onIssued,
}: CertificateGeneratorProps) {
  const [participantId, setParticipantId] = useState('')
  const [certificateType, setCertificateType] = useState<CertificateType>('Participation')
  const [showEveryone, setShowEveryone] = useState(false)

  // Custom templates are decoded from their signed artwork URLs, which is
  // asynchronous, so the built-ins are usable immediately and the custom ones
  // join the picker a tick later.
  //
  // The result is keyed on the records it came from, so a re-save returns the
  // fresh list while an unrelated re-render keeps the already-decoded one. The
  // key is derived rather than stored, so a stale list is never shown.
  const customKey = customTemplates.map((t) => `${t.id}:${t.updatedAt}`).join(',')
  const [loaded, setLoaded] = useState<{
    key: string
    templates: DesignTemplate<CertificateData>[]
  }>({ key: '', templates: [] })

  useEffect(() => {
    if (customTemplates.length === 0) return
    let cancelled = false
    void loadCertificateTemplates(customTemplates).then((templates) => {
      if (!cancelled) setLoaded({ key: customKey, templates })
    })
    return () => {
      cancelled = true
    }
    // `customKey` summarises `customTemplates`; depending on the array itself
    // would re-decode every artwork on each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customKey])

  // The organizer's own templates are appended to the built-in catalogue, so the
  // picker, the preview, and both exporters treat them identically. The key
  // comparison lives inside the memo so a re-render cannot rebuild the array.
  const templates = useMemo(
    () => [...CERTIFICATE_TEMPLATES, ...(loaded.key === customKey ? loaded.templates : [])],
    [loaded, customKey]
  )

  /**
   * Which template the bulk run uses.
   *
   * Explicit, and it defaults to the first template rather than the last. The
   * previous behaviour took the final entry of the combined array, which with any
   * custom template present meant silently generating everybody's certificate from
   * the organizer's *oldest* upload.
   */
  const [bulkTemplateId, setBulkTemplateId] = useState(CERTIFICATE_TEMPLATES[0]?.id ?? '')
  const bulkTemplate =
    templates.find((template) => template.id === bulkTemplateId) ?? templates[0] ?? null

  const visible = useMemo(
    () => (showEveryone ? participants : participants.filter((p) => p.checkedIn)),
    [participants, showEveryone]
  )

  const participant = useMemo(
    () => participants.find((candidate) => candidate.id === participantId) ?? null,
    [participants, participantId]
  )

  const data: CertificateData = useMemo(
    () => ({
      event,
      recipient: participant ?? SAMPLE_PARTICIPANT,
      certificateType,
    }),
    [event, participant, certificateType]
  )

  const filenameBase = participant
    ? `${event.name} certificate ${participant.name}`
    : `${event.name} certificate`

  // A single certificate is drawn from whatever record already exists, so its QR
  // verifies. Before issuance there is no token, and `qrPayload` stays null,
  // which the renderer treats as "no QR" rather than falling back to the
  // recipient's door code.
  const verificationToken = participant
    ? (issued.find((entry) => entry.participantId === participant.id)?.verificationToken ?? null)
    : null

  return (
    <div className="flex flex-col gap-10">
      <CertificateTemplateBar eventId={eventId} templates={customTemplates} />

      <DesignStudio<CertificateData>
        kind="certificate"
        heading="Certificates"
        description="An A4 certificate for one recipient. The certificate type sets the wording; the template sets the look."
        templates={templates}
        data={data}
        includeQr
        qrPayload={verificationToken}
        filenameBase={filenameBase}
        blockedReason={
          participant ? undefined : 'Choose a recipient to generate their certificate.'
        }
        fields={
          <>
            <ParticipantSelect
              id="certificate-participant"
              label="Recipient"
              hint={
                showEveryone
                  ? 'Showing everyone, including people who have not checked in.'
                  : 'Only participants who have checked in are listed.'
              }
              participants={visible}
              value={participantId}
              onChange={setParticipantId}
              emptyMessage={
                showEveryone
                  ? 'Nobody has registered for this event yet.'
                  : 'Nobody has checked in yet. Use “Show all participants” to continue anyway.'
              }
            />

            {participants.length > checkedInCount && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowEveryone((current) => !current)}
                className="self-start"
              >
                {showEveryone ? 'Only show checked in' : 'Show all participants'}
              </Button>
            )}

            <FormField
              label="Certificate type"
              htmlFor="certificate-type"
              hint="Changes the title and the recognition line."
            >
              <Select
                value={certificateType}
                onValueChange={(next) => setCertificateType(next as CertificateType)}
              >
                <SelectTrigger id="certificate-type" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CERTIFICATE_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      Certificate of {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </>
        }
      />

      <Separator />

      {bulkTemplate && (
        <CertificateIssuancePanel
          eventId={eventId}
          event={event}
          participants={participants}
          issued={issued}
          templates={templates}
          template={bulkTemplate}
          onTemplateChange={setBulkTemplateId}
          certificateType={certificateType}
          onCertificateTypeChange={setCertificateType}
          onIssued={onIssued}
        />
      )}
    </div>
  )
}
