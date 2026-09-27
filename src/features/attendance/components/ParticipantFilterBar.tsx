'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useState, type FormEvent } from 'react'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ATTENDANCE_FILTERS,
  ATTENDANCE_FILTER_LABELS,
  ATTENDANCE_GROUPS,
  ATTENDANCE_GROUP_LABELS,
  type AttendanceFilter,
  type AttendanceGroup,
} from '@/features/attendance/types'

/**
 * Search and filters for a roster page.
 *
 * State lives in the URL rather than in component state, so a filtered view is
 * shareable and the back button works. `CONTEXT.md` records that decision: no
 * client cache, no query library, just Server Components reading `searchParams`.
 *
 * Submitting a form rather than filtering as you type keeps the request count
 * sane and means one deliberate action instead of a query per keystroke.
 */

const ALL_ROLES = '__all__'

export function ParticipantFilterBar({
  basePath,
  search,
  status,
  role,
  roles,
  group,
  showRoleFilter,
  showGroupFilter = false,
  showStatusFilter = true,
}: {
  basePath: string
  search: string
  status?: AttendanceFilter
  role: string
  roles: readonly string[]
  /** Participants / Speakers / Everyone. Only offered when a speaker exists. */
  group?: AttendanceGroup
  showRoleFilter?: boolean
  showGroupFilter?: boolean
  showStatusFilter?: boolean
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [term, setTerm] = useState(search)
  const [lastSearch, setLastSearch] = useState(search)

  // Keep the box in step with the URL when a navigation changes it, e.g. the
  // Clear button. Adjusting during render rather than in an effect avoids the
  // cascading re-render an effect would cause, and is the documented pattern for
  // deriving state from a changed prop.
  if (search !== lastSearch) {
    setLastSearch(search)
    setTerm(search)
  }

  function apply(next: { search?: string; status?: string; role?: string; group?: string }) {
    const params = new URLSearchParams(searchParams.toString())

    for (const [key, value] of Object.entries(next)) {
      if (!value) params.delete(key)
      else params.set(key, value)
    }

    const query = params.toString()
    router.push(query ? `${basePath}?${query}` : basePath)
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    apply({ search: term.trim() })
  }

  const hasFilters =
    Boolean(search) ||
    (status && status !== 'all') ||
    (showRoleFilter && role) ||
    (showGroupFilter && group && group !== 'all')

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="roster-search">Search</Label>
          <div className="relative">
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
              aria-hidden="true"
            />
            <Input
              id="roster-search"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Name, code, email, or student ID"
              className="pl-8"
            />
          </div>
        </div>

        {showStatusFilter && (
          <div className="flex flex-col gap-2 sm:w-48">
            <Label htmlFor="roster-status">Status</Label>
            <Select
              value={status ?? 'all'}
              onValueChange={(next) => apply({ status: next === 'all' ? '' : next })}
            >
              <SelectTrigger id="roster-status" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ATTENDANCE_FILTERS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {ATTENDANCE_FILTER_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {showGroupFilter && (
          <div className="flex flex-col gap-2 sm:w-48">
            <Label htmlFor="roster-group">Type</Label>
            <Select
              value={group ?? 'all'}
              onValueChange={(next) => apply({ group: next === 'all' ? '' : next })}
            >
              <SelectTrigger id="roster-group" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ATTENDANCE_GROUPS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {ATTENDANCE_GROUP_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {showRoleFilter && roles.length > 1 && (
          <div className="flex flex-col gap-2 sm:w-44">
            <Label htmlFor="roster-role">Role</Label>
            <Select
              value={role || ALL_ROLES}
              onValueChange={(next) => apply({ role: next === ALL_ROLES ? '' : next })}
            >
              <SelectTrigger id="roster-role" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_ROLES}>All roles</SelectItem>
                {roles.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex gap-2">
          <Button type="submit" variant="secondary">
            Apply
          </Button>
          {hasFilters && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setTerm('')
                router.push(basePath)
              }}
            >
              <X aria-hidden="true" />
              Clear
            </Button>
          )}
        </div>
      </div>
    </form>
  )
}
