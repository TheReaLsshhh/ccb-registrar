import { ChangeEvent, CSSProperties, DragEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { api, getErrorMessage } from '../api'
import { AddUserIcon, ChevronDownIcon, FolderIcon, SearchIcon, TrashBinIcon } from '../components/Icons'

const ENROLLMENT_FOLDERS_STORAGE_KEY = 'ccb_enrollment_folders_open_state'

const getSemesterLabel = (semester: number | null | undefined): string => {
  if (semester === 1) return '1st Semester'
  if (semester === 2) return '2nd Semester'
  if (semester === 3) return 'Summer'
  return '-'
}

type Subject = {
  id: number
  code: string
  title: string
  units: string
}

type AcademicTerm = {
  id: number
  year_label: string
  semester: number
  is_active: boolean
}

type ProspectusEntry = {
  id: number
  program: number
  subject: number
  year_level: number
  semester: number
  academic_year: string
  section: number | null
  prerequisite: number | null
  time: string
  room: string
}

type Program = {
  id: number
  code: string
  name: string
  department: number
  program_adviser: string
  school_dean: string
}

type Department = {
  id: number
  name: string
  code: string
}

type Section = {
  id: number
  name: string
  program: number
  year_level: number
  semester: number
}

type EnrolledStudent = {
  id: number
  student_id: string
  first_name: string
  last_name: string
  program: number
  section: number | null
  year_level: number
  academic_year: string
  gender: string
  middle_name: string
  semester: number
}

type StudentLoad = {
  id: number
  status: string
  term_id: number
  term_label: string
  subject_id: number
  subject_code: string
  subject_title: string
  subject_time?: string
  subject_room?: string
}

type AcademicHistoryRecord = {
  id: number
  student: number
  academic_year: string
  semester: number
  status: string
  scholarship: string
  date_of_birth: string | null
}

type StudentDetail = {
  id: number
  student_id: string
  first_name: string
  last_name: string
  middle_name: string
  extension_name: string
  gender: string
  sex: string
  date_of_birth: string | null
  age: number | null
  civil_status: string
  nationality: string
  admission_date: string | null
  scholarship: string
  course: string
  program: number
  section: number | null
  year_level: number
  academic_year: string
  semester: number | null
  home_address: string
  postal_code: string
  email_address: string
  contact_number: string
  mother_maiden_name: string
  mother_contact_number: string
  father_name: string
  father_contact_number: string
  elementary_school: string
  junior_high_school: string
  senior_high_school: string
  senior_high_track: string
  senior_high_strand: string
  senior_high_track_strand: string
  subject_load_schedule: string
  adviser_name: string
  adviser_approval_status: string
  adviser_approval_date: string | null
  dean_name: string
  dean_approval_status: string
  dean_approval_date: string | null
  loads: StudentLoad[]
}

type PreviewResponse = {
  subjects: Subject[]
}

type StudentCreateForm = {
  student_id: string
  last_name: string
  first_name: string
  middle_name: string
  extension_name: string
  gender: string
  date_of_birth: string
  civil_status: string
  nationality: string
  admission_date: string
  scholarship: string
  program: string
  section: string
  year_level: string
  academic_year: string
  semester: string
  home_address: string
  postal_code: string
  email_address: string
  contact_number: string
  mother_maiden_name: string
  mother_contact_number: string
  father_name: string
  father_contact_number: string
  elementary_school: string
  junior_high_school: string
  senior_high_school: string
  senior_high_track: string
  senior_high_strand: string
  senior_high_track_strand: string
  subject_load_schedule: string
  adviser_name: string
  adviser_approval_status: string
  dean_name: string
  dean_approval_status: string
}

type ScheduleRow = {
  mwfTime: string
  mwfSubject: string
  mwfSubjectTitle?: string
  mwfUnits: string
  mwfRoom: string
  tthTime: string
  tthSubject: string
  tthUnits: string
  tthRoom: string
  tthSaturdayHeader?: boolean
}

type EnrollmentDisplayScheduleRow = {
  rowIndex: number
  column: 'mwf' | 'tth'
  dayLabel: 'MWF' | 'TTH' | 'SATURDAY'
  time: string
  subject: string
  units: string
  room: string
}

type ScheduleColumn = 'mwf' | 'tth'
type ScheduleDragCell = {
  rowIndex: number
  column: ScheduleColumn
}

type EnrollmentNoticeTone = 'success' | 'error' | 'warning'

const MWF_SLOTS = ['7:00-8:00', '8:00-9:00', '9:00-10:00', '10:00-11:00', '11:00-12:00', '1:00-2:00', '2:00-3:00', '3:00-4:00', '4:00-5:00', '5:30-6:30']
const TTH_SLOTS = ['7:00-8:30', '8:30-10:00', '10:00-11:30', '1:00-2:30', '2:30-4:00', '4:00-5:30', '5:30-7:00', '7:00-8:30', 'SATURDAY_HEADER', '1:00-5:00', '', '']
const DEFAULT_ENROLLMENT_ACADEMIC_YEAR = '2025-2026'
const DEFAULT_ENROLLMENT_SEMESTER = '2'
const DEFAULT_STUDENT_ID_PREFIX = '2025'
const DEFAULT_PROGRAM_NAME = 'Bachelor of Science in Entrepreneurship'
const ENROLLMENT_NOTICE_DURATION_MS = 5000

const getTodayDateInputValue = (): string => new Date().toISOString().split('T')[0]

const buildInitialStudentForm = (): StudentCreateForm => ({
  student_id: '',
  last_name: '',
  first_name: '',
  middle_name: '',
  extension_name: '',
  gender: '',
  date_of_birth: '',
  civil_status: '',
  nationality: 'Filipino',
  admission_date: getTodayDateInputValue(),
  scholarship: '',
  program: '',
  section: '',
  year_level: '1',
  academic_year: DEFAULT_ENROLLMENT_ACADEMIC_YEAR,
  semester: DEFAULT_ENROLLMENT_SEMESTER,
  home_address: '',
  postal_code: '',
  email_address: '',
  contact_number: '',
  mother_maiden_name: '',
  mother_contact_number: 'n/a',
  father_name: '',
  father_contact_number: 'n/a',
  elementary_school: '',
  junior_high_school: '',
  senior_high_school: '',
  senior_high_track: '',
  senior_high_strand: '',
  senior_high_track_strand: '',
  subject_load_schedule: '',
  adviser_name: '',
  adviser_approval_status: 'approved',
  dean_name: '',
  dean_approval_status: 'approved',
})

const nullableNumber = (value: string): number | null => (value ? Number(value) : null)

const formatDateValue = (value: string | null): string => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString()
}

const formatStatusForSlip = (status: string): string => {
  const normalized = status.trim().toLowerCase()
  if (!normalized) return 'ON-GOING'
  if (normalized === 'ongoing') return 'ON-GOING'
  return normalized.toUpperCase().replace(/_/g, ' ')
}

const formatStudentNameForSlip = (
  lastName: string,
  firstName: string,
  middleName?: string | null,
  addPeriodForMiddleName = false,
): string => {
  const normalizedMiddleName = (middleName || '').trim()
  const middleWithPeriod = addPeriodForMiddleName && normalizedMiddleName
    ? (normalizedMiddleName.endsWith('.') ? normalizedMiddleName : `${normalizedMiddleName}.`)
    : normalizedMiddleName
  return `${lastName || '-'}, ${firstName || '-'}${middleWithPeriod ? ` ${middleWithPeriod}` : ''}`
}

const DEFAULT_SCHOLARSHIP_LABEL = 'Non-Scholar'
const PREPARED_BY_NAME = 'KRISTIN LILIA J. RUELO'
const PREPARED_BY_TITLE = 'College Registrar'
const PROPER_CASE_FIELDS: (keyof StudentCreateForm)[] = [
  'nationality',
  'home_address',
  'mother_maiden_name',
  'father_name',
  'elementary_school',
  'junior_high_school',
  'senior_high_school',
  'senior_high_track_strand',
]
const UPPERCASE_FIELDS: (keyof StudentCreateForm)[] = [
  'last_name',
  'first_name',
  'middle_name',
  'extension_name',
  'senior_high_track',
  'senior_high_strand',
]

const toProperCase = (value: string): string =>
  value
    .toLowerCase()
    .replace(/\b([a-z])/g, (match) => match.toUpperCase())

const hasSpecificSubject = (value: string): boolean => {
  const normalized = value.trim()
  if (!normalized) return false
  if (normalized.toUpperCase() === 'SATURDAY') return false
  return /[A-Za-z]/.test(normalized)
}

const formatUnitsForView = (value: string): string => {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return value
  return Number.isInteger(numericValue) ? String(numericValue) : String(numericValue)
}

const resolvePrintedByUser = (): string => {
  const storedUsername = localStorage.getItem('auth_username')
  if (storedUsername && storedUsername.trim()) return storedUsername.trim()

  const accessToken = localStorage.getItem('access_token')
  if (!accessToken) return 'Unknown User'
  const parts = accessToken.split('.')
  if (parts.length < 2) return 'Unknown User'

  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const paddedBase64 = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=')
    const payload = JSON.parse(window.atob(paddedBase64)) as Record<string, unknown>
    const usernameCandidate =
      payload.username ?? payload.user_name ?? payload.preferred_username ?? payload.email ?? payload.sub

    if (typeof usernameCandidate === 'string' && usernameCandidate.trim()) {
      const normalized = usernameCandidate.trim()
      localStorage.setItem('auth_username', normalized)
      return normalized
    }
  } catch {
    // Ignore decode errors and fall back to unknown.
  }

  return 'Unknown User'
}

const getGenderIconPath = (gender: string | null | undefined): string | null => {
  const normalizedGender = String(gender || '').trim().toLowerCase()
  if (normalizedGender === 'male') return '/male.png'
  if (normalizedGender === 'female') return '/female.png'
  return null
}

const resolveEnrollmentNoticeMeta = (
  tone: EnrollmentNoticeTone,
  message: string,
): { title: string; accentClassName: string; icon: string } => {
  const normalized = message.trim().toLowerCase()

  if (tone === 'error') {
    return { title: 'Error!', accentClassName: 'is-error', icon: 'x' }
  }

  if (normalized.includes('delete') || normalized.includes('deleted')) {
    return { title: 'Deleted!', accentClassName: 'is-warning', icon: '!' }
  }

  if (normalized.includes('update') || normalized.includes('updated')) {
    return { title: 'Updated!', accentClassName: 'is-success', icon: 'check' }
  }

  if (tone === 'warning') {
    return { title: 'Notice!', accentClassName: 'is-warning', icon: '!' }
  }

  return { title: 'Success!', accentClassName: 'is-success', icon: 'check' }
}

const calculateAgeFromDob = (dob: string): number | null => {
  if (!dob) return null
  const birthDate = new Date(dob)
  if (Number.isNaN(birthDate.getTime())) return null

  const today = new Date()
  let age = today.getFullYear() - birthDate.getFullYear()
  const monthDiff = today.getMonth() - birthDate.getMonth()
  const dayDiff = today.getDate() - birthDate.getDate()

  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1
  }
  return age >= 0 ? age : null
}

const buildInitialScheduleRows = (): ScheduleRow[] => {
  const totalRows = Math.max(MWF_SLOTS.length, TTH_SLOTS.length)
  return Array.from({ length: totalRows }, (_, index) => {
    const tthSlot = TTH_SLOTS[index] ?? ''
    const isSaturdayHeader = tthSlot === 'SATURDAY_HEADER'
    return {
      mwfTime: MWF_SLOTS[index] ?? '',
      mwfSubject: '',
      mwfUnits: '',
      mwfRoom: '',
      tthTime: isSaturdayHeader ? 'TIME' : tthSlot,
      tthSubject: isSaturdayHeader ? 'SATURDAY' : '',
      tthUnits: '',
      tthRoom: '',
      tthSaturdayHeader: isSaturdayHeader,
    }
  })
}

const toMinutes = (value: string): number | null => {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return hours * 60 + minutes
}

const isTimeRangeCompatible = (slotTime: string, requestedTime: string): boolean => {
  const slotParts = slotTime.trim().split('-')
  const reqParts = requestedTime.trim().split('-')
  if (slotParts.length !== 2 || reqParts.length !== 2) return slotTime.trim() === requestedTime.trim()

  const slotStart = toMinutes(slotParts[0])
  const slotEnd = toMinutes(slotParts[1])
  const reqStart = toMinutes(reqParts[0])
  const reqEnd = toMinutes(reqParts[1])
  if ([slotStart, slotEnd, reqStart, reqEnd].some((v) => v === null)) {
    return slotTime.trim() === requestedTime.trim()
  }

  // Accept 1-minute start offsets when end time matches (e.g. 2:00 vs 2:01).
  return slotEnd === reqEnd && Math.abs((slotStart as number) - (reqStart as number)) <= 1
}

const buildScheduleRowsFromProspectus = (
  entries: ProspectusEntry[],
  subjectMap: Map<number, Subject>,
  sectionLabel: string,
): ScheduleRow[] => {
  const rows = buildInitialScheduleRows()
  const sectionSuffix = sectionLabel ? ` - ${sectionLabel}` : ''

  const placeSubjectIntoRow = (entry: ProspectusEntry): boolean => {
    const subject = subjectMap.get(entry.subject)
    if (!subject) return false
    const subjectLabel = `${subject.code} ${subject.title}${sectionSuffix}`.trim()
    const unitsLabel = String(subject.units)
    const roomLabel = entry.room || ''
    const placement = parseSubjectTimeSlot(entry.time || '')

    if (placement?.day === 'MWF') {
      const idx = rows.findIndex((row) => isTimeRangeCompatible(row.mwfTime.trim(), placement.time) && !row.mwfSubject.trim())
      if (idx >= 0) {
        rows[idx].mwfSubject = subjectLabel
        rows[idx].mwfUnits = unitsLabel
        rows[idx].mwfRoom = roomLabel
        return true
      }
      // Fallback: place in any empty MWF row and keep the exact prospectus time.
      const fallbackIdx = rows.findIndex((row) => !row.mwfSubject.trim())
      if (fallbackIdx >= 0) {
        rows[fallbackIdx].mwfTime = placement.time
        rows[fallbackIdx].mwfSubject = subjectLabel
        rows[fallbackIdx].mwfUnits = unitsLabel
        rows[fallbackIdx].mwfRoom = roomLabel
        return true
      }
    }
    if (placement?.day === 'TTH') {
      const idx = rows.findIndex(
        (row) => !row.tthSaturdayHeader && isTimeRangeCompatible(row.tthTime.trim(), placement.time) && !row.tthSubject.trim(),
      )
      if (idx >= 0) {
        rows[idx].tthSubject = subjectLabel
        rows[idx].tthUnits = unitsLabel
        rows[idx].tthRoom = roomLabel
        return true
      }
      // Fallback: place in any empty TTH row and keep exact prospectus time.
      const fallbackIdx = rows.findIndex((row) => !row.tthSaturdayHeader && !row.tthSubject.trim())
      if (fallbackIdx >= 0) {
        rows[fallbackIdx].tthTime = placement.time
        rows[fallbackIdx].tthSubject = subjectLabel
        rows[fallbackIdx].tthUnits = unitsLabel
        rows[fallbackIdx].tthRoom = roomLabel
        return true
      }
    }
    if (placement?.day === 'SATURDAY') {
      const saturdayHeaderIndex = rows.findIndex((row) => row.tthSaturdayHeader)
      const idx = rows.findIndex(
        (row, index) =>
          index > saturdayHeaderIndex &&
          !row.tthSaturdayHeader &&
          isTimeRangeCompatible(row.tthTime.trim(), placement.time) &&
          !row.tthSubject.trim(),
      )
      if (idx >= 0) {
        rows[idx].tthSubject = subjectLabel
        rows[idx].tthUnits = unitsLabel
        rows[idx].tthRoom = roomLabel
        return true
      }
      // Fallback: place below SATURDAY header and keep exact prospectus time.
      const fallbackIdx = rows.findIndex(
        (row, index) => index > saturdayHeaderIndex && !row.tthSaturdayHeader && !row.tthSubject.trim(),
      )
      if (fallbackIdx >= 0) {
        rows[fallbackIdx].tthTime = placement.time
        rows[fallbackIdx].tthSubject = subjectLabel
        rows[fallbackIdx].tthUnits = unitsLabel
        rows[fallbackIdx].tthRoom = roomLabel
        return true
      }
    }

    const fallbackMwfIdx = rows.findIndex((row) => !row.mwfSubject.trim())
    if (fallbackMwfIdx >= 0) {
      if (placement?.time) rows[fallbackMwfIdx].mwfTime = placement.time
      rows[fallbackMwfIdx].mwfSubject = subjectLabel
      rows[fallbackMwfIdx].mwfUnits = unitsLabel
      rows[fallbackMwfIdx].mwfRoom = roomLabel
      return true
    }
    const fallbackTthIdx = rows.findIndex((row) => !row.tthSaturdayHeader && !row.tthSubject.trim())
    if (fallbackTthIdx >= 0) {
      if (placement?.time) rows[fallbackTthIdx].tthTime = placement.time
      rows[fallbackTthIdx].tthSubject = subjectLabel
      rows[fallbackTthIdx].tthUnits = unitsLabel
      rows[fallbackTthIdx].tthRoom = roomLabel
      return true
    }
    return false
  }

  entries.forEach((entry) => {
    placeSubjectIntoRow(entry)
  })

  return rows
}

const parseSubjectTimeSlot = (value: string): { day: 'MWF' | 'TTH' | 'SATURDAY'; time: string } | null => {
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (!normalized) return null
  const match = normalized.match(/^(MWF|TTH|SATURDAY)\s+(.+)$/i)
  if (!match) return null
  const dayToken = match[1].toUpperCase()
  const time = match[2].trim()
  if (!time) return null
  if (dayToken === 'MWF') return { day: 'MWF', time }
  if (dayToken === 'TTH') return { day: 'TTH', time }
  return { day: 'SATURDAY', time }
}

const formatTimeRangeWithMeridiem = (value: string): string => {
  const normalized = value.trim().replace(/\s+/g, ' ')
  if (!normalized) return ''
  if (/\bAM\b|\bPM\b/i.test(normalized)) return normalized.toUpperCase()

  const [startRaw, endRaw] = normalized.split(/\s*-\s*/).map((part) => part.trim())
  if (!startRaw || !endRaw) return normalized

  const parseTimeToken = (token: string) => {
    const match = token.match(/^(\d{1,2}):([0-5]\d)$/)
    if (!match) return null
    const hour = Number(match[1])
    const minute = Number(match[2])
    if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 1 || hour > 12) return null
    return { hour, minute }
  }

  const start = parseTimeToken(startRaw)
  const end = parseTimeToken(endRaw)
  if (!start || !end) return normalized

  const inferMeridiem = (hour: number, minute: number): 'AM' | 'PM' => {
    if (hour === 12) return 'PM'
    if (hour >= 1 && hour <= 6) return 'PM'
    if (hour === 7 && minute > 0) return 'PM'
    return 'AM'
  }

  const formatToken = ({ hour, minute }: { hour: number; minute: number }, meridiem: 'AM' | 'PM') =>
    `${hour}:${String(minute).padStart(2, '0')} ${meridiem}`

  return `${formatToken(start, inferMeridiem(start.hour, start.minute))} - ${formatToken(end, inferMeridiem(end.hour, end.minute))}`
}

const buildScheduleTextFromRows = (rows: ScheduleRow[]): string => {
  const saturdayHeaderIndex = rows.findIndex((row) => row.tthSaturdayHeader)
  const hasSaturdaySubjects =
    saturdayHeaderIndex >= 0 && rows.slice(saturdayHeaderIndex + 1).some((row) => hasSpecificSubject(row.tthSubject))

  return rows
    .flatMap((row) => {
      const mwfHasSubject = hasSpecificSubject(row.mwfSubject)
      const tthHasSubject = hasSpecificSubject(row.tthSubject)

      if (row.tthSaturdayHeader) {
        if (!hasSaturdaySubjects) return []
        return [`MWF ${row.mwfTime}: ${row.mwfSubject.trim()} (${row.mwfUnits.trim()}) | TTH ${row.tthTime}: SATURDAY ()`]
      }

      if (!mwfHasSubject && !tthHasSubject) return []

      if (mwfHasSubject && tthHasSubject) {
        return [`MWF ${row.mwfTime}: ${row.mwfSubject.trim()} (${row.mwfUnits.trim()}) | TTH ${row.tthTime}: ${row.tthSubject.trim()} (${row.tthUnits.trim()})`]
      }

      if (mwfHasSubject) {
        return [`MWF ${row.mwfTime}: ${row.mwfSubject.trim()} (${row.mwfUnits.trim()})`]
      }

      return [`MWF ${row.mwfTime}:  () | TTH ${row.tthTime}: ${row.tthSubject.trim()} (${row.tthUnits.trim()})`]
    })
    .join('\n')
}

const buildScheduleRowsFromSavedText = (scheduleText: string): ScheduleRow[] => {
  const rows = buildInitialScheduleRows()
  if (!scheduleText.trim()) return rows

  const findOrFallbackRow = (
    matcher: (row: ScheduleRow, index: number) => boolean,
    fallback: (row: ScheduleRow, index: number) => boolean,
  ): number => {
    const exactIndex = rows.findIndex(matcher)
    if (exactIndex >= 0) return exactIndex
    return rows.findIndex(fallback)
  }

  const parseScheduleSide = (rawSide: string) => {
    const unitsMatch = rawSide.match(/\(([^()]*)\)\s*$/)
    const units = unitsMatch ? unitsMatch[1].trim() : ''
    const withoutUnits =
      unitsMatch && unitsMatch.index !== undefined ? rawSide.slice(0, unitsMatch.index).trim() : rawSide.trim()
    const separatorIndex = withoutUnits.indexOf(': ')
    if (separatorIndex < 0) return { time: '', subject: withoutUnits.trim(), units }
    return {
      time: withoutUnits.slice(0, separatorIndex).trim(),
      subject: withoutUnits.slice(separatorIndex + 2).trim(),
      units,
    }
  }

  const saturdayHeaderIndex = rows.findIndex((row) => row.tthSaturdayHeader)
  let inSaturdayBlock = false

  scheduleText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const normalizedLine = line.replace(/\s+/g, ' ').trim()
      const mwfPrefixMatch = normalizedLine.match(/^MWF\s+/i)
      if (!mwfPrefixMatch) return

      const splitMatch = normalizedLine.match(/\s\|\sTTH\s/i)
      if (!splitMatch || splitMatch.index === undefined) {
        const mwfOnlyRaw = normalizedLine.replace(/^MWF\s+/i, '')
        const mwfOnly = parseScheduleSide(mwfOnlyRaw)
        if (hasSpecificSubject(mwfOnly.subject)) {
          const rowIndex = findOrFallbackRow(
            (row) => row.mwfTime.trim() === mwfOnly.time,
            (row) => !row.mwfSubject.trim(),
          )
          if (rowIndex >= 0) {
            rows[rowIndex].mwfSubject = mwfOnly.subject
            rows[rowIndex].mwfUnits = mwfOnly.units
          }
        }
        return
      }

      const splitIndex = splitMatch.index
      const splitTokenLength = splitMatch[0].length
      const mwfSideRaw = normalizedLine.slice(mwfPrefixMatch[0].length, splitIndex).trim()
      const tthSideRaw = normalizedLine.slice(splitIndex + splitTokenLength).trim()
      const mwfSide = parseScheduleSide(mwfSideRaw)
      const tthSide = parseScheduleSide(tthSideRaw)

      if (hasSpecificSubject(mwfSide.subject)) {
        const rowIndex = findOrFallbackRow(
          (row) => row.mwfTime.trim() === mwfSide.time,
          (row) => !row.mwfSubject.trim(),
        )
        if (rowIndex >= 0) {
          rows[rowIndex].mwfSubject = mwfSide.subject
          rows[rowIndex].mwfUnits = mwfSide.units
        }
      }

      const tthTime = tthSide.time.trim()
      const tthSubject = tthSide.subject.trim()
      if (tthTime.toUpperCase() === 'TIME' && tthSubject.toUpperCase() === 'SATURDAY') {
        inSaturdayBlock = true
        return
      }
      if (!hasSpecificSubject(tthSubject)) return

      const rowIndex =
        inSaturdayBlock && saturdayHeaderIndex >= 0
          ? findOrFallbackRow(
              (row, idx) => idx > saturdayHeaderIndex && !row.tthSaturdayHeader && row.tthTime.trim() === tthTime,
              (row, idx) => idx > saturdayHeaderIndex && !row.tthSaturdayHeader && !row.tthSubject.trim(),
            )
          : findOrFallbackRow(
              (row) => !row.tthSaturdayHeader && row.tthTime.trim() === tthTime,
              (row) => !row.tthSaturdayHeader && !row.tthSubject.trim(),
            )

      if (rowIndex >= 0) {
        rows[rowIndex].tthSubject = tthSubject
        rows[rowIndex].tthUnits = tthSide.units
      }
    })

  return rows
}

const buildAcademicYearOptions = () => {
  const currentYear = new Date().getFullYear()
  return Array.from({ length: 21 }, (_, i) => {
    const start = currentYear - 10 + i
    return `${start}-${start + 1}`
  })
}

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const normalizeDocumentText = (text: string): string =>
  text
    .replace(/\r/g, '\n')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim()

const normalizeOcrKey = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]/g, '')

const splitNormalizedLines = (text: string): string[] =>
  normalizeDocumentText(text)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

const buildCodeVariants = (value: string): string[] => {
  const base = value.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!base) return []
  const variants = new Set<string>([base])
  variants.add(base.replace(/O/g, '0'))
  variants.add(base.replace(/0/g, 'O'))
  variants.add(base.replace(/I/g, '1'))
  variants.add(base.replace(/1/g, 'I'))
  return Array.from(variants)
}

const normalizeDateForInput = (value: string): string => {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed

  const slashMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (slashMatch) {
    const month = slashMatch[1].padStart(2, '0')
    const day = slashMatch[2].padStart(2, '0')
    return `${slashMatch[3]}-${month}-${day}`
  }

  const parsed = new Date(trimmed)
  if (Number.isNaN(parsed.getTime())) return ''
  return parsed.toISOString().split('T')[0]
}

const extractLabeledValue = (text: string, labels: string[]): string => {
  const lines = splitNormalizedLines(text)
  const normalizedLabels = labels.map((label) => normalizeOcrKey(label))

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+/g, ' ').trim()
    const normalizedLine = normalizeOcrKey(line)
    for (let index = 0; index < labels.length; index += 1) {
      const label = labels[index]
      const normalizedLabel = normalizedLabels[index]
      if (!normalizedLabel || !normalizedLine.includes(normalizedLabel)) continue
      const regex = new RegExp(`${label.replace(/\s+/g, '\\s*')}\\s*(?:[:=-]|is)?\\s*(.+)$`, 'i')
      const match = line.match(regex)
      if (match?.[1]?.trim()) return match[1].trim()

      const labelPos = normalizedLine.indexOf(normalizedLabel)
      if (labelPos >= 0) {
        const approxStart = Math.min(line.length, labelPos + label.length)
        const trailing = line.slice(approxStart).replace(/^[:=\-\s]+/, '').trim()
        if (trailing && trailing.toLowerCase() !== label.toLowerCase()) return trailing
      }
    }
  }

  // Fallback to whole-text matching for scanned layouts with wrapped labels/values.
  for (const label of labels) {
    const labelPattern = label.replace(/\s+/g, '\\s*')
    const regex = new RegExp(`${labelPattern}\\s*(?:[:=-]|is)?\\s*([^\\n]+)`, 'i')
    const match = text.match(regex)
    if (!match) continue
    const value = match[1].trim().replace(/[|]+/g, ' ')
    if (value) return value
  }
  return ''
}

const normalizeSemester = (text: string): string => {
  const normalized = text.toLowerCase()
  if (/(^|\s)(1|first|1st)\s*semester/.test(normalized)) return '1'
  if (/(^|\s)(2|second|2nd)\s*semester/.test(normalized)) return '2'
  if (/(^|\s)(3|third|3rd|summer)/.test(normalized)) return '3'
  return ''
}

const parseScannedStudentForm = (
  text: string,
  programs: Program[],
  sections: Section[],
): Partial<StudentCreateForm> => {
  const normalizedText = normalizeDocumentText(text)
  const normalizedLines = splitNormalizedLines(text)
  const updates: Partial<StudentCreateForm> = {}

  const candidateId =
    normalizedText.match(/\b20\d{6}\b/)?.[0] ||
    normalizedText.match(/\b\d{8}\b/)?.[0] ||
    normalizedText.match(/\b\d{4}\b/)?.[0] ||
    ''
  if (candidateId) updates.student_id = candidateId

  const emailFromText = normalizedText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]
  if (emailFromText) updates.email_address = emailFromText

  const contactFromText = normalizedText.match(/(?:\+63|0)\d{10}/)?.[0]
  if (contactFromText) updates.contact_number = contactFromText

  const lastName = extractLabeledValue(normalizedText, ['last name', 'surname'])
  if (lastName) updates.last_name = lastName

  const firstName = extractLabeledValue(normalizedText, ['first name', 'given name'])
  if (firstName) updates.first_name = firstName

  const middleName = extractLabeledValue(normalizedText, ['middle name', 'middle initial'])
  if (middleName) updates.middle_name = middleName

  const extensionName = extractLabeledValue(normalizedText, ['name ext', 'extension name', 'suffix'])
  if (extensionName) updates.extension_name = extensionName

  if (/\bmale\b/i.test(normalizedText)) updates.gender = 'Male'
  if (/\bfemale\b/i.test(normalizedText)) updates.gender = 'Female'

  const dateOfBirth = extractLabeledValue(normalizedText, ['date of birth', 'birth date', 'dob'])
  const parsedDob = normalizeDateForInput(dateOfBirth)
  if (parsedDob) updates.date_of_birth = parsedDob

  const civilStatus = extractLabeledValue(normalizedText, ['civil status', 'status'])
  if (civilStatus) updates.civil_status = civilStatus

  const academicYear = normalizedText.match(/\b20\d{2}\s*-\s*20\d{2}\b/)?.[0]?.replace(/\s+/g, '')
  if (academicYear) updates.academic_year = academicYear

  const semester = normalizeSemester(normalizedText)
  if (semester) updates.semester = semester

  const yearLevel = extractLabeledValue(normalizedText, ['year level', 'year'])
  const parsedYearLevel = yearLevel.match(/\b([1-4])\b/)?.[1]
  if (parsedYearLevel) updates.year_level = parsedYearLevel

  const scholarship = extractLabeledValue(normalizedText, ['scholarship'])
  if (scholarship) updates.scholarship = scholarship

  const nationality = extractLabeledValue(normalizedText, ['nationality', 'citizenship'])
  if (nationality) updates.nationality = nationality

  const admissionDate = extractLabeledValue(normalizedText, ['date enrolled', 'admission date', 'enrollment date'])
  const parsedAdmissionDate = normalizeDateForInput(admissionDate)
  if (parsedAdmissionDate) updates.admission_date = parsedAdmissionDate

  const homeAddress = extractLabeledValue(normalizedText, ['complete home address', 'home address', 'address'])
  if (homeAddress) updates.home_address = homeAddress

  const emailAddress = extractLabeledValue(normalizedText, ['email address', 'email'])
  if (emailAddress) updates.email_address = emailAddress

  const contactNumber = extractLabeledValue(normalizedText, ['mobile number', 'contact number', 'phone number'])
  if (contactNumber) updates.contact_number = contactNumber

  const motherMaidenName = extractLabeledValue(normalizedText, ["mother's maiden name", 'mother maiden name'])
  if (motherMaidenName) updates.mother_maiden_name = motherMaidenName

  const fatherName = extractLabeledValue(normalizedText, ["father's name", 'father name'])
  if (fatherName) updates.father_name = fatherName

  const elementarySchool = extractLabeledValue(normalizedText, ['elementary'])
  if (elementarySchool) updates.elementary_school = elementarySchool

  const juniorHighSchool = extractLabeledValue(normalizedText, ['junior high school'])
  if (juniorHighSchool) updates.junior_high_school = juniorHighSchool

  const seniorHighSchool = extractLabeledValue(normalizedText, ['senior high school'])
  if (seniorHighSchool) updates.senior_high_school = seniorHighSchool

  const track = extractLabeledValue(normalizedText, ['track'])
  if (track) updates.senior_high_track = track

  const strand = extractLabeledValue(normalizedText, ['strand'])
  if (strand) updates.senior_high_strand = strand

  const normalizedTextForMatch = normalizedText.toLowerCase()
  const matchedProgram = programs.find((program) => normalizedTextForMatch.includes(program.name.toLowerCase()))
  if (matchedProgram) updates.program = String(matchedProgram.id)

  const matchedSection = sections.find((section) => {
    const sectionRegex = new RegExp(`\\b${escapeRegex(section.name)}\\b`, 'i')
    return sectionRegex.test(normalizedText)
  })
  if (matchedSection) updates.section = String(matchedSection.id)

  const loadSlipNameLine = normalizedLines.find((line) => /(^|\s)name\s*[:=-]/i.test(line))
  if (loadSlipNameLine && (!updates.first_name || !updates.last_name)) {
    const rawName = loadSlipNameLine.replace(/^.*name\s*[:=-]\s*/i, '').trim()
    const commaSplit = rawName.split(',').map((part) => part.trim()).filter(Boolean)
    if (commaSplit.length >= 2) {
      if (!updates.last_name) updates.last_name = commaSplit[0]
      const firstParts = commaSplit[1].split(/\s+/).filter(Boolean)
      if (!updates.first_name && firstParts.length) updates.first_name = firstParts[0]
      if (!updates.middle_name && firstParts.length > 1) updates.middle_name = firstParts.slice(1).join(' ')
    }
  }

  return updates
}

const detectSubjectsFromScannedText = (text: string, availableSubjects: Subject[]): Subject[] => {
  const normalizedText = normalizeDocumentText(text)
  if (!normalizedText) return []
  const compactText = normalizedText.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const seenSubjectIds = new Set<number>()
  const matched: Subject[] = []

  availableSubjects.forEach((subject) => {
    const codeRegex = new RegExp(`\\b${escapeRegex(subject.code)}\\b`, 'i')
    const codeVariants = buildCodeVariants(subject.code)
    const variantMatched = codeVariants.some((variant) => compactText.includes(variant))
    const titleMatched = subject.title && normalizedText.toLowerCase().includes(subject.title.toLowerCase())
    if ((codeRegex.test(normalizedText) || variantMatched || titleMatched) && !seenSubjectIds.has(subject.id)) {
      seenSubjectIds.add(subject.id)
      matched.push(subject)
    }
  })

  return matched
}

export function EnrollmentPage() {
  const [searchId, setSearchId] = useState('')
  const [student, setStudent] = useState<StudentDetail | null>(null)
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [terms, setTerms] = useState<AcademicTerm[]>([])
  const [departments, setDepartments] = useState<Department[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [prospectusEntries, setProspectusEntries] = useState<ProspectusEntry[]>([])
  const [previewSubjects, setPreviewSubjects] = useState<Subject[]>([])
  const [enrolledStudents, setEnrolledStudents] = useState<EnrolledStudent[]>([])
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null)
  const skipAutoScheduleRef = useRef(false)

  const [studentForm, setStudentForm] = useState<StudentCreateForm>(() => buildInitialStudentForm())
  const [scheduleRows, setScheduleRows] = useState<ScheduleRow[]>(buildInitialScheduleRows)
  const [isEnrollModalOpen, setIsEnrollModalOpen] = useState(false)
  const [shouldCloseOnSaveEnrollment, setShouldCloseOnSaveEnrollment] = useState(true)
  const [isViewModalOpen, setIsViewModalOpen] = useState(false)
  const [isPrintingLoadSlip, setIsPrintingLoadSlip] = useState(false)
  const [isScanningDocuments, setIsScanningDocuments] = useState(false)
  const [scanStep, setScanStep] = useState<'idle' | 'awaiting_load_slip'>('idle')
  const [scanStatus, setScanStatus] = useState('')
  const [viewStudent, setViewStudent] = useState<StudentDetail | null>(null)
  const [isViewLoading, setIsViewLoading] = useState(false)
  const [viewStatus, setViewStatus] = useState('ON-GOING')
  const [viewScholarship, setViewScholarship] = useState('')
  const [viewDateOfBirth, setViewDateOfBirth] = useState<string | null>(null)

  const [selectedSubject, setSelectedSubject] = useState('')
  const [selectedTerm, setSelectedTerm] = useState('')
  const [statusValue, setStatusValue] = useState('enrolled')
  const [draggingCell, setDraggingCell] = useState<ScheduleDragCell | null>(null)
  const [dropTarget, setDropTarget] = useState<ScheduleDragCell | null>(null)
  const [isTrashDropActive, setIsTrashDropActive] = useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [deleteStudentId, setDeleteStudentId] = useState<string | null>(null)
  const [isDeletingStudent, setIsDeletingStudent] = useState(false)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [warning, setWarning] = useState('')
  const [notificationProgress, setNotificationProgress] = useState(100)
  const [folderSearchQueries, setFolderSearchQueries] = useState<Record<string, string>>({})
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {}
    try {
      const stored = window.localStorage.getItem(ENROLLMENT_FOLDERS_STORAGE_KEY)
      if (stored) return JSON.parse(stored) as Record<string, boolean>
    } catch {
      /* ignore */
    }
    return {}
  })
  const enrollmentScanInputRef = useRef<HTMLInputElement | null>(null)
  const loadSlipScanInputRef = useRef<HTMLInputElement | null>(null)
  const computedAge = calculateAgeFromDob(studentForm.date_of_birth)
  const academicYearOptions = useMemo(buildAcademicYearOptions, [])
  const [approvalDate, setApprovalDate] = useState(() => getTodayDateInputValue())
  const defaultProgram = useMemo(
    () => programs.find((program) => program.name === DEFAULT_PROGRAM_NAME) || null,
    [programs],
  )
  const defaultProgramId = defaultProgram ? String(defaultProgram.id) : ''

  useEffect(() => {
    const handleBeforePrint = () => setIsPrintingLoadSlip(true)
    const handleAfterPrint = () => setIsPrintingLoadSlip(false)
    window.addEventListener('beforeprint', handleBeforePrint)
    window.addEventListener('afterprint', handleAfterPrint)
    return () => {
      window.removeEventListener('beforeprint', handleBeforePrint)
      window.removeEventListener('afterprint', handleAfterPrint)
    }
  }, [])

  const activeNotification = useMemo(() => {
    if (error) return { tone: 'error' as const, message: error }
    if (warning) return { tone: 'warning' as const, message: warning }
    if (success) return { tone: 'success' as const, message: success }
    return null
  }, [error, success, warning])

  const clearActiveNotification = useCallback(() => {
    setError('')
    setWarning('')
    setSuccess('')
  }, [])

  const activeNotificationMeta = useMemo(
    () => (activeNotification ? resolveEnrollmentNoticeMeta(activeNotification.tone, activeNotification.message) : null),
    [activeNotification],
  )

  useEffect(() => {
    if (!activeNotification) return
    setNotificationProgress(100)
    const startedAt = window.performance.now()
    const intervalId = window.setInterval(() => {
      const elapsed = window.performance.now() - startedAt
      const remaining = Math.max(0, ENROLLMENT_NOTICE_DURATION_MS - elapsed)
      setNotificationProgress((remaining / ENROLLMENT_NOTICE_DURATION_MS) * 100)
      if (remaining <= 0) {
        window.clearInterval(intervalId)
        clearActiveNotification()
      }
    }, 50)

    return () => {
      window.clearInterval(intervalId)
      setNotificationProgress(100)
    }
  }, [activeNotification, clearActiveNotification])
  const enrollmentScheduleSummary = useMemo(() => {
    return scheduleRows.reduce(
      (acc, row) => {
        const append = (subject: string, units: string) => {
          if (!hasSpecificSubject(subject)) return
          acc.totalSubjects += 1
          const parsedUnits = Number(units)
          if (Number.isFinite(parsedUnits)) acc.totalUnits += parsedUnits
        }
        append(row.mwfSubject, row.mwfUnits)
        append(row.tthSubject, row.tthUnits)
        return acc
      },
      { totalSubjects: 0, totalUnits: 0 },
    )
  }, [scheduleRows])

  const loadEnrolledStudents = useCallback(async () => {
    try {
      const response = await api.get<EnrolledStudent[]>('/students/')
      const newlyEnrolledStudents = response.data.filter(
        (student) => student.year_level === 1 && Number(student.semester) === 1,
      )
      setEnrolledStudents(newlyEnrolledStudents)
    } catch (error) {
      setError(getErrorMessage(error))
    }
  }, [])

  const loadReferenceData = async () => {
    const [subjectResp, termResp, departmentResp, programResp, sectionResp, prospectusResp] = await Promise.all([
      api.get<Subject[]>('/subjects/'),
      api.get<AcademicTerm[]>('/terms/'),
      api.get<Department[]>('/departments/'),
      api.get<Program[]>('/programs/'),
      api.get<Section[]>('/sections/'),
      api.get<ProspectusEntry[]>('/prospectus/'),
    ])
    setSubjects(subjectResp.data)
    setTerms(termResp.data)
    setDepartments(departmentResp.data)
    setPrograms(programResp.data)
    setSections(sectionResp.data)
    setProspectusEntries(prospectusResp.data)

    const activeTerm = termResp.data.find((term) => term.is_active)
    if (activeTerm) setSelectedTerm(String(activeTerm.id))
    const resolvedDefaultProgram = programResp.data.find((program) => program.name === DEFAULT_PROGRAM_NAME)
    if (resolvedDefaultProgram) {
      setStudentForm((prev) => ({
        ...prev,
        program: prev.program || String(resolvedDefaultProgram.id),
        adviser_name: prev.adviser_name || resolvedDefaultProgram.program_adviser || '',
        dean_name: prev.dean_name || resolvedDefaultProgram.school_dean || '',
      }))
    }
  }

  useEffect(() => {
    loadReferenceData().catch((err) => setError(getErrorMessage(err)))
    loadEnrolledStudents().catch((err) => setError(getErrorMessage(err)))
  }, [])

  useEffect(() => {
    window.localStorage.setItem(ENROLLMENT_FOLDERS_STORAGE_KEY, JSON.stringify(openFolders))
  }, [openFolders])

  const refreshStudent = async (studentId: string) => {
    const studentResp = await api.get<StudentDetail>(`/students/${studentId}/`)
    setStudent(studentResp.data)
  }

  const handleViewStudent = async (studentId: string) => {
    setError('')
    setSuccess('')
    setIsViewLoading(true)
    try {
      const studentResp = await api.get<StudentDetail>(`/students/${studentId}/`)
      const selectedStudent = studentResp.data
      setViewStudent(selectedStudent)

      let resolvedStatus = 'ON-GOING'
      let resolvedScholarship = selectedStudent.scholarship || ''
      let resolvedDateOfBirth = selectedStudent.date_of_birth

      try {
        const historyResp = await api.get<AcademicHistoryRecord[]>('/academic-history/')
        const matchedHistory = historyResp.data.find(
          (history) =>
            history.student === selectedStudent.id &&
            history.academic_year === selectedStudent.academic_year &&
            Number(history.semester) === Number(selectedStudent.semester),
        )
        if (matchedHistory) {
          resolvedStatus = formatStatusForSlip(matchedHistory.status)
          if (!resolvedScholarship) resolvedScholarship = matchedHistory.scholarship || ''
          if (!resolvedDateOfBirth) resolvedDateOfBirth = matchedHistory.date_of_birth
        }
      } catch (historyErr) {
        resolvedStatus = 'ON-GOING'
      }

      setViewStatus(resolvedStatus)
      setViewScholarship(resolvedScholarship || DEFAULT_SCHOLARSHIP_LABEL)
      setViewDateOfBirth(resolvedDateOfBirth)
      setIsViewModalOpen(true)
    } catch (err) {
      setViewStudent(null)
      setError(getErrorMessage(err))
    } finally {
      setIsViewLoading(false)
    }
  }

  const searchStudent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setSuccess('')
    setPreviewSubjects([])
    try {
      setError('')
      await refreshStudent(searchId)
    } catch (err) {
      setStudent(null)
      setError(getErrorMessage(err))
    }
  }

  const onStudentFieldChange = (field: keyof StudentCreateForm, value: string) => {
    if (field === 'student_id' && !editingStudentId) {
      const digitsOnly = value.replace(/\D/g, '')
      const suffix = digitsOnly.startsWith(DEFAULT_STUDENT_ID_PREFIX)
        ? digitsOnly.slice(DEFAULT_STUDENT_ID_PREFIX.length, DEFAULT_STUDENT_ID_PREFIX.length + 4)
        : digitsOnly.slice(0, 4)
      setStudentForm((prev) => ({ ...prev, student_id: suffix ? `${DEFAULT_STUDENT_ID_PREFIX}${suffix}` : '' }))
      return
    }
    if (field === 'admission_date') {
      setStudentForm((prev) => ({ ...prev, admission_date: value }))
      setApprovalDate(value)
      return
    }
    if (field === 'senior_high_track' || field === 'senior_high_strand') {
      setStudentForm((prev) => ({ ...prev, [field]: value.toUpperCase() }))
      return
    }
    const formattedValue = UPPERCASE_FIELDS.includes(field)
      ? value.toUpperCase()
      : PROPER_CASE_FIELDS.includes(field)
        ? toProperCase(value)
        : value
    setStudentForm((prev) => ({ ...prev, [field]: formattedValue }))
  }

  const onProgramChange = (programId: string) => {
    const selected = programs.find((program) => String(program.id) === programId)
    setStudentForm((prev) => ({
      ...prev,
      program: programId,
      section: '',
      adviser_name: selected?.program_adviser || '',
      dean_name: selected?.school_dean || '',
    }))
  }

  const mergeStudentFormUpdates = (base: StudentCreateForm, updates: Partial<StudentCreateForm>): StudentCreateForm => {
    const merged: StudentCreateForm = { ...base }
    ;(Object.keys(updates) as (keyof StudentCreateForm)[]).forEach((field) => {
      const incomingValue = updates[field]
      if (typeof incomingValue !== 'string') return
      const trimmedValue = incomingValue.trim()
      if (!trimmedValue) return

      if (field === 'student_id' && !editingStudentId) {
        const digitsOnly = trimmedValue.replace(/\D/g, '')
        const suffix = digitsOnly.startsWith(DEFAULT_STUDENT_ID_PREFIX)
          ? digitsOnly.slice(DEFAULT_STUDENT_ID_PREFIX.length, DEFAULT_STUDENT_ID_PREFIX.length + 4)
          : digitsOnly.slice(-4)
        merged.student_id = suffix ? `${DEFAULT_STUDENT_ID_PREFIX}${suffix}` : merged.student_id
        return
      }
      if (field === 'admission_date') {
        const normalizedDate = normalizeDateForInput(trimmedValue)
        if (normalizedDate) merged.admission_date = normalizedDate
        return
      }
      if (field === 'senior_high_track' || field === 'senior_high_strand') {
        merged[field] = trimmedValue.toUpperCase()
        return
      }
      if (UPPERCASE_FIELDS.includes(field)) {
        merged[field] = trimmedValue.toUpperCase()
        return
      }
      if (PROPER_CASE_FIELDS.includes(field)) {
        merged[field] = toProperCase(trimmedValue)
        return
      }
      merged[field] = trimmedValue
    })
    return merged
  }

  const buildScheduleRowsFromDetectedSubjects = (detectedSubjects: Subject[], formValues: StudentCreateForm): ScheduleRow[] => {
    if (!detectedSubjects.length) return buildInitialScheduleRows()
    if (!formValues.program || !formValues.year_level || !formValues.semester) {
      const fallbackRows = buildInitialScheduleRows()
      detectedSubjects.forEach((subject, index) => {
        const row = fallbackRows[index]
        if (!row) return
        row.mwfSubject = `${subject.code} ${subject.title}`
        row.mwfUnits = String(subject.units)
      })
      return fallbackRows
    }

    const detectedSubjectIdSet = new Set(detectedSubjects.map((subject) => subject.id))
    const exactMatches = prospectusEntries
      .filter(
        (entry) =>
          entry.program === Number(formValues.program) &&
          entry.year_level === Number(formValues.year_level) &&
          entry.semester === Number(formValues.semester) &&
          (!formValues.academic_year || entry.academic_year === formValues.academic_year) &&
          (!formValues.section || entry.section === Number(formValues.section)) &&
          detectedSubjectIdSet.has(entry.subject),
      )
      .sort((a, b) => a.id - b.id)

    const fallbackMatches = prospectusEntries
      .filter(
        (entry) =>
          entry.program === Number(formValues.program) &&
          entry.year_level === Number(formValues.year_level) &&
          entry.semester === Number(formValues.semester) &&
          detectedSubjectIdSet.has(entry.subject),
      )
      .sort((a, b) => a.id - b.id)

    const selectedEntries = exactMatches.length ? exactMatches : fallbackMatches
    if (selectedEntries.length) {
      const selectedSection = sections.find((section) => String(section.id) === formValues.section)
      return buildScheduleRowsFromProspectus(selectedEntries, subjectMap, selectedSection?.name || '')
    }

    const fallbackRows = buildInitialScheduleRows()
    detectedSubjects.forEach((subject, index) => {
      const row = fallbackRows[index]
      if (!row) return
      row.mwfSubject = `${subject.code} ${subject.title}`
      row.mwfUnits = String(subject.units)
    })
    return fallbackRows
  }

  const processEnrollmentScanFile = async (enrollmentScanFile: File) => {
    setError('')
    setSuccess('')
    setIsScanningDocuments(true)
    setScanStatus('Extracting text from Enrollment Form...')
    try {
      const tesseract = await import('tesseract.js')
      const enrollmentResult = await tesseract.recognize(enrollmentScanFile, 'eng')
      const enrollmentText = enrollmentResult.data.text || ''
      const parsedFromEnrollment = parseScannedStudentForm(enrollmentText, programs, sections)
      const projectedNextForm = mergeStudentFormUpdates(studentForm, parsedFromEnrollment)

      skipAutoScheduleRef.current = true
      setStudentForm((prev) => mergeStudentFormUpdates(prev, parsedFromEnrollment))
      if (projectedNextForm.admission_date) setApprovalDate(projectedNextForm.admission_date)

      const filledFieldCount = Object.values(parsedFromEnrollment).filter((value) => Boolean(String(value || '').trim())).length
      setSuccess(`Enrollment Form scanned. Autofilled ${filledFieldCount} field(s).`)
      setScanStep('awaiting_load_slip')
      setScanStatus('Now select the Enrollment Load Slip photo...')
      window.setTimeout(() => {
        loadSlipScanInputRef.current?.click()
      }, 200)
    } catch (scanError) {
      setError(`Unable to process Enrollment Form scan: ${getErrorMessage(scanError)}`)
      setScanStep('idle')
      setScanStatus('')
    } finally {
      setIsScanningDocuments(false)
    }
  }

  const processLoadSlipScanFile = async (loadSlipScanFile: File) => {
    setError('')
    setSuccess('')
    setIsScanningDocuments(true)
    setScanStatus('Extracting text from Enrollment Load Slip...')
    try {
      const tesseract = await import('tesseract.js')
      const loadSlipResult = await tesseract.recognize(loadSlipScanFile, 'eng')
      const loadSlipText = loadSlipResult.data.text || ''

      setScanStatus('Mapping extracted text to form fields...')
      const parsedFromLoadSlip = parseScannedStudentForm(loadSlipText, programs, sections)
      const detectedSubjects = detectSubjectsFromScannedText(loadSlipText, subjects)
      const projectedNextForm = mergeStudentFormUpdates(studentForm, parsedFromLoadSlip)

      skipAutoScheduleRef.current = true
      setStudentForm((prev) => mergeStudentFormUpdates(prev, parsedFromLoadSlip))
      if (projectedNextForm.admission_date) setApprovalDate(projectedNextForm.admission_date)

      if (detectedSubjects.length) {
        setScheduleRows(buildScheduleRowsFromDetectedSubjects(detectedSubjects, projectedNextForm))
      }

      const filledFieldCount = Object.values(parsedFromLoadSlip).filter((value) => Boolean(String(value || '').trim())).length

      setSuccess(
        `Enrollment Load Slip scanned. Autofilled ${filledFieldCount} field(s)${detectedSubjects.length ? ` and detected ${detectedSubjects.length} subject(s)` : ''}.`,
      )
      setScanStep('idle')
    } catch (scanError) {
      setError(`Unable to process Enrollment Load Slip scan: ${getErrorMessage(scanError)}`)
    } finally {
      setScanStatus('')
      setIsScanningDocuments(false)
    }
  }

  const onPickEnrollmentScan = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] || null
    event.target.value = ''
    if (!file) return
    void processEnrollmentScanFile(file)
  }

  const onPickLoadSlipScan = (event: ChangeEvent<HTMLInputElement>) => {
    const loadSlipFile = event.target.files?.[0] || null
    event.target.value = ''
    if (!loadSlipFile || scanStep !== 'awaiting_load_slip') return
    void processLoadSlipScanFile(loadSlipFile)
  }

  const startTwoDocumentScan = () => {
    if (isScanningDocuments) return
    setScanStep('idle')
    setError('')
    setSuccess('')
    setScanStatus('Select the Enrollment Form photo...')
    enrollmentScanInputRef.current?.click()
  }

  const onScheduleRowChange = (index: number, key: keyof ScheduleRow, value: string) => {
    setScheduleRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, [key]: value } : row)))
  }

  const getScheduleCellKeys = (column: ScheduleColumn) =>
    column === 'mwf'
      ? ({ subjectKey: 'mwfSubject', unitsKey: 'mwfUnits', roomKey: 'mwfRoom' } as const)
      : ({ subjectKey: 'tthSubject', unitsKey: 'tthUnits', roomKey: 'tthRoom' } as const)

  const isScheduleCellDraggable = (rowIndex: number, column: ScheduleColumn): boolean => {
    const row = scheduleRows[rowIndex]
    if (!row) return false
    if (column === 'tth' && row.tthSaturdayHeader) return false
    const { subjectKey } = getScheduleCellKeys(column)
    return Boolean(row[subjectKey]?.trim())
  }

  const onScheduleDragStart = (event: DragEvent<HTMLInputElement>, rowIndex: number, column: ScheduleColumn) => {
    if (!isScheduleCellDraggable(rowIndex, column)) {
      event.preventDefault()
      return
    }
    setDraggingCell({ rowIndex, column })
    setDropTarget(null)
    setIsTrashDropActive(false)
    event.dataTransfer.effectAllowed = 'move'
  }

  const onScheduleDragOver = (event: DragEvent<HTMLInputElement>, rowIndex: number, column: ScheduleColumn) => {
    const row = scheduleRows[rowIndex]
    if (!draggingCell || !row) return
    if (column === 'tth' && row.tthSaturdayHeader) return
    event.preventDefault()
    setDropTarget({ rowIndex, column })
    event.dataTransfer.dropEffect = 'move'
  }

  const onScheduleDrop = (event: DragEvent<HTMLInputElement>, rowIndex: number, column: ScheduleColumn) => {
    event.preventDefault()
    const row = scheduleRows[rowIndex]
    if (!draggingCell || !row) return
    if (column === 'tth' && row.tthSaturdayHeader) return

    const source = draggingCell
    setScheduleRows((current) => {
      const sourceRow = current[source.rowIndex]
      const targetRow = current[rowIndex]
      if (!sourceRow || !targetRow) return current
      if (source.rowIndex === rowIndex && source.column === column) return current
      if (column === 'tth' && targetRow.tthSaturdayHeader) return current
      if (source.column === 'tth' && sourceRow.tthSaturdayHeader) return current

      const sourceKeys = getScheduleCellKeys(source.column)
      const targetKeys = getScheduleCellKeys(column)
      const sourceSubject = sourceRow[sourceKeys.subjectKey]
      const sourceUnits = sourceRow[sourceKeys.unitsKey]
      const sourceRoom = sourceRow[sourceKeys.roomKey]
      const targetSubject = targetRow[targetKeys.subjectKey]
      const targetUnits = targetRow[targetKeys.unitsKey]
      const targetRoom = targetRow[targetKeys.roomKey]

      // Same-row drag (MWF <-> TTH) must update both columns in one object;
      // otherwise one side can be overwritten and appear to "disappear".
      if (source.rowIndex === rowIndex) {
        return current.map((rowItem, idx) => {
          if (idx !== rowIndex) return rowItem
          return {
            ...rowItem,
            [sourceKeys.subjectKey]: targetSubject,
            [sourceKeys.unitsKey]: targetUnits,
            [sourceKeys.roomKey]: targetRoom,
            [targetKeys.subjectKey]: sourceSubject,
            [targetKeys.unitsKey]: sourceUnits,
            [targetKeys.roomKey]: sourceRoom,
          }
        })
      }

      return current.map((rowItem, idx) => {
        if (idx === source.rowIndex) {
          return {
            ...rowItem,
            [sourceKeys.subjectKey]: targetSubject,
            [sourceKeys.unitsKey]: targetUnits,
            [sourceKeys.roomKey]: targetRoom,
          }
        }
        if (idx === rowIndex) {
          return {
            ...rowItem,
            [targetKeys.subjectKey]: sourceSubject,
            [targetKeys.unitsKey]: sourceUnits,
            [targetKeys.roomKey]: sourceRoom,
          }
        }
        return rowItem
      })
    })

    setDraggingCell(null)
    setDropTarget(null)
    setIsTrashDropActive(false)
  }

  const onScheduleDragEnd = () => {
    setDraggingCell(null)
    setDropTarget(null)
    setIsTrashDropActive(false)
  }

  const onScheduleTrashDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!draggingCell) return
    event.preventDefault()
    setDropTarget(null)
    setIsTrashDropActive(true)
    event.dataTransfer.dropEffect = 'move'
  }

  const onScheduleTrashDragLeave = () => {
    setIsTrashDropActive(false)
  }

  const onScheduleTrashDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (!draggingCell) return
    const source = draggingCell
    setScheduleRows((current) => {
      const sourceRow = current[source.rowIndex]
      if (!sourceRow) return current
      if (source.column === 'tth' && sourceRow.tthSaturdayHeader) return current
      const sourceKeys = getScheduleCellKeys(source.column)
      return current.map((rowItem, idx) => {
        if (idx !== source.rowIndex) return rowItem
        return {
          ...rowItem,
          [sourceKeys.subjectKey]: '',
          [sourceKeys.unitsKey]: '',
          [sourceKeys.roomKey]: '',
        }
      })
    })
    setDraggingCell(null)
    setDropTarget(null)
    setIsTrashDropActive(false)
  }

  const enrollmentDisplayScheduleRows = useMemo<EnrollmentDisplayScheduleRow[]>(() => {
    const saturdayHeaderIndex = scheduleRows.findIndex((row) => row.tthSaturdayHeader)
    const rows: EnrollmentDisplayScheduleRow[] = []

    scheduleRows.forEach((row, rowIndex) => {
      if (hasSpecificSubject(row.mwfSubject)) {
        rows.push({
          rowIndex,
          column: 'mwf',
          dayLabel: 'MWF',
          time: row.mwfTime,
          subject: row.mwfSubject,
          units: row.mwfUnits,
          room: row.mwfRoom,
        })
      }
      if (!row.tthSaturdayHeader && hasSpecificSubject(row.tthSubject)) {
        rows.push({
          rowIndex,
          column: 'tth',
          dayLabel: rowIndex > saturdayHeaderIndex ? 'SATURDAY' : 'TTH',
          time: row.tthTime,
          subject: row.tthSubject,
          units: row.tthUnits,
          room: row.tthRoom,
        })
      }
    })

    const dayOrder: Record<EnrollmentDisplayScheduleRow['dayLabel'], number> = {
      MWF: 0,
      TTH: 1,
      SATURDAY: 2,
    }

    return rows.sort((a, b) => {
      const dayDiff = dayOrder[a.dayLabel] - dayOrder[b.dayLabel]
      if (dayDiff !== 0) return dayDiff
      return a.rowIndex - b.rowIndex
    })
  }, [scheduleRows])

  const onDisplayScheduleRowChange = (
    row: EnrollmentDisplayScheduleRow,
    field: 'subject' | 'units' | 'room',
    value: string,
  ) => {
    const key =
      row.column === 'mwf'
        ? field === 'subject'
          ? 'mwfSubject'
          : field === 'units'
            ? 'mwfUnits'
            : 'mwfRoom'
        : field === 'subject'
          ? 'tthSubject'
          : field === 'units'
            ? 'tthUnits'
            : 'tthRoom'

    setScheduleRows((current) =>
      current.map((item, index) => (index === row.rowIndex ? { ...item, [key]: value } : item)),
    )
  }

  const subjectMap = useMemo(() => {
    const map = new Map<number, Subject>()
    subjects.forEach((subject) => map.set(subject.id, subject))
    return map
  }, [subjects])

  useEffect(() => {
    if (skipAutoScheduleRef.current) {
      skipAutoScheduleRef.current = false
      return
    }
    const { program, year_level, semester, academic_year, section } = studentForm
    if (!program || !year_level || !semester || !academic_year || !section) {
      setScheduleRows(buildInitialScheduleRows())
      return
    }

    const exactMatched = prospectusEntries
      .filter(
        (entry) =>
          entry.program === Number(program) &&
          entry.year_level === Number(year_level) &&
          entry.semester === Number(semester) &&
          entry.academic_year === academic_year &&
          entry.section === Number(section),
      )
      .sort((a, b) => a.id - b.id)
    const matched =
      exactMatched.length > 0
        ? exactMatched
        : prospectusEntries
            .filter(
              (entry) =>
                entry.program === Number(program) &&
                entry.year_level === Number(year_level) &&
                entry.semester === Number(semester) &&
                entry.academic_year === '' &&
                entry.section === null,
            )
            .sort((a, b) => a.id - b.id)

    const selectedSection = sections.find((item) => item.id === Number(section))
    const sectionLabel = selectedSection?.name || ''
    setScheduleRows(buildScheduleRowsFromProspectus(matched, subjectMap, sectionLabel))
  }, [studentForm.program, studentForm.year_level, studentForm.semester, studentForm.academic_year, studentForm.section, prospectusEntries, sections, subjectMap])

  const closeEnrollModal = () => {
    const baseForm = buildInitialStudentForm()
    setIsEnrollModalOpen(false)
    setEditingStudentId(null)
    setScanStep('idle')
    setScanStatus('')
    setDraggingCell(null)
    setDropTarget(null)
    setApprovalDate(baseForm.admission_date)
    setStudentForm({
      ...baseForm,
      program: defaultProgramId,
      adviser_name: defaultProgram?.program_adviser || '',
      dean_name: defaultProgram?.school_dean || '',
    })
    setScheduleRows(buildInitialScheduleRows())
  }

  const openEditStudent = async (studentId: string) => {
    setError('')
    setSuccess('')
    try {
      const response = await api.get<StudentDetail>(`/students/${studentId}/`)
      const data = response.data
      const combinedTrackStrand = (data.senior_high_track_strand || '').trim()
      const [fallbackTrack, ...fallbackStrandParts] = combinedTrackStrand
        ? combinedTrackStrand.split('/').map((part) => part.trim())
        : ['', '']
      const fallbackStrand = fallbackStrandParts.join(' / ')

      skipAutoScheduleRef.current = true
      setEditingStudentId(data.student_id)
      setApprovalDate(
        data.admission_date || data.adviser_approval_date || data.dean_approval_date || new Date().toISOString().split('T')[0],
      )
      setStudentForm({
        student_id: data.student_id || '',
        last_name: data.last_name || '',
        first_name: data.first_name || '',
        middle_name: data.middle_name || '',
        extension_name: data.extension_name || '',
        gender: data.gender || '',
        date_of_birth: data.date_of_birth || '',
        civil_status: data.civil_status || '',
        nationality: data.nationality || '',
        admission_date: data.admission_date || '',
        scholarship: data.scholarship || '',
        program: data.program ? String(data.program) : '',
        section: data.section ? String(data.section) : '',
        year_level: data.year_level ? String(data.year_level) : '1',
        academic_year: data.academic_year || '',
        semester: data.semester ? String(data.semester) : '',
        home_address: data.home_address || '',
        postal_code: data.postal_code || '',
        email_address: data.email_address || '',
        contact_number: data.contact_number || '',
        mother_maiden_name: data.mother_maiden_name || '',
        mother_contact_number: data.mother_contact_number || '',
        father_name: data.father_name || '',
        father_contact_number: data.father_contact_number || '',
        elementary_school: data.elementary_school || '',
        junior_high_school: data.junior_high_school || '',
        senior_high_school: data.senior_high_school || '',
        senior_high_track: (data.senior_high_track || fallbackTrack || '').toUpperCase(),
        senior_high_strand: (data.senior_high_strand || fallbackStrand || '').toUpperCase(),
        senior_high_track_strand: data.senior_high_track_strand || '',
        subject_load_schedule: data.subject_load_schedule || '',
        adviser_name: data.adviser_name || '',
        adviser_approval_status: data.adviser_approval_status || 'approved',
        dean_name: data.dean_name || '',
        dean_approval_status: data.dean_approval_status || 'approved',
      })
      setScheduleRows(buildScheduleRowsFromSavedText(data.subject_load_schedule || ''))
      setIsEnrollModalOpen(true)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const requestDeleteStudent = (studentId: string) => {
    setDeleteStudentId(studentId)
    setIsDeleteConfirmOpen(true)
  }

  const closeDeleteConfirm = () => {
    if (isDeletingStudent) return
    setIsDeleteConfirmOpen(false)
    setDeleteStudentId(null)
  }

  const handleDeleteStudent = async () => {
    if (!deleteStudentId) return

    setError('')
    setSuccess('')
    setIsDeletingStudent(true)
    try {
      await api.delete(`/students/${deleteStudentId}/`)
      if (student?.student_id === deleteStudentId) setStudent(null)
      if (viewStudent?.student_id === deleteStudentId) {
        setViewStudent(null)
        setIsViewModalOpen(false)
      }
      if (searchId === deleteStudentId) setSearchId('')
      await loadEnrolledStudents()
      setSuccess(`Student ${deleteStudentId} deleted from active records.`)
      setIsDeleteConfirmOpen(false)
      setDeleteStudentId(null)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsDeletingStudent(false)
    }
  }

  const createStudent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setSuccess('')
    setWarning('')

    try {
      const scheduleText = buildScheduleTextFromRows(scheduleRows)
      const combinedTrackStrand = [studentForm.senior_high_track, studentForm.senior_high_strand]
        .map((value) => value.trim())
        .filter(Boolean)
        .join(' / ')
      const studentPayload = {
        student_id: studentForm.student_id,
        last_name: studentForm.last_name,
        first_name: studentForm.first_name,
        middle_name: studentForm.middle_name,
        extension_name: studentForm.extension_name,
        gender: studentForm.gender,
        date_of_birth: studentForm.date_of_birth || null,
        age: computedAge,
        civil_status: studentForm.civil_status,
        nationality: studentForm.nationality,
        admission_date: studentForm.admission_date || null,
        scholarship: studentForm.scholarship || DEFAULT_SCHOLARSHIP_LABEL,
        program: Number(studentForm.program),
        section: nullableNumber(studentForm.section),
        year_level: Number(studentForm.year_level),
        academic_year: studentForm.academic_year,
        semester: nullableNumber(studentForm.semester),
        home_address: studentForm.home_address,
        postal_code: studentForm.postal_code,
        email_address: studentForm.email_address,
        contact_number: studentForm.contact_number,
        mother_maiden_name: studentForm.mother_maiden_name,
        mother_contact_number: studentForm.mother_contact_number,
        father_name: studentForm.father_name,
        father_contact_number: studentForm.father_contact_number,
        elementary_school: studentForm.elementary_school,
        junior_high_school: studentForm.junior_high_school,
        senior_high_school: studentForm.senior_high_school,
        senior_high_track: studentForm.senior_high_track,
        senior_high_strand: studentForm.senior_high_strand,
        senior_high_track_strand: combinedTrackStrand,
        subject_load_schedule: scheduleText,
        adviser_name: studentForm.adviser_name,
        adviser_approval_status: studentForm.adviser_approval_status,
        adviser_approval_date: approvalDate || null,
        dean_name: studentForm.dean_name,
        dean_approval_status: studentForm.dean_approval_status,
        dean_approval_date: approvalDate || null,
      }

      if (editingStudentId) {
        await api.patch(`/students/${editingStudentId}/`, studentPayload)
        await refreshStudent(studentForm.student_id)
        await loadEnrolledStudents()
        if (shouldCloseOnSaveEnrollment) closeEnrollModal()
        setSuccess('Student information updated successfully.')
        return
      }

      await api.post('/students/', studentPayload)

      // Create AcademicHistory record for 1st Year - 1st Semester
      try {
        const studentResponse = await api.get(`/students/${studentForm.student_id}/`)
        const createdStudent = studentResponse.data
        
        await api.post('/academic-history/', {
          student: createdStudent.id,
          academic_year: studentForm.academic_year,
          year_level: 1,  // Always 1st Year for new enrollment
          semester: 1,    // Always 1st Semester for new enrollment
          program: Number(studentForm.program),
          section: nullableNumber(studentForm.section),
          
          // Personal Information (snapshot)
          first_name: studentForm.first_name,
          last_name: studentForm.last_name,
          middle_name: studentForm.middle_name,
          extension_name: studentForm.extension_name,
          gender: studentForm.gender,
          date_of_birth: studentForm.date_of_birth || null,
          age: computedAge,
          civil_status: studentForm.civil_status,
          nationality: studentForm.nationality,
          admission_date: studentForm.admission_date || null,
          scholarship: studentForm.scholarship || DEFAULT_SCHOLARSHIP_LABEL,
          course: '',  // Will be populated from program if needed
          
          // Contact Information (snapshot)
          home_address: studentForm.home_address,
          postal_code: studentForm.postal_code,
          email_address: studentForm.email_address,
          contact_number: studentForm.contact_number,
          
          // Family Information (snapshot)
          mother_maiden_name: studentForm.mother_maiden_name,
          mother_contact_number: studentForm.mother_contact_number,
          father_name: studentForm.father_name,
          father_contact_number: studentForm.father_contact_number,
          
          // Educational Background (snapshot)
          elementary_school: studentForm.elementary_school,
          junior_high_school: studentForm.junior_high_school,
          senior_high_school: studentForm.senior_high_school,
          senior_high_track: studentForm.senior_high_track,
          senior_high_strand: studentForm.senior_high_strand,
          senior_high_track_strand: combinedTrackStrand,
          
          // Academic Information for this Semester
          subject_load_schedule: scheduleText,
          adviser_name: studentForm.adviser_name,
          adviser_approval_status: studentForm.adviser_approval_status,
          adviser_approval_date: approvalDate || null,
          dean_name: studentForm.dean_name,
          dean_approval_status: studentForm.dean_approval_status,
          dean_approval_date: approvalDate || null,
          
          // Status and Dates
          status: 'ongoing',
          start_date: new Date().toISOString().split('T')[0],  // Today's date
          end_date: null,
        })
      } catch (historyErr) {
        // If academic-history endpoint doesn't exist, warn but continue.
        console.warn('AcademicHistory endpoint not implemented yet, proceeding with enrollment only')
        setWarning('Student was enrolled, but academic history was not saved.')
      }

      setSearchId(studentForm.student_id)
      await refreshStudent(studentForm.student_id)
      await loadEnrolledStudents()
      setSuccess('Student successfully registered/enrolled.')
      if (shouldCloseOnSaveEnrollment) {
        closeEnrollModal()
      } else {
        const baseForm = buildInitialStudentForm()
        setEditingStudentId(null)
        setStudentForm((prev) => ({
          ...baseForm,
          program: prev.program,
          adviser_name: prev.adviser_name,
          dean_name: prev.dean_name,
        }))
        setApprovalDate(baseForm.admission_date)
        setScheduleRows(buildInitialScheduleRows())
      }
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const saveLoad = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setSuccess('')
    if (!student) {
      setError('Search for a student first.')
      return
    }

    try {
      await api.post('/student-loads/', {
        student: student.id,
        term: Number(selectedTerm),
        subject: Number(selectedSubject),
        status: statusValue,
      })
      await refreshStudent(student.student_id)
      setSuccess('Student load saved.')
      setSelectedSubject('')
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const previewAutoLoad = async () => {
    if (!student) {
      setError('Search for a student first.')
      return
    }
    if (!selectedTerm) {
      setError('Select term for preview.')
      return
    }

    setError('')
    setSuccess('')
    try {
      const response = await api.get<PreviewResponse>(`/students/${student.student_id}/auto-load-preview/`, {
        params: { term_id: Number(selectedTerm) },
      })
      setPreviewSubjects(response.data.subjects)
      setSuccess(`Preview loaded ${response.data.subjects.length} subjects.`)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const triggerAutoLoad = async () => {
    if (!student) {
      setError('Search for a student first.')
      return
    }
    if (!selectedTerm) {
      setError('Select term for auto-load.')
      return
    }

    setError('')
    setSuccess('')
    try {
      const response = await api.post<{ created_load_rows: number }>(`/students/${student.student_id}/auto-load/`, {
        term_id: Number(selectedTerm),
      })
      await refreshStudent(student.student_id)
      setSuccess(`Auto-load created ${response.data.created_load_rows} load rows.`)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const hasRequiredSectionFilters = Boolean(
    studentForm.program && studentForm.year_level && studentForm.academic_year && studentForm.semester,
  )
  const hasMatchingAcademicTerm = terms.some(
    (term) => term.year_label === studentForm.academic_year && String(term.semester) === studentForm.semester,
  )
  const prospectusSectionIds = new Set(
    prospectusEntries
      .filter(
        (entry) =>
          entry.program === Number(studentForm.program) &&
          entry.year_level === Number(studentForm.year_level) &&
          entry.semester === Number(studentForm.semester) &&
          entry.academic_year === studentForm.academic_year &&
          entry.section !== null,
      )
      .map((entry) => entry.section as number),
  )
  const filteredSections =
    hasRequiredSectionFilters && hasMatchingAcademicTerm
      ? sections.filter(
          (s) =>
            s.program === Number(studentForm.program) &&
            s.year_level === Number(studentForm.year_level) &&
            s.semester === Number(studentForm.semester) &&
            prospectusSectionIds.has(s.id),
        )
      : []
  const selectedSectionOption = studentForm.section
    ? sections.find((section) => String(section.id) === studentForm.section) ?? null
    : null
  const availableSections = selectedSectionOption && !filteredSections.some((section) => section.id === selectedSectionOption.id)
    ? [selectedSectionOption, ...filteredSections]
    : filteredSections
  const sectionPlaceholder = !hasRequiredSectionFilters
    ? 'Select Program, Year Level, Academic Year, and Semester first'
    : !hasMatchingAcademicTerm
      ? 'No matching academic term for selected year/semester'
      : availableSections.length
        ? 'Section'
      : 'No sections with prospectus schedule available'
  const shouldShowScheduleTime = Boolean(
    studentForm.program &&
    studentForm.year_level &&
    studentForm.academic_year &&
    studentForm.semester &&
    studentForm.section &&
    hasMatchingAcademicTerm,
  )

  useEffect(() => {
    setStudentForm((prev) => {
      if (!prev.section) return prev
      const isStillValid =
        hasRequiredSectionFilters &&
        hasMatchingAcademicTerm &&
        availableSections.some((section) => String(section.id) === prev.section)
      if (isStillValid) return prev
      return { ...prev, section: '' }
    })
  }, [
    studentForm.program,
    studentForm.year_level,
    studentForm.academic_year,
    studentForm.semester,
    hasRequiredSectionFilters,
    hasMatchingAcademicTerm,
    availableSections,
  ])

  const currentSemesterLoads = useMemo(() => {
    if (!student || !student.academic_year || !student.semester) return [] as StudentLoad[]
    const currentTermLabel = `${student.academic_year} - Sem ${student.semester}`
    return student.loads.filter((load) => load.term_label === currentTermLabel && load.status === 'enrolled')
  }, [student])

  const viewCurrentSemesterLoads = useMemo(() => {
    if (!viewStudent || !viewStudent.academic_year || !viewStudent.semester) return [] as StudentLoad[]
    const currentTermLabel = `${viewStudent.academic_year} - Sem ${viewStudent.semester}`
    return viewStudent.loads.filter((load) => load.term_label === currentTermLabel && load.status === 'enrolled')
  }, [viewStudent])

  const viewSlipRows = useMemo(() => {
    if (!viewStudent?.subject_load_schedule) return [] as Array<{
      code: string
      courseTitle: string
      section: string
      units: string
      schedule: string
      room: string
    }>

    const rowMap = new Map<string, {
      code: string
      courseTitle: string
      section: string
      units: string
      schedule: string[]
      room: string
    }>()
    const sectionLabel = viewStudent ? (sections.find((s) => s.id === viewStudent.section)?.name || '-') : '-'
    const matchingEntriesExact = prospectusEntries.filter(
      (entry) =>
        viewStudent &&
        entry.program === viewStudent.program &&
        entry.year_level === viewStudent.year_level &&
        entry.semester === (viewStudent.semester || 0) &&
        entry.academic_year === (viewStudent.academic_year || '') &&
        entry.section === (viewStudent.section ?? null),
    )
    const matchingEntriesFallback = prospectusEntries.filter(
      (entry) =>
        viewStudent &&
        entry.program === viewStudent.program &&
        entry.year_level === viewStudent.year_level &&
        entry.semester === (viewStudent.semester || 0) &&
        entry.academic_year === '' &&
        entry.section === null,
    )
    const resolvedEntryPool = matchingEntriesExact.length ? matchingEntriesExact : matchingEntriesFallback
    const resolveRoomByCode = (code: string): string => {
      const matchedSubject = subjects.find((subject) => subject.code === code)
      if (!matchedSubject) return '-'
      const matchedEntry = resolvedEntryPool.find((entry) => entry.subject === matchedSubject.id)
      return matchedEntry?.room || '-'
    }
    let inSaturdayBlock = false
    const parseScheduleSide = (rawSide: string) => {
      const unitsMatch = rawSide.match(/\(([^()]*)\)\s*$/)
      const units = unitsMatch ? unitsMatch[1].trim() : '-'
      const withoutUnits =
        unitsMatch && unitsMatch.index !== undefined
          ? rawSide.slice(0, unitsMatch.index).trim()
          : rawSide.trim()
      const separatorIndex = withoutUnits.indexOf(': ')
      if (separatorIndex < 0) {
        return { time: '-', subject: withoutUnits.trim(), units }
      }
      const time = withoutUnits.slice(0, separatorIndex).trim()
      const subject = withoutUnits.slice(separatorIndex + 2).trim()
      return { time, subject, units }
    }

    const toSubjectParts = (rawSubject: string) => {
      const subjectText = rawSubject.trim()
      if (!subjectText) {
        return { code: '-', courseTitle: '-', keyText: '', room: '-' }
      }
      const normalizedSubject = subjectText
        .replace(/^\d{1,2}:\d{2}(?:-\d{1,2}:\d{2}(?:\s?(?:AM|PM))?)?:\s*/i, '')
        .replace(/\s*-\s*[A-Za-z0-9]+$/, '')
        .trim()

      let matched = subjects
        .filter((subject) => normalizedSubject.startsWith(`${subject.code} `) || normalizedSubject === subject.code)
        .sort((a, b) => b.code.length - a.code.length)[0]

      if (matched) {
        return {
          code: matched.code,
          courseTitle: matched.title,
          keyText: `${matched.code}|${matched.title}`,
          room: resolveRoomByCode(matched.code),
        }
      }

      const fallbackTokens = normalizedSubject.split(/\s+/)
      const fallbackCode = fallbackTokens.slice(0, 2).join(' ') || '-'
      const fallbackTitle = fallbackTokens.slice(2).join(' ') || normalizedSubject
      return {
        code: fallbackCode,
        courseTitle: fallbackTitle,
        keyText: `${fallbackCode}|${fallbackTitle}`,
        room: resolveRoomByCode(fallbackCode),
      }
    }

    const upsertScheduleRow = (dayLabel: 'MWF' | 'TTH' | 'SATURDAY', time: string, subjectRaw: string, unitsRaw: string) => {
      const subjectText = subjectRaw.trim()
      if (!hasSpecificSubject(subjectText)) return

      const { code, courseTitle, keyText, room } = toSubjectParts(subjectText)
      if (!keyText) return

      const key = `${keyText}|${unitsRaw.trim()}`
      const scheduleLabel = `${dayLabel} ${time.trim()}`
      const existing = rowMap.get(key)
      if (existing) {
        if (!existing.schedule.includes(scheduleLabel)) {
          existing.schedule.push(scheduleLabel)
        }
        return
      }

      rowMap.set(key, {
        code,
        courseTitle,
        section: sectionLabel,
        units: unitsRaw.trim() || '-',
        schedule: [scheduleLabel],
        room,
      })
    }

    viewStudent.subject_load_schedule
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        const normalizedLine = line.replace(/\s+/g, ' ').trim()
        const mwfPrefixMatch = normalizedLine.match(/^MWF\s+/i)
        if (!mwfPrefixMatch) return
        const splitMatch = normalizedLine.match(/\s\|\sTTH\s/i)
        if (!splitMatch || splitMatch.index === undefined) {
          const mwfOnlyRaw = normalizedLine.replace(/^MWF\s+/i, '')
          const mwfOnly = parseScheduleSide(mwfOnlyRaw)
          if (mwfOnly) {
            upsertScheduleRow('MWF', mwfOnly.time, mwfOnly.subject, mwfOnly.units)
          }
          return
        }

        const splitIndex = splitMatch.index
        const splitTokenLength = splitMatch[0].length
        const mwfSideRaw = normalizedLine.slice(mwfPrefixMatch[0].length, splitIndex).trim()
        const tthSideRaw = normalizedLine.slice(splitIndex + splitTokenLength).trim()
        const mwfSide = parseScheduleSide(mwfSideRaw)
        const tthSide = parseScheduleSide(tthSideRaw)
        if (!mwfSide) return

        upsertScheduleRow('MWF', mwfSide.time, mwfSide.subject, mwfSide.units)
        if (!tthSide) return

        const tthTime = tthSide.time.trim()
        const tthSubject = tthSide.subject.trim()
        if (tthTime.toUpperCase() === 'TIME' && tthSubject.toUpperCase() === 'SATURDAY') {
          inSaturdayBlock = true
          return
        }

        const tthDayLabel: 'TTH' | 'SATURDAY' = inSaturdayBlock ? 'SATURDAY' : 'TTH'
        upsertScheduleRow(tthDayLabel, tthSide.time, tthSide.subject, tthSide.units)
      })

    return Array.from(rowMap.values()).map((row) => ({
      code: row.code,
      courseTitle: row.courseTitle,
      section: row.section,
      units: row.units,
      schedule: row.schedule.join(', '),
      room: row.room,
    }))
  }, [viewStudent, sections, subjects, prospectusEntries])

  const viewTotalUnits = useMemo(() => {
    return viewSlipRows.reduce((total, row) => {
      const units = Number(row.units)
      return total + (Number.isFinite(units) ? units : 0)
    }, 0)
  }, [viewSlipRows])

  const viewProgram = useMemo(
    () => (viewStudent ? programs.find((program) => program.id === viewStudent.program) : null),
    [viewStudent, programs],
  )

  const viewDepartment = useMemo(
    () => (viewProgram ? departments.find((department) => department.id === viewProgram.department) : null),
    [viewProgram, departments],
  )
  const printedByUser = resolvePrintedByUser()
  const getLoadSlipValueClassName = (value: string | number | null | undefined) => {
    const text = String(value ?? '').trim()
    return text.length > 40 ? 'load-slip-grid-value load-slip-grid-value--compact' : 'load-slip-grid-value'
  }
  const getLoadSlipCellClassName = (value: string | number | null | undefined) => {
    const text = String(value ?? '').trim()
    return text.length > 40 ? 'load-slip-grid-cell load-slip-grid-cell--wide' : 'load-slip-grid-cell'
  }

  const renderLoadSlip = (copyLabel: string) => (
    <div className="load-slip">
      <img className="load-slip-watermark" src="/Picture2.png" alt="" aria-hidden="true" />
      <div className="load-slip-header">
        <div className="load-slip-header-row">
          <div className="load-slip-header-tag">ENROLLMENT LOAD SLIP</div>
          <div className="load-slip-header-main">
            <div className="load-slip-top-logos load-slip-top-logos-left" aria-hidden="true">
              <img src="/Picture2.png" alt="" />
            </div>
            <div className="load-slip-header-center">
              <div className="load-slip-campus">CITY COLLEGE OF BAYAWAN</div>
              <div className="load-slip-contact-line">Government Center, Cabcabon, Banga, Bayawan City</div>
              <div className="load-slip-contact-line">Negros Oriental (035) 430-0263 local 1120</div>
              <div className="load-slip-contact-line load-slip-email">citycollegeofbayawan@gmail.com</div>
              <div className="load-slip-office">OFFICE OF THE COLLEGE REGISTRAR</div>
            </div>
            <div className="load-slip-top-logos load-slip-top-logos-right" aria-hidden="true">
              <img src="/ccb_registrar_logo.png" alt="" />
            </div>
          </div>
        </div>
      </div>

      <div className="load-slip-section-title">Student General Information</div>
      <div className="load-slip-grid">
        <div className={getLoadSlipCellClassName(viewStudent?.student_id)}>
          <span>Student ID Number:</span>{' '}
          <span className="load-slip-student-id-value">{viewStudent?.student_id || '-'}</span>
        </div>
        <div className={getLoadSlipCellClassName(viewDepartment?.name)}><span>Department:</span> <span className={getLoadSlipValueClassName(viewDepartment?.name)}>{viewDepartment?.name || '-'}</span></div>
        <div className={getLoadSlipCellClassName(viewStudent?.academic_year)}><span>School Year:</span> <span className={getLoadSlipValueClassName(viewStudent?.academic_year)}>{viewStudent?.academic_year || '-'}</span></div>
        <div className={getLoadSlipCellClassName(viewStudent ? formatStudentNameForSlip(viewStudent.last_name, viewStudent.first_name, viewStudent.middle_name, isPrintingLoadSlip) : '-')}><span>Name:</span> <span className={getLoadSlipValueClassName(viewStudent ? formatStudentNameForSlip(viewStudent.last_name, viewStudent.first_name, viewStudent.middle_name, isPrintingLoadSlip) : '-')}>{viewStudent ? formatStudentNameForSlip(viewStudent.last_name, viewStudent.first_name, viewStudent.middle_name, isPrintingLoadSlip) : '-'}</span></div>
        <div className={getLoadSlipCellClassName(viewProgram?.name)}><span>Program:</span> <span className={getLoadSlipValueClassName(viewProgram?.name)}>{viewProgram?.name || '-'}</span></div>
        <div className={getLoadSlipCellClassName(viewStudent?.semester)}><span>Semester:</span> <span className={getLoadSlipValueClassName(viewStudent?.semester)}>{viewStudent?.semester || '-'}</span></div>
        <div className={getLoadSlipCellClassName(formatDateValue(viewDateOfBirth))}><span>Date of Birth:</span> <span className={getLoadSlipValueClassName(formatDateValue(viewDateOfBirth))}>{formatDateValue(viewDateOfBirth)}</span></div>
        <div className={getLoadSlipCellClassName(viewStudent?.year_level)}><span>Year Level:</span> <span className={getLoadSlipValueClassName(viewStudent?.year_level)}>{viewStudent?.year_level || '-'}</span></div>
        <div className={getLoadSlipCellClassName(viewScholarship)}><span>Scholarship:</span> <span className={getLoadSlipValueClassName(viewScholarship)}>{viewScholarship || '-'}</span></div>
        <div className={getLoadSlipCellClassName(viewStudent?.gender)}><span>Gender:</span> <span className={getLoadSlipValueClassName(viewStudent?.gender)}>{viewStudent?.gender || '-'}</span></div>
        <div className={getLoadSlipCellClassName(viewStudent ? (sections.find((s) => s.id === viewStudent.section)?.name || '-') : '-')}><span>Section:</span> <span className={getLoadSlipValueClassName(viewStudent ? (sections.find((s) => s.id === viewStudent.section)?.name || '-') : '-')}>{viewStudent ? (sections.find((s) => s.id === viewStudent.section)?.name || '-') : '-'}</span></div>
        <div className={getLoadSlipCellClassName(viewStatus)}><span>Status:</span> <span className={getLoadSlipValueClassName(viewStatus)}>{viewStatus}</span></div>
      </div>

      <div className="table-wrap load-slip-table-wrap">
        <table className="load-slip-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Course Title</th>
              <th>Section</th>
              <th>Units</th>
              <th>Schedule</th>
              <th>Room</th>
            </tr>
          </thead>
          <tbody>
            {viewSlipRows.map((row, index) => {
              return (
                <tr key={`${copyLabel}-${row.code}-${index}`}>
                  <td><span className="load-slip-table-value">{row.code}</span></td>
                  <td><span className="load-slip-table-value">{row.courseTitle}</span></td>
                  <td><span className="load-slip-table-value">{row.section}</span></td>
                  <td><span className="load-slip-table-value">{formatUnitsForView(row.units)}</span></td>
                  <td><span className="load-slip-table-value">{row.schedule}</span></td>
                  <td><span className="load-slip-table-value">{row.room}</span></td>
                </tr>
              )
            })}
            {!viewSlipRows.length && (
              <tr>
                <td colSpan={6}>No subject load schedule found for this student.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="load-slip-summary">
        <div><span>Total Subjects:</span> {viewSlipRows.length}</div>
        <div><span>Total Units:</span> {viewTotalUnits}</div>
        <div><span>Date Enrolled:</span> {viewStudent?.admission_date || '-'}</div>
      </div>

      <div className="load-slip-footer">
        <div className="load-slip-sign-area">
          <div className="load-slip-sign-line" />
          <div>Student or Parent/Guardian</div>
        </div>
        <div className="load-slip-sign-meta">
          <div><span>Stamped by:</span> ____________________</div>
          <div className="load-slip-prepared-label"><span>Prepared by:</span></div>
          <div className="load-slip-prepared-name">{PREPARED_BY_NAME}</div>
          <div className="load-slip-prepared-title">{PREPARED_BY_TITLE}</div>
        </div>
      </div>
      <div className="load-slip-copy-footer">
        <div className="load-slip-copy-tag">{copyLabel}</div>
        <div className="load-slip-copy-printed-by"><span>Printed by:</span> {printedByUser}</div>
      </div>
    </div>
  )

  const printLoadSlip = () => {
    const styleId = 'load-slip-legal-print-style'
    document.getElementById(styleId)?.remove()
    const style = document.createElement('style')
    style.id = styleId
    style.textContent = '@media print { @page { size: 8.5in 13in; margin: 0.2in; } }'
    document.head.appendChild(style)
    setIsPrintingLoadSlip(true)
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        window.print()
        window.setTimeout(() => setIsPrintingLoadSlip(false), 500)
      })
    })
  }

  const groupedEnrolledStudents = useMemo(() => {
    type GroupedNode = {
      key: string
      programName: string
      academicYear: string
      yearLevel: number
      semester: number | null
      sectionName: string
      students: EnrolledStudent[]
      totalStudents: number
    }
    const groupMap = new Map<string, EnrolledStudent[]>()
    const groupMeta = new Map<
      string,
      { programName: string; academicYear: string; yearLevel: number; semester: number | null; sectionName: string }
    >()
    enrolledStudents.forEach((student) => {
      const programName = programs.find((p) => p.id === student.program)?.name || 'Unknown Program'
      const academicYear = student.academic_year || '-'
      const yearLevel = Number(student.year_level || 0)
      const semester = student.semester ?? null
      const sectionName = sections.find((s) => s.id === student.section)?.name || 'Unassigned'
      const groupKey = `${programName}|${academicYear}|${yearLevel}|${sectionName}|${semester ?? 'none'}`
      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, [])
        groupMeta.set(groupKey, { programName, academicYear, yearLevel, semester, sectionName })
      }
      groupMap.get(groupKey)!.push(student)
    })
    const sortSemester = (sem: number | null) => (sem === null ? 99 : sem)
    const grouped: GroupedNode[] = Array.from(groupMap.entries()).map(([key, studentsInGroup]) => {
      const meta = groupMeta.get(key)!
      const students = studentsInGroup.sort((a, b) => {
        const lastNameCompare = (a.last_name || '').localeCompare(b.last_name || '')
        if (lastNameCompare !== 0) return lastNameCompare
        const firstNameCompare = (a.first_name || '').localeCompare(b.first_name || '')
        if (firstNameCompare !== 0) return firstNameCompare
        const middleNameCompare = (a.middle_name || '').localeCompare(b.middle_name || '')
        if (middleNameCompare !== 0) return middleNameCompare
        return a.student_id.localeCompare(b.student_id)
      })
      return { key, ...meta, students, totalStudents: students.length }
    })
    return grouped.sort((a, b) => {
      const programCompare = a.programName.localeCompare(b.programName)
      if (programCompare !== 0) return programCompare
      const yearCompare = b.academicYear.localeCompare(a.academicYear)
      if (yearCompare !== 0) return yearCompare
      const levelCompare = a.yearLevel - b.yearLevel
      if (levelCompare !== 0) return levelCompare
      const sectionCompare = a.sectionName.localeCompare(b.sectionName)
      if (sectionCompare !== 0) return sectionCompare
      return sortSemester(a.semester) - sortSemester(b.semester)
    })
  }, [enrolledStudents, programs, sections])

  const searchStudentInFolder = async (event: FormEvent<HTMLFormElement>, groupKey: string, groupStudents: EnrolledStudent[]) => {
    event.preventDefault()
    setError('')
    const searchValue = (folderSearchQueries[groupKey] || '').trim()
    if (!searchValue) {
      setError('Enter a Student ID or name to search.')
      return
    }
    const normalized = searchValue.toLowerCase()
    const matchedStudent = groupStudents.find((s) => {
      if (s.student_id.toLowerCase().includes(normalized)) return true
      const fullName = `${s.last_name}, ${s.first_name} ${s.middle_name || ''}`.toLowerCase()
      if (fullName.includes(normalized)) return true
      const parts = `${s.last_name} ${s.first_name} ${s.middle_name || ''}`.toLowerCase().split(/\s+/)
      return parts.some((p) => p.startsWith(normalized) || normalized.startsWith(p))
    })
    if (!matchedStudent) {
      setError('Student not found in this folder.')
      return
    }
    await handleViewStudent(matchedStudent.student_id)
  }

  const onFolderToggle = (key: string, isOpen: boolean) => {
    setOpenFolders((current) => ({ ...current, [key]: isOpen }))
  }

  const isFolderOpen = (key: string, index: number) => {
    if (Object.prototype.hasOwnProperty.call(openFolders, key)) {
      return openFolders[key]
    }
    return index === 0
  }

  return (
    <section className="card">
      <h1>Enrollment Module</h1>
      <p>Register students, search profiles, and manage subject loads.</p>

      {activeNotification && activeNotificationMeta && (
        <div className="enrollment-notice-overlay" role="presentation">
          <div
            className={`enrollment-notice-card ${activeNotificationMeta.accentClassName}`}
            role={activeNotification.tone === 'error' ? 'alertdialog' : 'dialog'}
            aria-live={activeNotification.tone === 'error' ? 'assertive' : 'polite'}
            aria-modal="true"
          >
            <div className="enrollment-notice-timer" aria-hidden="true">
              <div
                className={`enrollment-notice-icon ${activeNotificationMeta.accentClassName}`}
                style={{ '--notice-progress': `${notificationProgress}%` } as CSSProperties}
              >
                {activeNotificationMeta.icon === 'check' ? (
                  <svg viewBox="0 0 32 32" focusable="false" aria-hidden="true">
                    <path d="M8 16.5 13.2 22 24 10.5" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 32 32" focusable="false" aria-hidden="true">
                    {activeNotificationMeta.icon === 'x' ? (
                      <>
                        <path d="M10 10 22 22" />
                        <path d="M22 10 10 22" />
                      </>
                    ) : (
                      <>
                        <path d="M16 9v10" />
                        <circle cx="16" cy="24" r="1.5" fill="currentColor" stroke="none" />
                      </>
                    )}
                  </svg>
                )}
              </div>
            </div>
            <h2 className="enrollment-notice-title">{activeNotificationMeta.title}</h2>
            <p className="enrollment-notice-message">{activeNotification.message}</p>
            <button type="button" className="enrollment-notice-ok" onClick={clearActiveNotification}>
              Ok
            </button>
          </div>
        </div>
      )}

      <div className="enroll-actions">
        <button
          type="button"
          onClick={() => {
            const baseForm = buildInitialStudentForm()
            setEditingStudentId(null)
            setScanStep('idle')
            setScanStatus('')
            setStudentForm({
              ...baseForm,
              program: defaultProgramId,
              adviser_name: defaultProgram?.program_adviser || '',
              dean_name: defaultProgram?.school_dean || '',
            })
            setApprovalDate(baseForm.admission_date)
            setScheduleRows(buildInitialScheduleRows())
            setIsEnrollModalOpen(true)
          }}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
        >
          <AddUserIcon /> Enroll Student
        </button>
      </div>

      {isEnrollModalOpen && (
        <div className="enroll-modal-overlay">
          <div className="enroll-modal" style={{ overflowY: 'auto', maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>
            <div className="enroll-modal-header">
              <h2>{editingStudentId ? `Edit Enrollment Form - ${editingStudentId}` : 'Enrollment Form'}</h2>
              <div className="modal-header-actions">
                <input
                  ref={enrollmentScanInputRef}
                  type="file"
                  accept="image/*"
                  onChange={onPickEnrollmentScan}
                  hidden
                />
                <input
                  ref={loadSlipScanInputRef}
                  type="file"
                  accept="image/*"
                  onChange={onPickLoadSlipScan}
                  hidden
                />
                <button type="button" className="scan-docs-btn" onClick={startTwoDocumentScan} disabled={isScanningDocuments}>
                  {isScanningDocuments
                    ? 'Scanning Documents...'
                    : scanStep === 'awaiting_load_slip'
                      ? 'Scan Load Slip'
                      : 'Scan 2 Documents'}
                </button>
                {!!scanStatus && <span className="scan-docs-status">{scanStatus}</span>}
                <label className="toggle-switch" aria-label="Close on save">
                  <input
                    type="checkbox"
                    checked={shouldCloseOnSaveEnrollment}
                    onChange={(e) => setShouldCloseOnSaveEnrollment(e.target.checked)}
                  />
                  <span className="toggle-track" aria-hidden="true">
                    <span className="toggle-thumb" aria-hidden="true" />
                  </span>
                  <span className="toggle-text">Close on save</span>
                </label>
                <button type="button" onClick={closeEnrollModal}>
                  Close
                </button>
              </div>
            </div>

            <form onSubmit={createStudent} className="enroll-sheet-form">
              <div className="sheet-section-title">Student Information</div>
              <div className="sheet-grid">
                <input placeholder="Last Name" value={studentForm.last_name} onChange={(e) => onStudentFieldChange('last_name', e.target.value)} required />
                <input placeholder="First Name" value={studentForm.first_name} onChange={(e) => onStudentFieldChange('first_name', e.target.value)} required />
                <input placeholder="Middle Name" value={studentForm.middle_name} onChange={(e) => onStudentFieldChange('middle_name', e.target.value)} />
                <input placeholder="Name Ext." value={studentForm.extension_name} onChange={(e) => onStudentFieldChange('extension_name', e.target.value)} />
                <select value={studentForm.gender} onChange={(e) => onStudentFieldChange('gender', e.target.value)}>
                  <option value="">Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Non-binary">Non-binary</option>
                  <option value="Prefer not to say">Prefer not to say</option>
                </select>
                <div className="field-inline-label">
                  <span>Date of Birth</span>
                  <input type="date" value={studentForm.date_of_birth} onChange={(e) => onStudentFieldChange('date_of_birth', e.target.value)} />
                </div>
                <input placeholder="Age (Auto)" value={computedAge ?? ''} readOnly />
                <select value={studentForm.civil_status} onChange={(e) => onStudentFieldChange('civil_status', e.target.value)}>
                  <option value="">Status</option>
                  <option value="Single">Single</option>
                  <option value="Married">Married</option>
                  <option value="Separated">Separated</option>
                  <option value="Widowed">Widowed</option>
                  <option value="Annulled">Annulled</option>
                  <option value="Divorced">Divorced</option>
                </select>
                <input
                  placeholder="ID Number (last 4 digits)"
                  value={studentForm.student_id}
                  onChange={(e) => onStudentFieldChange('student_id', e.target.value)}
                  required
                />
                <select value={studentForm.program} onChange={(e) => onProgramChange(e.target.value)} required>
                  <option value="">Program</option>
                  {programs.map((program) => (
                    <option key={program.id} value={program.id}>
                      {program.name}
                    </option>
                  ))}
                </select>
                <select value={studentForm.year_level} onChange={(e) => onStudentFieldChange('year_level', e.target.value)}>
                  <option value="1">Year 1</option>
                  <option value="2">Year 2</option>
                  <option value="3">Year 3</option>
                  <option value="4">Year 4</option>
                </select>
                <select value={studentForm.academic_year} onChange={(e) => onStudentFieldChange('academic_year', e.target.value)}>
                  <option value="">Academic Year</option>
                  {academicYearOptions.map((yearLabel) => (
                    <option key={yearLabel} value={yearLabel}>
                      {yearLabel}
                    </option>
                  ))}
                </select>
                <select value={studentForm.semester} onChange={(e) => onStudentFieldChange('semester', e.target.value)}>
                  <option value="1">1st Semester</option>
                  <option value="2">2nd Semester</option>
                  <option value="3">Summer</option>
                </select>
                <select
                  value={studentForm.section}
                  onChange={(e) => onStudentFieldChange('section', e.target.value)}
                  disabled={!hasRequiredSectionFilters || !hasMatchingAcademicTerm || !availableSections.length}
                >
                  <option value="">{sectionPlaceholder}</option>
                  {availableSections.map((section) => (
                    <option key={section.id} value={section.id}>
                      {section.name} (Year {section.year_level}, Sem {section.semester})
                    </option>
                  ))}
                </select>
                <select value={studentForm.scholarship} onChange={(e) => onStudentFieldChange('scholarship', e.target.value)}>
                  <option value="">Scholarship</option>
                  <option value="Non-Scholar">Non-Scholar</option>
                  <option value="PAGLAMBO">PAGLAMBO</option>
                </select>
                <input placeholder="Nationality" value={studentForm.nationality} onChange={(e) => onStudentFieldChange('nationality', e.target.value)} />
                <div className="field-inline-label">
                  <span>Date Enrolled</span>
                  <input type="date" value={studentForm.admission_date} onChange={(e) => onStudentFieldChange('admission_date', e.target.value)} />
                </div>
                <input placeholder="Complete Home Address" value={studentForm.home_address} onChange={(e) => onStudentFieldChange('home_address', e.target.value)} />
                <input placeholder="Email Address" value={studentForm.email_address} onChange={(e) => onStudentFieldChange('email_address', e.target.value)} />
                <input placeholder="Mobile Number" value={studentForm.contact_number} onChange={(e) => onStudentFieldChange('contact_number', e.target.value)} />
              </div>

              <div className="sheet-section-title">Parent or Guardian Information</div>
              <div className="sheet-grid">
                <input placeholder="Mother's Maiden Name" value={studentForm.mother_maiden_name} onChange={(e) => onStudentFieldChange('mother_maiden_name', e.target.value)} />
                <input placeholder="Mother Mobile No." value={studentForm.mother_contact_number} onChange={(e) => onStudentFieldChange('mother_contact_number', e.target.value)} />
                <input placeholder="Father's Name" value={studentForm.father_name} onChange={(e) => onStudentFieldChange('father_name', e.target.value)} />
                <input placeholder="Father Mobile No." value={studentForm.father_contact_number} onChange={(e) => onStudentFieldChange('father_contact_number', e.target.value)} />
              </div>

              <div className="sheet-section-title">Educational Record</div>
              <div className="sheet-grid educational-record-grid">
                <input placeholder="Elementary" value={studentForm.elementary_school} onChange={(e) => onStudentFieldChange('elementary_school', e.target.value)} />
                <input placeholder="Junior High School" value={studentForm.junior_high_school} onChange={(e) => onStudentFieldChange('junior_high_school', e.target.value)} />
                <input placeholder="Senior High School" value={studentForm.senior_high_school} onChange={(e) => onStudentFieldChange('senior_high_school', e.target.value)} />
                <input placeholder="Track" value={studentForm.senior_high_track} onChange={(e) => onStudentFieldChange('senior_high_track', e.target.value)} />
                <input placeholder="Strand" value={studentForm.senior_high_strand} onChange={(e) => onStudentFieldChange('senior_high_strand', e.target.value)} />
              </div>

              <div className="schedule-section-head">
                <div className="sheet-section-title">Subject Load Schedule</div>
                <div
                  className={`schedule-trash-bin${isTrashDropActive ? ' is-active' : ''}`}
                  onDragOver={onScheduleTrashDragOver}
                  onDragLeave={onScheduleTrashDragLeave}
                  onDrop={onScheduleTrashDrop}
                  title="Drag a subject here to remove it from the schedule"
                >
                  <TrashBinIcon /> Trash Bin
                </div>
              </div>
              <div className="table-wrap schedule-sheet-wrap">
                <table className="schedule-sheet-table">
                  <thead>
                    <tr>
                      <th>DATE SCHEDULE</th>
                      <th>TIME</th>
                      <th>SUBJECT CODE &amp; SECTION</th>
                      <th>Units</th>
                      <th>Room</th>
                    </tr>
                  </thead>
                  <tbody>
                    {enrollmentDisplayScheduleRows.map((row, index) => {
                      const dropActive = dropTarget?.rowIndex === row.rowIndex && dropTarget.column === row.column
                      return (
                        <tr key={`${row.dayLabel}-${row.time}-${row.rowIndex}-${row.column}-${index}`}>
                          <td><input value={shouldShowScheduleTime ? row.dayLabel : ''} readOnly /></td>
                          <td><input className="schedule-time-input" value={shouldShowScheduleTime ? formatTimeRangeWithMeridiem(row.time) : ''} readOnly /></td>
                          <td>
                            <input
                              className={dropActive ? 'schedule-drag-over' : ''}
                              value={row.subject}
                              onChange={(e) => onDisplayScheduleRowChange(row, 'subject', e.target.value)}
                              draggable={isScheduleCellDraggable(row.rowIndex, row.column)}
                              onDragStart={(e) => onScheduleDragStart(e, row.rowIndex, row.column)}
                              onDragOver={(e) => onScheduleDragOver(e, row.rowIndex, row.column)}
                              onDrop={(e) => onScheduleDrop(e, row.rowIndex, row.column)}
                              onDragEnd={onScheduleDragEnd}
                            />
                          </td>
                          <td>
                            <input value={row.units} onChange={(e) => onDisplayScheduleRowChange(row, 'units', e.target.value)} />
                          </td>
                          <td>
                            <input value={row.room} onChange={(e) => onDisplayScheduleRowChange(row, 'room', e.target.value)} />
                          </td>
                        </tr>
                      )
                    })}
                    {!enrollmentDisplayScheduleRows.length && (
                      <tr>
                        <td colSpan={5}>No mapped schedule for the selected Program/Year/Semester/Academic Year/Section.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="continuing-summary-row">
                <span><strong>Remarks:</strong></span>
                <span><strong>Total Units:</strong> {enrollmentScheduleSummary.totalUnits}</span>
                <span><strong>Total Subject/s:</strong> {enrollmentScheduleSummary.totalSubjects}</span>
              </div>

              <div className="sheet-section-title">Approval</div>
              <table className="continuing-approval-table">
                <thead>
                  <tr>
                    <th></th>
                    <th>Name</th>
                    <th>Signature</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>PROGRAM ADVISER</strong></td>
                    <td>
                      <input
                        placeholder="Program Adviser Name"
                        value={studentForm.adviser_name}
                        onChange={(e) => onStudentFieldChange('adviser_name', e.target.value)}
                      />
                    </td>
                    <td>
                      <select
                        value={studentForm.adviser_approval_status}
                        onChange={(e) => onStudentFieldChange('adviser_approval_status', e.target.value)}
                      >
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </td>
                    <td><input type="date" value={approvalDate} readOnly /></td>
                  </tr>
                  <tr>
                    <td><strong>SCHOOL DEAN</strong></td>
                    <td>
                      <input
                        placeholder="School Dean Name"
                        value={studentForm.dean_name}
                        onChange={(e) => onStudentFieldChange('dean_name', e.target.value)}
                      />
                    </td>
                    <td>
                      <select
                        value={studentForm.dean_approval_status}
                        onChange={(e) => onStudentFieldChange('dean_approval_status', e.target.value)}
                      >
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </td>
                    <td><input type="date" value={approvalDate} readOnly /></td>
                  </tr>
                </tbody>
              </table>

              <div className="enroll-modal-footer">
                <button type="submit">{editingStudentId ? 'Update Student' : 'Save Enrollment'}</button>
                <button type="button" onClick={closeEnrollModal}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <h2 className="section-title">Search Existing Student</h2>
      <form className="form-grid" onSubmit={searchStudent}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <span
            style={{
              position: 'absolute',
              left: '10px',
              cursor: searchId ? 'pointer' : 'default',
              userSelect: 'none',
            }}
            onClick={() => searchId && setSearchId('')}
          >
            {searchId ? '✕' : '🔍'}
          </span>
          <input
            placeholder="Student ID"
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            required
            style={{ paddingLeft: '30px', width: '100%' }}
          />
        </div>
        <button type="submit" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <SearchIcon /> Search
        </button>
      </form>

      <h2 className="section-title">Enrolled Students</h2>
      <div className="continuing-folder-list">
        {groupedEnrolledStudents.map((group, index) => (
          <details
            key={group.key}
            className="continuing-folder admin-folder-animated"
            open={isFolderOpen(group.key, index)}
            onToggle={(event) => onFolderToggle(group.key, event.currentTarget.open)}
          >
            <summary>
              <span className="folder-title folder-title-with-icon">
                <FolderIcon />
                {group.programName} | {group.academicYear} | Year {group.yearLevel} | Section {group.sectionName} | {getSemesterLabel(group.semester)}
              </span>
              <span className="folder-summary-right">
                <span className="folder-count">{group.totalStudents}</span>
                <span className="folder-toggle-icon" aria-hidden="true">
                  <ChevronDownIcon />
                </span>
              </span>
            </summary>
            <div className="continuing-folder-content">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th colSpan={9}>
                        <form
                          className="form-grid"
                          onSubmit={(event) => {
                            void searchStudentInFolder(event, group.key, group.students)
                          }}
                        >
                          <input
                            placeholder="Search by Student ID or Name (Lastname, Firstname, Middlename)"
                            value={folderSearchQueries[group.key] || ''}
                            onChange={(event) =>
                              setFolderSearchQueries((current) => ({
                                ...current,
                                [group.key]: event.target.value,
                              }))
                            }
                            required
                          />
                          <button
                            type="submit"
                            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                            disabled={isViewLoading}
                          >
                            <SearchIcon /> Search
                          </button>
                        </form>
                      </th>
                    </tr>
                    <tr>
                      <th>Student ID</th>
                      <th>Name</th>
                      <th>Program</th>
                      <th>Semester</th>
                      <th>Year Level</th>
                      <th>Section</th>
                      <th>Academic Year</th>
                      <th>Gender</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.students.map((student) => (
                      <tr key={student.id}>
                        <td>
                          {getGenderIconPath(student.gender) && (
                            <span className="gender-badge-image-wrap" aria-hidden="true">
                              <img src={getGenderIconPath(student.gender) || ''} alt="" className="gender-badge-image" />
                            </span>
                          )}
                          <span className="student-id-with-gender">{student.student_id}</span>
                        </td>
                        <td>{`${student.last_name}, ${student.first_name} ${student.middle_name}.`}</td>
                        <td>{programs.find((p) => p.id === student.program)?.name || '-'}</td>
                        <td>{student.semester}</td>
                        <td>{student.year_level}</td>
                        <td>{sections.find((s) => s.id === student.section)?.name || '-'}</td>
                        <td>{student.academic_year}</td>
                        <td>{student.gender}</td>
                        <td>
                          <button type="button" onClick={() => { void handleViewStudent(student.student_id) }} disabled={isViewLoading}>
                            View
                          </button>
                          <button type="button" onClick={() => { void openEditStudent(student.student_id) }}>
                            Edit
                          </button>
                          <button type="button" onClick={() => requestDeleteStudent(student.student_id)}>
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </details>
        ))}
        {!groupedEnrolledStudents.length && (
          <div className="table-wrap">
            <table>
              <tbody>
                <tr>
                  <td colSpan={9}>No enrolled students found.</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isViewModalOpen && (
        <div className="enroll-modal-overlay">
          <div className="enroll-modal load-slip-modal" onClick={(e) => e.stopPropagation()}>
            <div className="enroll-modal-header">
              <h2>Enrollment Load Slip</h2>
              <div className="modal-header-actions">
                <button type="button" onClick={printLoadSlip}>
                  Print
                </button>
                <button type="button" onClick={() => setIsViewModalOpen(false)}>
                  Close
                </button>
              </div>
            </div>

            {!viewStudent ? (
              <div className="enroll-sheet-form">No student selected.</div>
            ) : (
              <>
                {renderLoadSlip("Registrar's copy")}
                <div className="load-slip-divider" />
                {renderLoadSlip("Student's copy")}
              </>
            )}
          </div>
        </div>
      )}

      {isDeleteConfirmOpen && (
        <div className="confirm-overlay">
          <div className="confirm-modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-pill">Delete Student Record</div>
            <h3>
              Delete <span>{deleteStudentId}</span>?
            </h3>
            <p>This removes the student from active records. Historical data remains available.</p>
            <div className="confirm-actions">
              <button type="button" className="confirm-btn confirm-btn-secondary" onClick={closeDeleteConfirm} disabled={isDeletingStudent}>
                Cancel
              </button>
              <button type="button" className="confirm-btn confirm-btn-danger" onClick={() => { void handleDeleteStudent() }} disabled={isDeletingStudent}>
                {isDeletingStudent ? 'Deleting...' : 'Delete Student'}
              </button>
            </div>
          </div>
        </div>
      )}




      {student && !isViewModalOpen && (
        <>  
          <h2 className="section-title">Student Profile</h2>
          <div className="table-wrap">
            <table>
              <tbody>
                <tr>
                  <th>Student ID</th>
                  <td>{student.student_id}</td>
                  <th>Program</th>
                  <td>{programs.find((p) => p.id === student.program)?.name || student.program}</td>
                </tr>
                <tr>
                  <th>Name</th>
                  <td>{`${student.last_name}, ${student.first_name} ${student.middle_name || ''} ${student.extension_name || ''}`}</td>
                  <th>Year Level</th>
                  <td>{student.year_level}</td>
                </tr>
                <tr>
                  <th>Gender</th>
                  <td>{student.gender}</td>
                  <th>Section</th>
                  <td>{sections.find((s) => s.id === student.section)?.name || '-'}</td>
                </tr>
                <tr>
                  <th>Academic Year</th>
                  <td>{student.academic_year}</td>
                  <th>Semester</th>
                  <td>{student.semester || '-'}</td>
                </tr>
                <tr>
                  <th>Email</th>
                  <td>{student.email_address || '-'}</td>
                  <th>Contact No.</th>
                  <td>{student.contact_number || '-'}</td>
                </tr>
                <tr>
                  <th>Address</th>
                  <td colSpan={3}>{student.home_address || '-'}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <h2 className="section-title">Create Student Load</h2>
          <form className="form-grid" onSubmit={saveLoad}>
            <select value={selectedTerm} onChange={(e) => setSelectedTerm(e.target.value)} required>
              <option value="">Select Term</option>
              {terms.map((term) => (
                <option key={term.id} value={term.id}>
                  {term.year_label} - Sem {term.semester} {term.is_active ? '(Active)' : ''}
                </option>
              ))}
            </select>

            <select value={selectedSubject} onChange={(e) => setSelectedSubject(e.target.value)} required>
              <option value="">Select Subject</option>
              {subjects.map((subject) => (
                <option key={subject.id} value={subject.id}>
                  {subject.code} - {subject.title}
                </option>
              ))}
            </select>

            <select value={statusValue} onChange={(e) => setStatusValue(e.target.value)}>
              <option value="enrolled">enrolled</option>
              <option value="passed">passed</option>
              <option value="completed">completed</option>
            </select>

            <button type="submit">Save Load</button>
          </form>

          <div className="form-grid">
            <button type="button" onClick={previewAutoLoad}>
              Preview Auto-Load
            </button>
            <button type="button" onClick={triggerAutoLoad}>
              Run Auto-Load
            </button>
          </div>

          {!!previewSubjects.length && (
            <>
              <h2 className="section-title">Auto-Load Preview</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Subject Code</th>
                      <th>Title</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewSubjects.map((subject) => (
                      <tr key={subject.id}>
                        <td>{subject.code}</td>
                        <td>{subject.title}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          <h2 className="section-title">Current Semester Loads</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Term</th>
                  <th>Subject</th>
                  <th>Title</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {currentSemesterLoads.map((load) => (
                  <tr key={load.id}>
                    <td>{load.term_label}</td>
                    <td>{load.subject_code}</td>
                    <td>{load.subject_title}</td>
                    <td>{load.status}</td>
                  </tr>
                ))}
                {!currentSemesterLoads.length && (
                  <tr>
                    <td colSpan={4}>No enrolled subjects found for the current semester.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  )
}
