import { CSSProperties, DragEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx-js-style'

import { api, getErrorMessage } from '../api'
import { ChevronDownIcon, ContinuingIcon, ExcelIcon, FolderIcon, PdfIcon, SearchIcon, TrashBinIcon } from '../components/Icons'

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

type StudentDetail = {
  id: number
  student_id: string
  last_name: string
  first_name: string
  middle_name: string
  extension_name: string
  gender: string
  date_of_birth: string | null
  age: number | null
  civil_status: string
  nationality: string
  admission_date: string | null
  scholarship: string
  course: string
  program: number
  year_level: number
  academic_year: string
  semester: number | null
  section: number | null
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
  senior_high_track_strand: string
  adviser_name?: string
  dean_name?: string
  adviser_approval_status?: string
  adviser_approval_date?: string | null
  dean_approval_status?: string
  dean_approval_date?: string | null
  subject_load_schedule?: string
  loads: StudentLoad[]
}

type StudentSummary = {
  id: number
  student_id: string
  first_name: string
  last_name: string
  middle_name: string
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

type SlipScheduleRow = {
  code: string
  title: string
  units: string
  schedule: string
  room: string
}

type ContinuingScheduleGridRow = {
  mwfTime: string
  mwfSubject: string
  mwfUnits: string
  mwfRoom: string
  mwfDay: 'MWF'
  mwfCode?: string
  mwfTitle?: string
  tthTime: string
  tthSubject: string
  tthUnits: string
  tthRoom: string
  tthDay: 'TTH' | 'SATURDAY'
  tthCode?: string
  tthTitle?: string
  tthSaturdayHeader?: boolean
}

type ContinuingDisplayScheduleRow = {
  rowIndex: number
  column: ScheduleColumn
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

type ContinuingNoticeTone = 'success' | 'error' | 'warning'

const DEFAULT_SCHOLARSHIP_LABEL = 'Non-Scholar'
const PREPARED_BY_NAME = 'KRISTIN LILIA J. RUELO'
const PREPARED_BY_TITLE = 'College Registrar'
const CONTINUING_MWF_SLOTS = ['7:00-8:00', '8:00-9:00', '9:00-10:00', '10:00-11:00', '11:00-12:00', '1:00-2:00', '2:00-3:00', '3:00-4:00', '4:00-5:00', '5:00-6:00', '6:00-7:00', '', '']
const CONTINUING_TTH_SLOTS = ['7:00-8:30', '8:30-10:00', '10:00-11:30', '1:00-2:30', '2:30-4:00', '4:00-5:30', '5:30-7:00', '7:00-8:30', 'SATURDAY_HEADER', '1:00-4:30', '', '', '']
const CONTINUING_FOLDERS_STORAGE_KEY = 'ccb_continuing_folders_open_state'
const CONTINUING_NOTICE_DURATION_MS = 5000

const buildContinuingFolderStatusKey = (
  programId: number,
  academicYear: string,
  yearLevel: number,
  sectionId: number | null,
  semester: number | null,
) => `${programId}|${academicYear}|${yearLevel}|${sectionId ?? 'none'}|${semester ?? 'none'}`

const resolveContinuingNoticeMeta = (
  tone: ContinuingNoticeTone,
  message: string,
): { title: string; accentClassName: string; icon: string } => {
  const normalized = message.trim().toLowerCase()

  if (tone === 'error') {
    return { title: 'Error!', accentClassName: 'is-error', icon: 'x' }
  }

  if (normalized.includes('delete') || normalized.includes('deleted')) {
    return { title: 'Deleted!', accentClassName: 'is-warning', icon: '!' }
  }

  if (normalized.includes('update') || normalized.includes('updated') || normalized.includes('saved')) {
    return { title: 'Updated!', accentClassName: 'is-success', icon: 'check' }
  }

  if (tone === 'warning') {
    return { title: 'Notice!', accentClassName: 'is-warning', icon: '!' }
  }

  return { title: 'Success!', accentClassName: 'is-success', icon: 'check' }
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

const hasSpecificSubject = (value: string): boolean => {
  const normalized = value.trim()
  if (!normalized) return false
  if (normalized.toUpperCase() === 'SATURDAY') return false
  return /[A-Za-z]/.test(normalized)
}

const formatUnitsForDisplay = (value: string): string => {
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

type ContinuingReportGroup = {
  programName: string
  academicYear: string
  yearLevel: number
  semester: number | null
  sectionName: string
  students: StudentDetail[]
}

type ContinuingFolderStatus = {
  id: number
  program: number
  program_name: string
  academic_year: string
  year_level: number
  semester: number | null
  section: number | null
  section_name?: string
  status: 'ongoing' | 'done'
  updated_by: number | null
  updated_by_username?: string
  completed_at: string | null
  created_at: string
  updated_at: string
}

const REPORT_COLUMNS = ['Student ID', 'Lastname', 'Firstname', 'Middlename', 'Extension name', 'Section', 'Academic Year', 'Semester', 'Year Level', 'Gender'] as const

const semesterLabelForReport = (semester: number | null): string => {
  if (semester === 1) return '1st Semester'
  if (semester === 2) return '2nd Semester'
  if (semester === 3) return 'Summer'
  return '-'
}

const buildReportRows = (
  group: ContinuingReportGroup,
  sections: Section[],
): Array<Record<string, string>> => {
  return group.students.map((s) => {
    const sectionName = s.section != null
      ? (sections.find((sec) => sec.id === s.section)?.name ?? group.sectionName)
      : group.sectionName
    return {
      'Student ID': s.student_id ?? '',
      'Lastname': s.last_name ?? '',
      'Firstname': s.first_name ?? '',
      'Middlename': s.middle_name ?? '',
      'Extension name': s.extension_name ?? '',
      'Section': sectionName,
      'Academic Year': s.academic_year ?? group.academicYear,
      'Semester': semesterLabelForReport(group.semester),
      'Year Level': String(s.year_level ?? group.yearLevel),
      'Gender': s.gender ?? '',
    }
  })
}

const generateReportPDF = (group: ContinuingReportGroup, sections: Section[]) => {
  const rows = buildReportRows(group, sections)
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const margin = 14
  const pageWidth = doc.internal.pageSize.getWidth()
  let y = 14
  doc.setFillColor(11, 31, 58)
  doc.rect(0, 0, pageWidth, 8, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text('CITY COLLEGE OF BAYAWAN', pageWidth / 2, 5.5, { align: 'center' })
  doc.setTextColor(0, 0, 0)
  y = 16
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text('Government Center, Cabcabon, Banga, Bayawan City', pageWidth / 2, y, { align: 'center' })
  y += 5
  doc.setFont('helvetica', 'bold')
  doc.text('OFFICE OF THE COLLEGE REGISTRAR', pageWidth / 2, y, { align: 'center' })
  y += 10
  doc.setDrawColor(11, 31, 58)
  doc.setLineWidth(0.5)
  doc.line(margin, y, pageWidth - margin, y)
  y += 8
  doc.setFontSize(12)
  doc.text('CONTINUING STUDENTS REPORT', pageWidth / 2, y, { align: 'center' })
  y += 7
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const subtitle = `${group.programName} | ${group.academicYear} | Year ${group.yearLevel} | Section ${group.sectionName} | ${semesterLabelForReport(group.semester)}`
  doc.text(subtitle, pageWidth / 2, y, { align: 'center' })
  y += 5
  doc.setFontSize(8)
  doc.setTextColor(100, 100, 100)
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, pageWidth / 2, y, { align: 'center' })
  doc.setTextColor(0, 0, 0)
  y += 10
  const head = [[...REPORT_COLUMNS]]
  const body = rows.map((r) => REPORT_COLUMNS.map((col) => r[col] ?? ''))
  autoTable(doc, {
    head,
    body,
    startY: y,
    theme: 'striped',
    headStyles: { fillColor: [11, 31, 58], textColor: 255, fontSize: 9 },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: margin, right: margin },
    styles: { fontSize: 8 },
  })
  const safeName = `${group.programName.replace(/[^a-z0-9]/gi, '_')}_${group.academicYear}_Year${group.yearLevel}_${group.sectionName}`.slice(0, 80)
  doc.save(`Student_Report_${safeName}.pdf`)
}

const HEADER_FILL = '0B1F3A'
const HEADER_TEXT = 'FFFFFF'
const SUBHEADER_FILL = 'F1F5F9'
const ALT_ROW_FILL = 'F8FAFC'

const generateReportExcel = (group: ContinuingReportGroup, sections: Section[]) => {
  const rows = buildReportRows(group, sections)
  const colCount = REPORT_COLUMNS.length
  const aoa: string[][] = [
    ['CITY COLLEGE OF BAYAWAN'],
    ['OFFICE OF THE COLLEGE REGISTRAR'],
    ['CONTINUING STUDENTS REPORT'],
    [`${group.programName} | ${group.academicYear} | Year ${group.yearLevel} | Section ${group.sectionName} | ${semesterLabelForReport(group.semester)}`],
    [`Generated: ${new Date().toLocaleDateString()}`],
    [],
    [...REPORT_COLUMNS],
    ...rows.map((r) => REPORT_COLUMNS.map((col) => r[col] ?? '')),
  ]
  const ws = XLSX.utils.aoa_to_sheet(aoa)
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: colCount - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: colCount - 1 } },
    { s: { r: 2, c: 0 }, e: { r: 2, c: colCount - 1 } },
    { s: { r: 3, c: 0 }, e: { r: 3, c: colCount - 1 } },
    { s: { r: 4, c: 0 }, e: { r: 4, c: colCount - 1 } },
  ]
  const headerStyle = { font: { bold: true, sz: 14, color: { rgb: HEADER_TEXT } }, fill: { patternType: 'solid' as const, fgColor: { rgb: HEADER_FILL } }, alignment: { horizontal: 'center' as const } }
  const subStyle = { font: { bold: true, sz: 11 }, fill: { patternType: 'solid' as const, fgColor: { rgb: SUBHEADER_FILL } }, alignment: { horizontal: 'center' as const } }
  const metaStyle = { font: { sz: 10 }, alignment: { horizontal: 'center' as const } }
  const colHeaderStyle = { font: { bold: true, sz: 10, color: { rgb: HEADER_TEXT } }, fill: { patternType: 'solid' as const, fgColor: { rgb: HEADER_FILL } }, alignment: { horizontal: 'center' as const } }
  ws['A1'] = { ...ws['A1'], s: headerStyle }
  ws['A2'] = { ...ws['A2'], s: { ...headerStyle, font: { ...headerStyle.font, sz: 10 } } }
  ws['A3'] = { ...ws['A3'], s: subStyle }
  ws['A4'] = { ...ws['A4'], s: metaStyle }
  ws['A5'] = { ...ws['A5'], s: metaStyle }
  const colHeaderRow = 6
  for (let c = 0; c < colCount; c++) {
    const ref = XLSX.utils.encode_cell({ r: colHeaderRow, c })
    ws[ref] = { ...ws[ref], s: colHeaderStyle }
  }
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < colCount; c++) {
      const ref = XLSX.utils.encode_cell({ r: colHeaderRow + 1 + r, c })
      if (ws[ref]) {
        ws[ref] = { ...ws[ref], s: { fill: { patternType: 'solid' as const, fgColor: { rgb: r % 2 === 1 ? ALT_ROW_FILL : 'FFFFFF' } } } }
      }
    }
  }
  ws['!cols'] = REPORT_COLUMNS.map(() => ({ wch: 14 }))
  const wb = XLSX.utils.book_new()
  const sheetName = `${group.sectionName}_Report`.slice(0, 31).replace(/[*?:/\\]/g, '')
  XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Students')
  const safeName = `${group.programName.replace(/[^a-z0-9]/gi, '_')}_${group.academicYear}_Year${group.yearLevel}_${group.sectionName}`.slice(0, 80)
  XLSX.writeFile(wb, `Student_Report_${safeName}.xlsx`)
}

const buildAcademicYearOptions = () => {
  const currentYear = new Date().getFullYear()
  return Array.from({ length: 21 }, (_, i) => {
    const start = currentYear - 10 + i
    return `${start}-${start + 1}`
  })
}

export function ContinuingPage() {
  const [searchId, setSearchId] = useState('')
  const [student, setStudent] = useState<StudentDetail | null>(null)

  const [allStudents, setAllStudents] = useState<StudentDetail[]>([])
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isSlipModalOpen, setIsSlipModalOpen] = useState(false)
  const [isPrintingLoadSlip, setIsPrintingLoadSlip] = useState(false)
  const [slipStudent, setSlipStudent] = useState<StudentDetail | null>(null)
  const [isSlipLoading, setIsSlipLoading] = useState(false)
  const [slipStatus, setSlipStatus] = useState('ON-GOING')
  const [slipScholarship, setSlipScholarship] = useState(DEFAULT_SCHOLARSHIP_LABEL)
  const [slipDateOfBirth, setSlipDateOfBirth] = useState<string | null>(null)
  const [departments, setDepartments] = useState<Department[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [sections, setSections] = useState<Section[]>([])
  const [subjects, setSubjects] = useState<Subject[]>([])
  const [prospectusEntries, setProspectusEntries] = useState<ProspectusEntry[]>([])
  const [terms, setTerms] = useState<AcademicTerm[]>([])

  const [selectedProgram, setSelectedProgram] = useState('')
  const [selectedYearLevel, setSelectedYearLevel] = useState('')
  const [selectedAcademicYear, setSelectedAcademicYear] = useState('')
  const [selectedSemester, setSelectedSemester] = useState('1')
  const [selectedSection, setSelectedSection] = useState('')
  const [selectedAdviserStatus, setSelectedAdviserStatus] = useState('approved')
  const [selectedDeanStatus, setSelectedDeanStatus] = useState('approved')
  const [continuingFormDate, setContinuingFormDate] = useState(new Date().toISOString().split('T')[0])
  const [incSubjectCodes, setIncSubjectCodes] = useState('')
  const [incSectionPageRef, setIncSectionPageRef] = useState('')
  const [notesStudentSignature, setNotesStudentSignature] = useState('')
  const [notesSignatureDate, setNotesSignatureDate] = useState('')
  const [notesAdviserName, setNotesAdviserName] = useState('')
  const [shouldCloseOnSaveContinuing, setShouldCloseOnSaveContinuing] = useState(true)
  const [continuingScheduleGrid, setContinuingScheduleGrid] = useState<ContinuingScheduleGridRow[]>([])
  const continuingScheduleGridRef = useRef<ContinuingScheduleGridRow[]>([])
  const [draggingCell, setDraggingCell] = useState<ScheduleDragCell | null>(null)
  const [dropTarget, setDropTarget] = useState<ScheduleDragCell | null>(null)
  const [isTrashDropActive, setIsTrashDropActive] = useState(false)
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
  const [deleteStudentId, setDeleteStudentId] = useState<string | null>(null)
  const [isDeletingStudent, setIsDeletingStudent] = useState(false)
  const [folderSearchQueries, setFolderSearchQueries] = useState<Record<string, string>>({})
  const [folderStatuses, setFolderStatuses] = useState<Record<string, ContinuingFolderStatus>>({})
  const [savingFolderStatuses, setSavingFolderStatuses] = useState<Record<string, boolean>>({})
  const [reportMenuOpen, setReportMenuOpen] = useState<string | null>(null)
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {}
    try {
      const raw = window.localStorage.getItem(CONTINUING_FOLDERS_STORAGE_KEY)
      if (!raw) return {}
      return JSON.parse(raw) as Record<string, boolean>
    } catch {
      return {}
    }
  })

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [warning, setWarning] = useState('')
  const [notificationProgress, setNotificationProgress] = useState(100)

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
    () => (activeNotification ? resolveContinuingNoticeMeta(activeNotification.tone, activeNotification.message) : null),
    [activeNotification],
  )

  useEffect(() => {
    if (!activeNotification) return
    setNotificationProgress(100)
    const startedAt = window.performance.now()
    const intervalId = window.setInterval(() => {
      const elapsed = window.performance.now() - startedAt
      const remaining = Math.max(0, CONTINUING_NOTICE_DURATION_MS - elapsed)
      setNotificationProgress((remaining / CONTINUING_NOTICE_DURATION_MS) * 100)
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

  const academicYearOptions = useMemo(buildAcademicYearOptions, [])

  const loadReferenceData = async () => {
    const [departmentResp, programResp, sectionResp, subjectResp, prospectusResp, termResp, studentsResp, folderStatusResp] = await Promise.all([
      api.get<Department[]>('/departments/'),
      api.get<Program[]>('/programs/'),
      api.get<Section[]>('/sections/'),
      api.get<Subject[]>('/subjects/'),
      api.get<ProspectusEntry[]>('/prospectus/'),
      api.get<AcademicTerm[]>('/terms/'),
      api.get<StudentDetail[]>('/students/'), // Load detailed student data to check continuing status
      api.get<ContinuingFolderStatus[]>('/continuing/folder-statuses/'),
    ])
    setDepartments(departmentResp.data)
    setPrograms(programResp.data)
    setSections(sectionResp.data)
    setSubjects(subjectResp.data)
    setProspectusEntries(prospectusResp.data)
    setTerms(termResp.data)
    setFolderStatuses(
      folderStatusResp.data.reduce<Record<string, ContinuingFolderStatus>>((acc, item) => {
        acc[buildContinuingFolderStatusKey(item.program, item.academic_year, item.year_level, item.section, item.semester)] = item
        return acc
      }, {}),
    )
    
    // Filter to show only students who have undergone continuing process
    // Exclude 1st Year - 1st Semester students and only show actual continuing students
    console.log('All students data:', studentsResp.data)
    
    const continuingStudents = studentsResp.data.filter(student => {
      // Exclude 1st Year - 1st Semester students
      const isFirstYearFirstSem = student.year_level === 1 && student.semester === 1
      
      // Only show students who are NOT in 1st Year - 1st Semester
      // These are the actual continuing students
      const isContinuingStudent = !isFirstYearFirstSem
      
      console.log(`Student ${student.student_id} (${student.last_name}, ${student.first_name}):`, {
        year_level: student.year_level,
        semester: student.semester,
        isFirstYearFirstSem,
        isContinuingStudent,
        adviser_status: student.adviser_approval_status,
        dean_status: student.dean_approval_status,
        schedule: student.subject_load_schedule
      })
      
      return isContinuingStudent
    })
    
    console.log('Filtered continuing students:', continuingStudents)
    setAllStudents(continuingStudents)
  }

  useEffect(() => {
    loadReferenceData().catch((err) => setError(getErrorMessage(err)))
  }, [])

  useEffect(() => {
    window.localStorage.setItem(CONTINUING_FOLDERS_STORAGE_KEY, JSON.stringify(openFolders))
  }, [openFolders])

  useEffect(() => {
    if (!reportMenuOpen) return
    const closeOnClick = () => setReportMenuOpen(null)
    window.setTimeout(() => document.addEventListener('click', closeOnClick), 0)
    return () => document.removeEventListener('click', closeOnClick)
  }, [reportMenuOpen])

  const loadStudentForContinuing = async (studentId: string, successMessage = 'Student found.') => {
    const response = await api.get<StudentDetail>(`/students/${studentId}/`)
    const found = response.data
    setStudent(found)
    setSearchId(found.student_id)
    setSelectedProgram(String(found.program))
    setSelectedYearLevel(String(found.year_level))
    setSelectedAcademicYear(found.academic_year || '')
    setSelectedSemester(String(found.semester ?? 1))
    setSelectedSection(found.section ? String(found.section) : '')
    setSelectedAdviserStatus(found.adviser_approval_status || 'approved')
    setSelectedDeanStatus(found.dean_approval_status || 'approved')
    setContinuingFormDate(
      found.adviser_approval_date || found.dean_approval_date || new Date().toISOString().split('T')[0],
    )
    setSuccess(successMessage)
  }

  const searchStudent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setSuccess('')

    try {
      await loadStudentForContinuing(searchId)
    } catch (err) {
      setStudent(null)
      setError(getErrorMessage(err))
    }
  }

  const searchStudentInFolder = async (event: FormEvent<HTMLFormElement>, groupKey: string, groupStudents: StudentDetail[]) => {
    event.preventDefault()
    setError('')
    setSuccess('')

    const searchValue = (folderSearchQueries[groupKey] || '').trim()
    if (!searchValue) {
      setError('Enter a Student ID or name to search.')
      return
    }

    const searchLower = searchValue.toLowerCase()
    const matchedStudent = groupStudents.find((studentItem) => {
      const idMatch = studentItem.student_id.trim().toLowerCase() === searchLower
      if (idMatch) return true
      const lastName = (studentItem.last_name || '').toLowerCase()
      const firstName = (studentItem.first_name || '').toLowerCase()
      const middleName = (studentItem.middle_name || '').toLowerCase()
      const searchParts = searchValue.split(/\s+/).filter(Boolean).map((p) => p.toLowerCase())
      const allPartsMatch = searchParts.every(
        (part) =>
          lastName.includes(part) || firstName.includes(part) || middleName.includes(part)
      )
      return searchParts.length > 0 && allPartsMatch
    })
    if (!matchedStudent) {
      setError('Student not found in this folder.')
      return
    }

    await handleSelectStudent(matchedStudent.student_id)
    setSuccess(`Enrollment Load Slip loaded for ${matchedStudent.student_id}.`)
  }

  const openEditStudent = async (studentId: string) => {
    setError('')
    setSuccess('')
    setIsModalOpen(true)
    try {
      await loadStudentForContinuing(studentId, 'Student loaded for editing.')
    } catch (err) {
      setStudent(null)
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

  useEffect(() => {
    if (!isSlipModalOpen) return

    const suppressEscapeClose = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
    }

    document.addEventListener('keydown', suppressEscapeClose, true)
    return () => {
      document.removeEventListener('keydown', suppressEscapeClose, true)
    }
  }, [isSlipModalOpen])

  const handleDeleteStudent = async () => {
    if (!deleteStudentId) return

    setError('')
    setSuccess('')
    setIsDeletingStudent(true)
    try {
      await api.delete(`/students/${deleteStudentId}/`)
      if (student?.student_id === deleteStudentId) setStudent(null)
      if (slipStudent?.student_id === deleteStudentId) {
        setSlipStudent(null)
        setIsSlipModalOpen(false)
      }
      if (searchId === deleteStudentId) setSearchId('')
      await loadReferenceData()
      setSuccess(`Student ${deleteStudentId} deleted from active records.`)
      setIsDeleteConfirmOpen(false)
      setDeleteStudentId(null)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setIsDeletingStudent(false)
    }
  }

  const selectedProgramData = programs.find((program) => String(program.id) === selectedProgram)
  const selectedSectionData = sections.find((section) => String(section.id) === selectedSection)
  const resolvedAdviserName = selectedProgramData?.program_adviser || student?.adviser_name || ''
  const resolvedDeanName = selectedProgramData?.school_dean || student?.dean_name || ''

  const hasRequiredSectionFilters = Boolean(
    selectedProgram && selectedYearLevel && selectedAcademicYear && selectedSemester,
  )
  const hasMatchingAcademicTerm = terms.some(
    (term) => term.year_label === selectedAcademicYear && String(term.semester) === selectedSemester,
  )
  const filteredSections =
    hasRequiredSectionFilters && hasMatchingAcademicTerm
      ? sections.filter(
          (section) =>
            String(section.program) === selectedProgram &&
            String(section.year_level) === selectedYearLevel &&
            String(section.semester) === selectedSemester,
        )
      : []
  const sectionPlaceholder = !hasRequiredSectionFilters
    ? 'Select Program, Year Level, Academic Year, and Semester first'
    : !hasMatchingAcademicTerm
      ? 'No matching academic term for selected year/semester'
      : filteredSections.length
        ? 'Section'
        : 'No sections available for selected criteria'

  const subjectMap = useMemo(() => {
    const map = new Map<number, Subject>()
    subjects.forEach((subject) => map.set(subject.id, subject))
    return map
  }, [subjects])

  const resolvedProspectusEntries = useMemo(() => {
    if (!selectedProgram || !selectedYearLevel || !selectedSemester || !selectedAcademicYear || !selectedSection) return [] as ProspectusEntry[]
    const exact = prospectusEntries.filter(
      (entry) =>
        String(entry.program) === selectedProgram &&
        String(entry.year_level) === selectedYearLevel &&
        String(entry.semester) === selectedSemester &&
        entry.academic_year === selectedAcademicYear &&
        String(entry.section ?? '') === selectedSection,
    )
    if (exact.length) return exact
    return prospectusEntries.filter(
      (entry) =>
        String(entry.program) === selectedProgram &&
        String(entry.year_level) === selectedYearLevel &&
        String(entry.semester) === selectedSemester &&
        entry.academic_year === '' &&
        entry.section === null,
    )
  }, [prospectusEntries, selectedProgram, selectedYearLevel, selectedSemester, selectedAcademicYear, selectedSection])

  useEffect(() => {
    setSelectedSection((currentSection) => {
      if (!currentSection) return currentSection
      const isStillValid =
        hasRequiredSectionFilters &&
        hasMatchingAcademicTerm &&
        filteredSections.some((section) => String(section.id) === currentSection)
      return isStillValid ? currentSection : ''
    })
  }, [
    selectedProgram,
    selectedYearLevel,
    selectedAcademicYear,
    selectedSemester,
    hasRequiredSectionFilters,
    hasMatchingAcademicTerm,
    filteredSections,
  ])

  const scheduleFromCurrentLoads = useMemo(() => {
    if (!student || !selectedAcademicYear || !selectedSemester) return [] as Array<{ code: string; title: string; time: string; room: string }>
    const semNeedle = `Sem ${selectedSemester}`
    return student.loads
      .filter((load) => load.term_label.includes(selectedAcademicYear) && load.term_label.includes(semNeedle))
      .map((load) => ({
        code: load.subject_code,
        title: load.subject_title,
        time: resolvedProspectusEntries.find((entry) => entry.subject === load.subject_id)?.time || '',
        room: resolvedProspectusEntries.find((entry) => entry.subject === load.subject_id)?.room || '',
      }))
  }, [student, selectedAcademicYear, selectedSemester, resolvedProspectusEntries])

  const scheduleFromProspectus = useMemo(() => {
    if (!selectedProgram || !selectedYearLevel || !selectedSemester || !selectedAcademicYear || !selectedSection) {
      return [] as Array<{ code: string; title: string; time: string; room: string }>
    }
    return resolvedProspectusEntries
      .map((entry) => {
        const subject = subjectMap.get(entry.subject)
        return {
          code: subject?.code ?? String(entry.subject),
          title: subject?.title ?? 'Unknown Subject',
          time: entry.time || '',
          room: entry.room || '',
        }
      })
  }, [resolvedProspectusEntries, selectedProgram, selectedYearLevel, selectedSemester, selectedAcademicYear, selectedSection, subjectMap])

  const scheduleRows = scheduleFromProspectus.length ? scheduleFromProspectus : scheduleFromCurrentLoads

  const buildScheduleText = (grid: ContinuingScheduleGridRow[] = continuingScheduleGrid) => {
    const saturdayHeaderIndex = grid.findIndex((row) => row.tthSaturdayHeader)
    const hasSaturdaySubjects =
      saturdayHeaderIndex >= 0 &&
      grid.slice(saturdayHeaderIndex + 1).some((row) => hasSpecificSubject(row.tthSubject))

    return grid
      .flatMap((row) => {
        const mwfHasSubject = hasSpecificSubject(row.mwfSubject)
        const tthHasSubject = hasSpecificSubject(row.tthSubject)

        // Write Saturday marker only when there is a real Saturday subject.
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

        // TTH-only line keeps Enrollment-compatible parser token ("| TTH ...").
        return [`MWF ${row.mwfTime}:  () | TTH ${row.tthTime}: ${row.tthSubject.trim()} (${row.tthUnits.trim()})`]
      })
      .join('\n')
  }

  const continuingTotalUnits = useMemo(() => {
    return continuingScheduleGrid.reduce((total, row) => {
      const append = (subject: string, units: string) => {
        if (!hasSpecificSubject(subject)) return
        const numericUnits = Number(units)
        if (Number.isFinite(numericUnits)) total += numericUnits
      }
      append(row.mwfSubject, row.mwfUnits)
      append(row.tthSubject, row.tthUnits)
      return total
    }, 0)
  }, [continuingScheduleGrid])

  const continuingTotalSubjects = useMemo(() => {
    return continuingScheduleGrid.reduce((total, row) => {
      const mwfCount = row.mwfCode ? 1 : 0
      const tthCount = !row.tthSaturdayHeader && row.tthCode ? 1 : 0
      return total + mwfCount + tthCount
    }, 0)
  }, [continuingScheduleGrid])

  const computedContinuingScheduleGrid = useMemo(() => {
    const rowCount = Math.max(CONTINUING_MWF_SLOTS.length, CONTINUING_TTH_SLOTS.length)
    const createEmptyRow = (): ContinuingScheduleGridRow => ({
      mwfTime: '',
      mwfSubject: '',
      mwfUnits: '',
      mwfRoom: '',
      mwfDay: 'MWF',
      tthTime: '',
      tthSubject: '',
      tthUnits: '',
      tthRoom: '',
      tthDay: 'TTH',
      tthSaturdayHeader: false,
    })

    const appendMwfRow = (grid: ContinuingScheduleGridRow[], time: string) => {
      const row = createEmptyRow()
      row.mwfTime = time
      grid.push(row)
      return grid.length - 1
    }

    const appendTthRow = (grid: ContinuingScheduleGridRow[], time: string) => {
      const row = createEmptyRow()
      row.tthTime = time
      grid.push(row)
      return grid.length - 1
    }

    const appendSaturdayRow = (grid: ContinuingScheduleGridRow[], time: string) => {
      const saturdayHeaderIndex = grid.findIndex((item) => item.tthSaturdayHeader)
      const row = createEmptyRow()
      row.tthTime = time
      if (saturdayHeaderIndex < 0 || saturdayHeaderIndex === grid.length - 1) {
        grid.push(row)
        return grid.length - 1
      }
      grid.splice(saturdayHeaderIndex + 1, 0, row)
      return saturdayHeaderIndex + 1
    }

    const grid: ContinuingScheduleGridRow[] = Array.from({ length: rowCount }, (_, index) => {
      const tthSlot = CONTINUING_TTH_SLOTS[index] ?? ''
      const saturdayHeader = tthSlot === 'SATURDAY_HEADER'
      return {
        mwfTime: CONTINUING_MWF_SLOTS[index] ?? '',
        mwfSubject: '',
        mwfUnits: '',
        mwfRoom: '',
        mwfDay: 'MWF',
        tthTime: saturdayHeader ? 'TIME' : tthSlot,
        tthSubject: saturdayHeader ? 'SATURDAY' : '',
        tthUnits: '',
        tthRoom: '',
        tthDay: saturdayHeader ? 'SATURDAY' : 'TTH',
        tthSaturdayHeader: saturdayHeader,
      }
    })

    const shouldUseSavedSchedule =
      Boolean(student?.subject_load_schedule?.trim()) &&
      selectedAcademicYear === (student?.academic_year || '') &&
      Number(selectedSemester || 0) === Number(student?.semester || 0) &&
      Number(selectedProgram || 0) === Number(student?.program || 0) &&
      Number(selectedYearLevel || 0) === Number(student?.year_level || 0) &&
      (selectedSection ? Number(selectedSection) : null) === (student?.section ?? null)

    if (shouldUseSavedSchedule && student?.subject_load_schedule) {
      const parseScheduleSide = (rawSide: string) => {
        const unitsMatch = rawSide.match(/\(([^()]*)\)\s*$/)
        const units = unitsMatch ? unitsMatch[1].trim() : ''
        const withoutUnits =
          unitsMatch && unitsMatch.index !== undefined
            ? rawSide.slice(0, unitsMatch.index).trim()
            : rawSide.trim()
        const separatorIndex = withoutUnits.indexOf(': ')
        if (separatorIndex < 0) return { time: '', subject: withoutUnits.trim(), units }
        return {
          time: withoutUnits.slice(0, separatorIndex).trim(),
          subject: withoutUnits.slice(separatorIndex + 2).trim(),
          units,
        }
      }

      const resolveSubjectMeta = (rawSubject: string) => {
        const subjectText = rawSubject.trim().replace(/\s*-\s*[A-Za-z0-9]+$/, '').trim()
        if (!subjectText) {
          return { code: undefined as string | undefined, title: undefined as string | undefined, units: '', room: '' }
        }
        const matched = subjects
          .filter((subject) => subjectText.startsWith(`${subject.code} `) || subjectText === subject.code)
          .sort((a, b) => b.code.length - a.code.length)[0]
        if (!matched) {
          return { code: undefined as string | undefined, title: undefined as string | undefined, units: '', room: '' }
        }
        const prospectusMatch = resolvedProspectusEntries.find((entry) => entry.subject === matched.id)
        return {
          code: matched.code,
          title: matched.title,
          units: formatUnitsForDisplay(String(matched.units)),
          room: prospectusMatch?.room || '',
        }
      }

      let inSaturdayBlock = false
      const sectionSuffix = selectedSectionData?.name ? ` - ${selectedSectionData.name}` : ''

      student.subject_load_schedule
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .forEach((line) => {
          const normalizedLine = line.replace(/\s+/g, ' ').trim()
          const mwfPrefixMatch = normalizedLine.match(/^MWF\s+/i)
          if (!mwfPrefixMatch) return

          const splitMatch = normalizedLine.match(/\s\|\sTTH\s/i)
          const mwfRaw =
            splitMatch && splitMatch.index !== undefined
              ? normalizedLine.slice(mwfPrefixMatch[0].length, splitMatch.index).trim()
              : normalizedLine.replace(/^MWF\s+/i, '')
          const mwfSide = parseScheduleSide(mwfRaw)

          if (hasSpecificSubject(mwfSide.subject)) {
            const existingIndex = grid.findIndex((row) => row.mwfTime === mwfSide.time && !row.mwfCode)
            const mwfRowIndex = existingIndex >= 0 ? existingIndex : appendMwfRow(grid, mwfSide.time)
            const meta = resolveSubjectMeta(mwfSide.subject)
            grid[mwfRowIndex].mwfSubject = `${meta.code || mwfSide.subject}${meta.title ? ` ${meta.title}` : ''}${sectionSuffix}`.trim()
            grid[mwfRowIndex].mwfUnits = mwfSide.units || meta.units
            grid[mwfRowIndex].mwfRoom = meta.room
            grid[mwfRowIndex].mwfCode = meta.code
            grid[mwfRowIndex].mwfTitle = meta.title
          }

          if (!splitMatch || splitMatch.index === undefined) return

          const tthRaw = normalizedLine.slice(splitMatch.index + splitMatch[0].length).trim()
          const tthSide = parseScheduleSide(tthRaw)
          if (tthSide.time.toUpperCase() === 'TIME' && tthSide.subject.toUpperCase() === 'SATURDAY') {
            inSaturdayBlock = true
            return
          }
          if (!hasSpecificSubject(tthSide.subject)) return

          const existingIndex = grid.findIndex((row) => !row.tthSaturdayHeader && row.tthTime === tthSide.time && !row.tthCode)
          const tthRowIndex = existingIndex >= 0 ? existingIndex : (inSaturdayBlock ? appendSaturdayRow(grid, tthSide.time) : appendTthRow(grid, tthSide.time))

          const meta = resolveSubjectMeta(tthSide.subject)
          grid[tthRowIndex].tthSubject = `${meta.code || tthSide.subject}${meta.title ? ` ${meta.title}` : ''}${sectionSuffix}`.trim()
          grid[tthRowIndex].tthUnits = tthSide.units || meta.units
          grid[tthRowIndex].tthRoom = meta.room
          grid[tthRowIndex].tthDay = inSaturdayBlock ? 'SATURDAY' : 'TTH'
          grid[tthRowIndex].tthCode = meta.code
          grid[tthRowIndex].tthTitle = meta.title
        })

      return grid
    }

    const placeIntoGrid = (row: { code: string; title: string; time: string; room: string }) => {
      const matched = subjects.find((subject) => subject.code === row.code)
      const sectionSuffix = selectedSectionData?.name ? ` - ${selectedSectionData.name}` : ''
      const subjectLabel = `${row.code} ${row.title}${sectionSuffix}`.trim()
      const unitsLabel = matched?.units ? formatUnitsForDisplay(String(matched.units)) : ''
      const placement = parseSubjectTimeSlot(row.time || '')

      if (placement?.day === 'MWF') {
        const existingIndex = grid.findIndex((item) => item.mwfTime.trim() === placement.time && !item.mwfCode)
        const idx = existingIndex >= 0 ? existingIndex : appendMwfRow(grid, placement.time)
        grid[idx].mwfSubject = subjectLabel
        grid[idx].mwfUnits = unitsLabel
        grid[idx].mwfRoom = row.room || ''
        grid[idx].mwfCode = row.code
        grid[idx].mwfTitle = row.title
        return
      }
      if (placement?.day === 'TTH') {
        const existingIndex = grid.findIndex((item) => !item.tthSaturdayHeader && item.tthTime.trim() === placement.time && !item.tthCode)
        const idx = existingIndex >= 0 ? existingIndex : appendTthRow(grid, placement.time)
        grid[idx].tthSubject = subjectLabel
        grid[idx].tthUnits = unitsLabel
        grid[idx].tthRoom = row.room || ''
        grid[idx].tthDay = 'TTH'
        grid[idx].tthCode = row.code
        grid[idx].tthTitle = row.title
        return
      }
      if (placement?.day === 'SATURDAY') {
        const saturdayHeaderIndex = grid.findIndex((item) => item.tthSaturdayHeader)
        const existingIndex = grid.findIndex(
          (item, index) => index > saturdayHeaderIndex && !item.tthSaturdayHeader && item.tthTime.trim() === placement.time && !item.tthCode,
        )
        const idx = existingIndex >= 0 ? existingIndex : appendSaturdayRow(grid, placement.time)
        grid[idx].tthSubject = subjectLabel
        grid[idx].tthUnits = unitsLabel
        grid[idx].tthRoom = row.room || ''
        grid[idx].tthDay = 'SATURDAY'
        grid[idx].tthCode = row.code
        grid[idx].tthTitle = row.title
        return
      }

      const fallbackMwf = grid.findIndex((item) => !item.mwfCode)
      if (fallbackMwf >= 0) {
        grid[fallbackMwf].mwfSubject = subjectLabel
        grid[fallbackMwf].mwfUnits = unitsLabel
        grid[fallbackMwf].mwfRoom = row.room || ''
        grid[fallbackMwf].mwfCode = row.code
        grid[fallbackMwf].mwfTitle = row.title
        return
      }
      const fallbackTth = grid.findIndex((item) => !item.tthSaturdayHeader && !item.tthCode)
      if (fallbackTth >= 0) {
        grid[fallbackTth].tthSubject = subjectLabel
        grid[fallbackTth].tthUnits = unitsLabel
        grid[fallbackTth].tthRoom = row.room || ''
        grid[fallbackTth].tthDay = 'TTH'
        grid[fallbackTth].tthCode = row.code
        grid[fallbackTth].tthTitle = row.title
      }
    }

    scheduleRows.forEach((row) => placeIntoGrid(row))

    return grid
  }, [scheduleRows, selectedSectionData, selectedAcademicYear, selectedProgram, selectedSection, selectedSemester, selectedYearLevel, student, subjects, resolvedProspectusEntries])

  useEffect(() => {
    setContinuingScheduleGrid(computedContinuingScheduleGrid)
    setDraggingCell(null)
    setDropTarget(null)
  }, [computedContinuingScheduleGrid])

  useEffect(() => {
    continuingScheduleGridRef.current = continuingScheduleGrid
  }, [continuingScheduleGrid])

  const getScheduleCellKeys = (column: ScheduleColumn) =>
    column === 'mwf'
      ? ({ subjectKey: 'mwfSubject', unitsKey: 'mwfUnits', roomKey: 'mwfRoom', codeKey: 'mwfCode', titleKey: 'mwfTitle' } as const)
      : ({ subjectKey: 'tthSubject', unitsKey: 'tthUnits', roomKey: 'tthRoom', codeKey: 'tthCode', titleKey: 'tthTitle' } as const)

  const isScheduleCellDraggable = (rowIndex: number, column: ScheduleColumn): boolean => {
    const row = continuingScheduleGrid[rowIndex]
    if (!row) return false
    if (column === 'tth' && row.tthSaturdayHeader) return false
    const { codeKey, titleKey } = getScheduleCellKeys(column)
    return Boolean(row[codeKey] && row[titleKey])
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
    const row = continuingScheduleGrid[rowIndex]
    if (!draggingCell || !row) return
    if (column === 'tth' && row.tthSaturdayHeader) return
    event.preventDefault()
    setDropTarget({ rowIndex, column })
    event.dataTransfer.dropEffect = 'move'
  }

  const onScheduleDrop = (event: DragEvent<HTMLInputElement>, rowIndex: number, column: ScheduleColumn) => {
    event.preventDefault()
    const row = continuingScheduleGrid[rowIndex]
    if (!draggingCell || !row) return
    if (column === 'tth' && row.tthSaturdayHeader) return

    const source = draggingCell
    setContinuingScheduleGrid((current) => {
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
      const sourceCode = sourceRow[sourceKeys.codeKey]
      const sourceTitle = sourceRow[sourceKeys.titleKey]
      const sourceRoom = sourceRow[sourceKeys.roomKey]
      const targetSubject = targetRow[targetKeys.subjectKey]
      const targetUnits = targetRow[targetKeys.unitsKey]
      const targetCode = targetRow[targetKeys.codeKey]
      const targetTitle = targetRow[targetKeys.titleKey]
      const targetRoom = targetRow[targetKeys.roomKey]

      if (source.rowIndex === rowIndex) {
        return current.map((rowItem, idx) => {
          if (idx !== rowIndex) return rowItem
          return {
            ...rowItem,
            [sourceKeys.subjectKey]: targetSubject,
            [sourceKeys.unitsKey]: targetUnits,
            [sourceKeys.roomKey]: targetRoom,
            [sourceKeys.codeKey]: targetCode,
            [sourceKeys.titleKey]: targetTitle,
            [targetKeys.subjectKey]: sourceSubject,
            [targetKeys.unitsKey]: sourceUnits,
            [targetKeys.roomKey]: sourceRoom,
            [targetKeys.codeKey]: sourceCode,
            [targetKeys.titleKey]: sourceTitle,
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
            [sourceKeys.codeKey]: targetCode,
            [sourceKeys.titleKey]: targetTitle,
          }
        }
        if (idx === rowIndex) {
          return {
            ...rowItem,
            [targetKeys.subjectKey]: sourceSubject,
            [targetKeys.unitsKey]: sourceUnits,
            [targetKeys.roomKey]: sourceRoom,
            [targetKeys.codeKey]: sourceCode,
            [targetKeys.titleKey]: sourceTitle,
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
    setContinuingScheduleGrid((current) => {
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
          [sourceKeys.codeKey]: undefined,
          [sourceKeys.titleKey]: undefined,
        }
      })
    })

    setDraggingCell(null)
    setDropTarget(null)
    setIsTrashDropActive(false)
  }

  const continuingDisplayScheduleRows = useMemo<ContinuingDisplayScheduleRow[]>(() => {
    const rows: ContinuingDisplayScheduleRow[] = []

    continuingScheduleGrid.forEach((row, rowIndex) => {
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
          dayLabel: row.tthDay,
          time: row.tthTime,
          subject: row.tthSubject,
          units: row.tthUnits,
          room: row.tthRoom,
        })
      }
    })

    const dayOrder: Record<ContinuingDisplayScheduleRow['dayLabel'], number> = {
      MWF: 0,
      TTH: 1,
      SATURDAY: 2,
    }

    return rows.sort((a, b) => {
      const dayDiff = dayOrder[a.dayLabel] - dayOrder[b.dayLabel]
      if (dayDiff !== 0) return dayDiff
      return a.rowIndex - b.rowIndex
    })
  }, [continuingScheduleGrid])

  const saveChanges = async () => {
    if (!student) return
    setError('')
    setSuccess('')
    try {
      await api.post('/continuing/promote/', {
        student_ids: [student.student_id],
        target_program: Number(selectedProgram),
        target_year_level: Number(selectedYearLevel),
        target_academic_year: selectedAcademicYear,
        target_semester: Number(selectedSemester),
        target_section: selectedSection ? Number(selectedSection) : null,
        admission_date: student.admission_date || continuingFormDate || null,
        subject_load_schedule: buildScheduleText(continuingScheduleGridRef.current),
        adviser_name: resolvedAdviserName,
        adviser_approval_status: selectedAdviserStatus,
        adviser_approval_date: continuingFormDate || null,
        dean_name: resolvedDeanName,
        dean_approval_status: selectedDeanStatus,
        dean_approval_date: continuingFormDate || null,
      })
      const refreshed = await api.get<StudentDetail>(`/students/${student.student_id}/`)
      setStudent(refreshed.data)
      setSuccess('Student changes saved with academic history tracking.')
      if (shouldCloseOnSaveContinuing) {
        await loadReferenceData()
        closeModal()
      }
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const promoteStudent = async () => {
    if (!student) return
    setError('')
    setSuccess('')

    if (!selectedYearLevel || !selectedProgram || !selectedAcademicYear || !selectedSemester || !selectedSection) {
      setError('Please fill all target academic details.')
      return
    }

    try {
      const matchedTerm = terms.find(
        (term) => term.year_label === selectedAcademicYear && Number(term.semester) === Number(selectedSemester)
      )
      if (!matchedTerm) {
        setError('No matching Academic Term found. Create/activate term first in Admin.')
        return
      }

      await api.post('/continuing/promote/', {
        student_ids: [student.student_id],
        target_program: Number(selectedProgram),
        target_year_level: Number(selectedYearLevel),
        target_academic_year: selectedAcademicYear,
        target_semester: Number(selectedSemester),
        target_section: selectedSection ? Number(selectedSection) : null,
        admission_date: student.admission_date || continuingFormDate || null,
        subject_load_schedule: buildScheduleText(continuingScheduleGridRef.current),
        adviser_name: resolvedAdviserName,
        adviser_approval_status: selectedAdviserStatus,
        adviser_approval_date: continuingFormDate || null,
        dean_name: resolvedDeanName,
        dean_approval_status: selectedDeanStatus,
        dean_approval_date: continuingFormDate || null,
        term_id: matchedTerm.id,
      })

      const refreshed = await api.get<StudentDetail>(`/students/${student.student_id}/`)
      setStudent(refreshed.data)
      setSuccess('Student promoted with academic history tracking.')
      if (shouldCloseOnSaveContinuing) {
        await loadReferenceData()
        closeModal()
      }
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const approveAndFinalizeSchedule = async () => {
    if (!student) return
    setError('')
    setSuccess('')
    try {
      const scheduleText = buildScheduleText(continuingScheduleGridRef.current)
      await api.patch(`/students/${student.student_id}/`, {
        adviser_name: resolvedAdviserName,
        adviser_approval_status: 'approved',
        adviser_approval_date: continuingFormDate || null,
        dean_name: resolvedDeanName,
        dean_approval_status: 'approved',
        dean_approval_date: continuingFormDate || null,
        admission_date: student.admission_date || continuingFormDate || null,
        subject_load_schedule: scheduleText,
        academic_year: selectedAcademicYear,
        semester: Number(selectedSemester),
      })

      // Keep current semester history in sync with finalized schedule/approvals.
      try {
        const historyResponse = await api.get<AcademicHistoryRecord[]>('/academic-history/')
        const matchedHistory = historyResponse.data.find(
          (history) =>
            history.student === student.id &&
            history.academic_year === selectedAcademicYear &&
            Number(history.semester) === Number(selectedSemester),
        )
        if (matchedHistory) {
          await api.patch(`/academic-history/${matchedHistory.id}/`, {
            adviser_name: resolvedAdviserName,
            adviser_approval_status: 'approved',
            adviser_approval_date: continuingFormDate || null,
            dean_name: resolvedDeanName,
            dean_approval_status: 'approved',
            dean_approval_date: continuingFormDate || null,
            subject_load_schedule: scheduleText,
            status: 'ongoing',
          })
        }
      } catch (historySyncErr) {
        // Non-blocking: student update remains the source of truth if history sync fails.
      }

      const refreshed = await api.get<StudentDetail>(`/students/${student.student_id}/`)
      setStudent(refreshed.data)
      setSuccess('Schedule approved and finalized.')
      if (shouldCloseOnSaveContinuing) {
        await loadReferenceData()
        closeModal()
      }
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const openModal = () => {
    setIsModalOpen(true)
    setStudent(null)
    setSearchId('')
    setSelectedAdviserStatus('approved')
    setSelectedDeanStatus('approved')
    setSuccess('')
    setError('')
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setIncSubjectCodes('')
    setIncSectionPageRef('')
    setNotesStudentSignature('')
    setNotesSignatureDate('')
    setNotesAdviserName('')
  }

  const handleSelectStudent = async (studentId: string) => {
    setError('')
    setSuccess('')
    setIsSlipLoading(true)
    try {
      const response = await api.get<StudentDetail>(`/students/${studentId}/`)
      const selected = response.data
      setSlipStudent(selected)

      let resolvedStatus = 'ON-GOING'
      let resolvedScholarship = selected.scholarship || ''
      let resolvedDateOfBirth = selected.date_of_birth
      try {
        const historyResponse = await api.get<AcademicHistoryRecord[]>('/academic-history/')
        const matchedHistory = historyResponse.data.find(
          (history) =>
            history.student === selected.id &&
            history.academic_year === selected.academic_year &&
            Number(history.semester) === Number(selected.semester),
        )
        if (matchedHistory) {
          resolvedStatus = formatStatusForSlip(matchedHistory.status)
          if (!resolvedScholarship) resolvedScholarship = matchedHistory.scholarship || ''
          if (!resolvedDateOfBirth) resolvedDateOfBirth = matchedHistory.date_of_birth
        }
      } catch (historyErr) {
        resolvedStatus = 'ON-GOING'
      }

      setSlipStatus(resolvedStatus)
      setSlipScholarship(resolvedScholarship || DEFAULT_SCHOLARSHIP_LABEL)
      setSlipDateOfBirth(resolvedDateOfBirth)
      setIsSlipModalOpen(true)
    } catch (err) {
      setSlipStudent(null)
      setError(getErrorMessage(err))
    } finally {
      setIsSlipLoading(false)
    }
  }

  const slipProgram = useMemo(
    () => (slipStudent ? programs.find((program) => program.id === slipStudent.program) : null),
    [slipStudent, programs],
  )

  const slipDepartment = useMemo(
    () => (slipProgram ? departments.find((department) => department.id === slipProgram.department) : null),
    [slipProgram, departments],
  )

  const slipCurrentSemesterLoads = useMemo(() => {
    if (!slipStudent || !slipStudent.academic_year || !slipStudent.semester) return [] as StudentLoad[]
    const currentTermLabel = `${slipStudent.academic_year} - Sem ${slipStudent.semester}`
    return slipStudent.loads.filter((load) => load.term_label === currentTermLabel && load.status === 'enrolled')
  }, [slipStudent])

  const slipRowsFromSavedSchedule = useMemo(() => {
    if (!slipStudent?.subject_load_schedule) return [] as SlipScheduleRow[]
    const exactEntries = prospectusEntries.filter(
      (entry) =>
        entry.program === slipStudent.program &&
        entry.year_level === slipStudent.year_level &&
        entry.semester === (slipStudent.semester || 0) &&
        entry.academic_year === (slipStudent.academic_year || '') &&
        entry.section === (slipStudent.section ?? null),
    )
    const fallbackEntries = prospectusEntries.filter(
      (entry) =>
        entry.program === slipStudent.program &&
        entry.year_level === slipStudent.year_level &&
        entry.semester === (slipStudent.semester || 0) &&
        entry.academic_year === '' &&
        entry.section === null,
    )
    const slipEntryPool = exactEntries.length ? exactEntries : fallbackEntries

    const rowMap = new Map<string, {
      code: string
      title: string
      units: string
      schedule: string[]
      room: string
    }>()
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
      if (!subjectText) return { code: '-', title: '-', keyText: '', room: '-' }

      const normalizedSubject = subjectText
        .replace(/^\d{1,2}:\d{2}(?:-\d{1,2}:\d{2}(?:\s?(?:AM|PM))?)?:\s*/i, '')
        .replace(/\s*-\s*[A-Za-z0-9]+$/, '')
        .trim()

      const matched = subjects
        .filter((subject) => normalizedSubject.startsWith(`${subject.code} `) || normalizedSubject === subject.code)
        .sort((a, b) => b.code.length - a.code.length)[0]

      if (matched) {
        const matchedEntry = slipEntryPool.find((entry) => entry.subject === matched.id)
        return { code: matched.code, title: matched.title, keyText: `${matched.code}|${matched.title}`, room: matchedEntry?.room || '-' }
      }

      const fallbackTokens = normalizedSubject.split(/\s+/)
      const fallbackCode = fallbackTokens.slice(0, 2).join(' ') || '-'
      const fallbackTitle = fallbackTokens.slice(2).join(' ') || normalizedSubject
      return { code: fallbackCode, title: fallbackTitle, keyText: `${fallbackCode}|${fallbackTitle}`, room: '-' }
    }

    const upsertScheduleRow = (dayLabel: 'MWF' | 'TTH' | 'SATURDAY', time: string, subjectRaw: string, unitsRaw: string) => {
      const subjectText = subjectRaw.trim()
      if (!hasSpecificSubject(subjectText)) return

      const { code, title, keyText, room } = toSubjectParts(subjectText)
      if (!keyText) return

      const key = `${keyText}|${unitsRaw.trim()}`
      const scheduleLabel = `${dayLabel} ${time.trim()}`
      const existing = rowMap.get(key)
      if (existing) {
        if (!existing.schedule.includes(scheduleLabel)) existing.schedule.push(scheduleLabel)
        return
      }

      rowMap.set(key, {
        code,
        title,
        units: unitsRaw.trim() ? formatUnitsForDisplay(unitsRaw.trim()) : '-',
        schedule: [scheduleLabel],
        room,
      })
    }

    slipStudent.subject_load_schedule
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        const normalizedLine = line.replace(/\s+/g, ' ').trim()
        const mwfPrefixMatch = normalizedLine.match(/^MWF\s+/i)
        if (!mwfPrefixMatch) {
          const legacyMatch = normalizedLine.match(/^(.+?)\s*-\s*(.+)$/)
          const code = legacyMatch ? legacyMatch[1].trim() : normalizedLine
          const title = legacyMatch ? legacyMatch[2].trim() : ''
          const matchedSubject = subjects.find((subject) => subject.code === code || subject.title === title)
          rowMap.set(`${code}|${title}|legacy`, {
            code,
            title: title || matchedSubject?.title || '-',
            units: matchedSubject?.units ? formatUnitsForDisplay(String(matchedSubject.units)) : '-',
            schedule: ['-'],
            room: slipEntryPool.find((entry) => entry.subject === matchedSubject?.id)?.room || '-',
          })
          return
        }

        const splitMatch = normalizedLine.match(/\s\|\sTTH\s/i)
        if (!splitMatch || splitMatch.index === undefined) {
          const mwfOnlyRaw = normalizedLine.replace(/^MWF\s+/i, '')
          const mwfOnly = parseScheduleSide(mwfOnlyRaw)
          upsertScheduleRow('MWF', mwfOnly.time, mwfOnly.subject, mwfOnly.units)
          return
        }

        const splitIndex = splitMatch.index
        const splitTokenLength = splitMatch[0].length
        const mwfSideRaw = normalizedLine.slice(mwfPrefixMatch[0].length, splitIndex).trim()
        const tthSideRaw = normalizedLine.slice(splitIndex + splitTokenLength).trim()
        const mwfSide = parseScheduleSide(mwfSideRaw)
        const tthSide = parseScheduleSide(tthSideRaw)
        upsertScheduleRow('MWF', mwfSide.time, mwfSide.subject, mwfSide.units)

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
      title: row.title,
      units: row.units,
      schedule: row.schedule.join(', '),
      room: row.room,
    }))
  }, [slipStudent, subjects, prospectusEntries])

  const slipDisplayRows = useMemo(() => {
    if (slipRowsFromSavedSchedule.length) {
      return slipRowsFromSavedSchedule
    }
    if (slipCurrentSemesterLoads.length) {
      return slipCurrentSemesterLoads.map((load) => {
        const matchedSubject = subjects.find((subject) => subject.id === load.subject_id || subject.code === load.subject_code)
        const matchedEntry = prospectusEntries.find(
          (entry) =>
            slipStudent &&
            entry.program === slipStudent.program &&
            entry.year_level === slipStudent.year_level &&
            entry.semester === (slipStudent.semester || 0) &&
            entry.subject === (matchedSubject?.id || load.subject_id) &&
            ((entry.academic_year === (slipStudent.academic_year || '') && entry.section === (slipStudent.section ?? null)) ||
              (entry.academic_year === '' && entry.section === null)),
        )
        return {
          code: load.subject_code,
          title: load.subject_title,
          units: matchedSubject?.units ? formatUnitsForDisplay(String(matchedSubject.units)) : '-',
          schedule: '-',
          room: matchedEntry?.room || '-',
        } as SlipScheduleRow
      })
    }
    return []
  }, [slipCurrentSemesterLoads, slipRowsFromSavedSchedule, subjects, prospectusEntries, slipStudent])

  const slipTotalUnits = useMemo(() => {
    return slipDisplayRows.reduce((total, row) => {
      const units = Number(row.units)
      return total + (Number.isFinite(units) ? units : 0)
    }, 0)
  }, [slipDisplayRows])
  const getSemesterLabel = (semester: number | null | undefined): string => {
    if (semester === 1) return '1st Semester'
    if (semester === 2) return '2nd Semester'
    if (semester === 3) return 'Summer'
    return '-'
  }

  const groupedContinuingStudents = useMemo(() => {
    type GroupedNode = {
      key: string
      statusKey: string
      programId: number
      programName: string
      academicYear: string
      yearLevel: number
      semester: number | null
      sectionId: number | null
      sectionName: string
      students: StudentDetail[]
      totalStudents: number
    }

    const groupMap = new Map<string, StudentDetail[]>()
    const groupMeta = new Map<
      string,
      {
        statusKey: string
        programId: number
        programName: string
        academicYear: string
        yearLevel: number
        semester: number | null
        sectionId: number | null
        sectionName: string
      }
    >()

    allStudents.forEach((studentItem) => {
      const programId = Number(studentItem.program || 0)
      const programName = programs.find((program) => program.id === studentItem.program)?.name || 'Unknown Program'
      const academicYear = studentItem.academic_year || '-'
      const yearLevel = Number(studentItem.year_level || 0)
      const semester = studentItem.semester ?? null
      const sectionId = studentItem.section ?? null
      const sectionName = sections.find((section) => section.id === sectionId)?.name || 'Unassigned'
      const groupKey = `${programName}|${academicYear}|${yearLevel}|${sectionName}|${semester ?? 'none'}`
      const statusKey = buildContinuingFolderStatusKey(programId, academicYear, yearLevel, sectionId, semester)

      if (!groupMap.has(groupKey)) {
        groupMap.set(groupKey, [])
        groupMeta.set(groupKey, { statusKey, programId, programName, academicYear, yearLevel, semester, sectionId, sectionName })
      }
      groupMap.get(groupKey)!.push(studentItem)
    })

    const sortSemester = (semester: number | null) => (semester === null ? 99 : semester)
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
  }, [allStudents, programs, sections])

  const onFolderToggle = (key: string, isOpen: boolean) => {
    setOpenFolders((current) => ({ ...current, [key]: isOpen }))
  }

  const isFolderOpen = (key: string, index: number) => {
    if (Object.prototype.hasOwnProperty.call(openFolders, key)) {
      return openFolders[key]
    }
    return index === 0
  }

  const getFolderStatusLabel = (status: ContinuingFolderStatus['status'] | undefined) => {
    return status === 'done' ? 'Done' : 'Ongoing'
  }

  const updateFolderStatus = async (group: {
    statusKey: string
    programId: number
    academicYear: string
    yearLevel: number
    semester: number | null
    sectionId: number | null
    programName: string
    sectionName: string
  }) => {
    const currentStatus = folderStatuses[group.statusKey]?.status ?? 'ongoing'
    const nextStatus: ContinuingFolderStatus['status'] = currentStatus === 'done' ? 'ongoing' : 'done'

    setSavingFolderStatuses((current) => ({ ...current, [group.statusKey]: true }))
    setError('')
    setSuccess('')

    try {
      const response = await api.post<ContinuingFolderStatus>('/continuing/folder-statuses/', {
        program: group.programId,
        academic_year: group.academicYear,
        year_level: group.yearLevel,
        semester: group.semester,
        section: group.sectionId,
        status: nextStatus,
      })

      setFolderStatuses((current) => ({
        ...current,
        [group.statusKey]: response.data,
      }))
      setSuccess(
        `${group.programName} | ${group.sectionName} marked as ${getFolderStatusLabel(nextStatus).toLowerCase()}.`,
      )
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSavingFolderStatuses((current) => ({ ...current, [group.statusKey]: false }))
    }
  }

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
        <div className={getLoadSlipCellClassName(slipStudent?.student_id)}>
          <span>Student ID Number:</span>{' '}
          <span className="load-slip-student-id-value">{slipStudent?.student_id || '-'}</span>
        </div>
        <div className={getLoadSlipCellClassName(slipDepartment?.name)}><span>Department:</span> <span className={getLoadSlipValueClassName(slipDepartment?.name)}>{slipDepartment?.name || '-'}</span></div>
        <div className={getLoadSlipCellClassName(slipStudent?.academic_year)}><span>School Year:</span> <span className={getLoadSlipValueClassName(slipStudent?.academic_year)}>{slipStudent?.academic_year || '-'}</span></div>
        <div className={getLoadSlipCellClassName(slipStudent ? formatStudentNameForSlip(slipStudent.last_name, slipStudent.first_name, slipStudent.middle_name, isPrintingLoadSlip) : '-')}><span>Name:</span> <span className={getLoadSlipValueClassName(slipStudent ? formatStudentNameForSlip(slipStudent.last_name, slipStudent.first_name, slipStudent.middle_name, isPrintingLoadSlip) : '-')}>{slipStudent ? formatStudentNameForSlip(slipStudent.last_name, slipStudent.first_name, slipStudent.middle_name, isPrintingLoadSlip) : '-'}</span></div>
        <div className="load-slip-grid-cell"><span>Program:</span> <span className="load-slip-grid-value">{slipProgram?.name || '-'}</span></div>
        <div className={getLoadSlipCellClassName(slipStudent?.semester)}><span>Semester:</span> <span className={getLoadSlipValueClassName(slipStudent?.semester)}>{slipStudent?.semester || '-'}</span></div>
        <div className={getLoadSlipCellClassName(formatDateValue(slipDateOfBirth))}><span>Date of Birth:</span> <span className={getLoadSlipValueClassName(formatDateValue(slipDateOfBirth))}>{formatDateValue(slipDateOfBirth)}</span></div>
        <div className={getLoadSlipCellClassName(slipStudent?.year_level)}><span>Year Level:</span> <span className={getLoadSlipValueClassName(slipStudent?.year_level)}>{slipStudent?.year_level || '-'}</span></div>
        <div className={getLoadSlipCellClassName(slipScholarship)}><span>Scholarship:</span> <span className={getLoadSlipValueClassName(slipScholarship)}>{slipScholarship || '-'}</span></div>
        <div className={getLoadSlipCellClassName(slipStudent?.gender)}><span>Gender:</span> <span className={getLoadSlipValueClassName(slipStudent?.gender)}>{slipStudent?.gender || '-'}</span></div>
        <div className={getLoadSlipCellClassName(slipStudent ? (sections.find((s) => s.id === slipStudent.section)?.name || '-') : '-')}><span>Section:</span> <span className={getLoadSlipValueClassName(slipStudent ? (sections.find((s) => s.id === slipStudent.section)?.name || '-') : '-')}>{slipStudent ? (sections.find((s) => s.id === slipStudent.section)?.name || '-') : '-'}</span></div>
        <div className={getLoadSlipCellClassName(slipStatus)}><span>Status:</span> <span className={getLoadSlipValueClassName(slipStatus)}>{slipStatus}</span></div>
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
            {slipDisplayRows.map((row, index) => {
              return (
                <tr key={`${copyLabel}-${row.code}-${index}`}>
                  <td><span className="load-slip-table-value">{row.code}</span></td>
                  <td><span className="load-slip-table-value">{row.title}</span></td>
                  <td><span className="load-slip-table-value">{slipStudent ? (sections.find((s) => s.id === slipStudent.section)?.name || '-') : '-'}</span></td>
                  <td><span className="load-slip-table-value">{row.units}</span></td>
                  <td><span className="load-slip-table-value">{row.schedule}</span></td>
                  <td><span className="load-slip-table-value">{row.room}</span></td>
                </tr>
              )
            })}
            {!slipDisplayRows.length && (
              <tr>
                <td colSpan={6}>No current enrolled subjects found for this student.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="load-slip-summary">
        <div><span>Total Subjects:</span> {slipDisplayRows.length}</div>
        <div><span>Total Units:</span> {slipTotalUnits}</div>
        <div><span>Date Enrolled:</span> {slipStudent?.admission_date || '-'}</div>
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

  return (
    <section className="card">
      <h1>Continuing Module</h1>
      <p>Manage continuing students and subject loads.</p>

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
        <button type="button" onClick={openModal} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <ContinuingIcon /> Process Continuing Student
        </button>
      </div>

      <h2 className="section-title">Student List</h2>
      <div className="continuing-folder-list">
        {groupedContinuingStudents.map((group, index) => {
          const currentFolderStatus = folderStatuses[group.statusKey]
          const currentFolderStatusLabel = getFolderStatusLabel(currentFolderStatus?.status)
          const isSavingFolderStatus = Boolean(savingFolderStatuses[group.statusKey])

          return (
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
                <span className="continuing-folder-actions" onClick={(e) => e.stopPropagation()}>
                  <div className="continuing-folder-report-wrap">
                    <button
                      type="button"
                      className="continuing-folder-action-btn continuing-folder-report-btn"
                      onClick={() => setReportMenuOpen((k) => (k === group.key ? null : group.key))}
                      title="Generate student report"
                    >
                      Report
                    </button>
                    {reportMenuOpen === group.key && (
                      <div className="continuing-folder-report-menu">
                        <button
                          type="button"
                          onClick={() => {
                            generateReportPDF(group, sections)
                            setReportMenuOpen(null)
                          }}
                          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        >
                          <PdfIcon /> Export as PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            generateReportExcel(group, sections)
                            setReportMenuOpen(null)
                          }}
                          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                        >
                          <ExcelIcon /> Export as Excel
                        </button>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className={`continuing-folder-action-btn continuing-folder-status-btn is-${currentFolderStatus?.status ?? 'ongoing'}`}
                    onClick={() => {
                      void updateFolderStatus(group)
                    }}
                    disabled={isSavingFolderStatus}
                    title={currentFolderStatus?.updated_by_username ? `Last updated by ${currentFolderStatus.updated_by_username}` : undefined}
                  >
                    {isSavingFolderStatus ? 'Saving...' : currentFolderStatus?.status === 'done' ? 'Mark Ongoing' : 'Done'}
                  </button>
                </span>
                <span className={`continuing-folder-status-badge is-${currentFolderStatus?.status ?? 'ongoing'}`}>
                  {currentFolderStatusLabel}
                </span>
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
                      <th colSpan={4}>
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
                            disabled={isSlipLoading}
                          >
                            <SearchIcon /> Search
                          </button>
                        </form>
                      </th>
                    </tr>
                    <tr>
                      <th>Student ID</th>
                      <th>Name</th>
                      <th>Gender</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.students.map((studentItem) => {
                      const genderIconPath = getGenderIconPath(studentItem.gender)
                      return (
                        <tr key={studentItem.id}>
                          <td>
                            {genderIconPath && (
                              <span className="gender-badge-image-wrap" aria-hidden="true">
                                <img src={genderIconPath} alt="" className="gender-badge-image" />
                              </span>
                            )}
                            <span className="student-id-with-gender">{studentItem.student_id}</span>
                          </td>
                          <td>{studentItem.last_name}, {studentItem.first_name} {studentItem.middle_name || ''}.</td>
                          <td>{studentItem.gender || '-'}</td>
                          <td>
                            <button type="button" onClick={() => { void handleSelectStudent(studentItem.student_id) }} disabled={isSlipLoading}>
                              Select
                            </button>
                            <button type="button" onClick={() => { void openEditStudent(studentItem.student_id) }}>
                              Edit
                            </button>
                            <button type="button" onClick={() => requestDeleteStudent(studentItem.student_id)}>
                              Delete
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </details>
          )
        })}
        {!groupedContinuingStudents.length && (
          <div className="table-wrap">
            <table>
              <tbody>
                <tr><td>No continuing students found.</td></tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isSlipModalOpen && (
        <div className="enroll-modal-overlay" onClick={(e) => e.stopPropagation()}>
          <div className="enroll-modal load-slip-modal" onClick={(e) => e.stopPropagation()}>
            <div className="enroll-modal-header">
              <h2>Enrollment Load Slip</h2>
              <div className="modal-header-actions">
                <button type="button" onClick={printLoadSlip}>
                  Print
                </button>
                <button type="button" onClick={() => setIsSlipModalOpen(false)}>
                  Close
                </button>
              </div>
            </div>
            {!slipStudent ? (
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

      {isModalOpen && (
        <div className="enroll-modal-overlay">
          <div className="enroll-modal" style={{ overflowY: 'auto', maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>
            <div className="enroll-modal-header">
              <h2>Continuing Form</h2>
              <div className="modal-header-actions">
                <label className="toggle-switch" aria-label="Close on save">
                  <input
                    type="checkbox"
                    checked={shouldCloseOnSaveContinuing}
                    onChange={(e) => setShouldCloseOnSaveContinuing(e.target.checked)}
                  />
                  <span className="toggle-track" aria-hidden="true">
                    <span className="toggle-thumb" aria-hidden="true" />
                  </span>
                  <span className="toggle-text">Close on save</span>
                </label>
                <button type="button" onClick={closeModal}>
                  Close
                </button>
              </div>
            </div>

            <div className="enroll-sheet-form continuing-sheet-form">
              <div className="continuing-date-row">
                <strong>DATE:</strong>
                <input type="date" value={continuingFormDate} onChange={(e) => setContinuingFormDate(e.target.value)} />
              </div>

              <div className="continuing-form-title">
                <h3>ENROLLMENT FORM</h3>
                <p>(FOR CONTINUING STUDENTS)</p>
              </div>

              <div className="sheet-section-title">Search Student</div>
              <form onSubmit={searchStudent} className="continuing-search-row">
                <input
                  type="text"
                  placeholder="Enter Student ID to search"
                  value={searchId}
                  onChange={(e) => setSearchId(e.target.value)}
                  required
                  className="continuing-search-input"
                />
                <button type="submit" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' }}>
                  <SearchIcon /> Load
                </button>
              </form>

              {student && (
                <>
                  <div className="sheet-section-title">Student's Information</div>
                  <div className="continuing-grid">
                    <input placeholder="Last Name" value={student.last_name || ''} readOnly />
                    <input placeholder="First Name" value={student.first_name || ''} readOnly />
                    <input placeholder="Middle Name" value={student.middle_name || ''} readOnly />
                    <input placeholder="Name Ext. (e.g. Jr.)" value={student.extension_name || ''} readOnly />

                    <select value={selectedProgram} onChange={(e) => setSelectedProgram(e.target.value)}>
                      <option value="">Course/Program</option>
                      {programs.map((program) => (
                        <option key={program.id} value={program.id}>
                          {program.name}
                        </option>
                      ))}
                    </select>
                    <input placeholder="ID Number" value={student.student_id} readOnly />

                    <select value={selectedYearLevel} onChange={(e) => setSelectedYearLevel(e.target.value)}>
                      <option value="">Year Level</option>
                      <option value="1">Year 1</option>
                      <option value="2">Year 2</option>
                      <option value="3">Year 3</option>
                      <option value="4">Year 4</option>
                    </select>
                    <select value={selectedAcademicYear} onChange={(e) => setSelectedAcademicYear(e.target.value)}>
                      <option value="">Academic Year</option>
                      {academicYearOptions.map((yearLabel) => (
                        <option key={yearLabel} value={yearLabel}>
                          {yearLabel}
                        </option>
                      ))}
                    </select>

                    <select value={selectedSemester} onChange={(e) => setSelectedSemester(e.target.value)}>
                      <option value="1">1st Semester</option>
                      <option value="2">2nd Semester</option>
                      <option value="3">Summer</option>
                    </select>
                    <select
                      value={selectedSection}
                      onChange={(e) => setSelectedSection(e.target.value)}
                      disabled={!hasRequiredSectionFilters || !hasMatchingAcademicTerm || !filteredSections.length}
                    >
                      <option value="">{sectionPlaceholder}</option>
                      {filteredSections.map((section) => (
                        <option key={section.id} value={section.id}>
                          {section.name} (Year {section.year_level}, Sem {section.semester})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="continuing-notes">
                    <div className="continuing-notes-agreement">
                      <p>
                        I promise to comply with the requirements in{' '}
                        <span className="continuing-notes-input-wrap">
                          <input
                            type="text"
                            className="continuing-notes-inline-input"
                            placeholder="(state subject codes)"
                            value={incSubjectCodes}
                            onChange={(e) => setIncSubjectCodes(e.target.value)}
                          />
                        </span>{' '}
                        on or before the end of the next semester in compliance with the prescribed period under{' '}
                        <span className="continuing-notes-section-ref">
                          <input
                            type="text"
                            className="continuing-notes-inline-input continuing-notes-section-input"
                            placeholder="(Section & page #)"
                            value={incSectionPageRef}
                            onChange={(e) => setIncSectionPageRef(e.target.value)}
                          />
                        </span>{' '}
                        of the CCB Student Handbook. I am fully aware that if I fail to comply the requirements of my subject(s) with INC, my INCOMPLETE MARK will automatically result to a FAILURE (5.0) and all the grades in the subjects I will take this semester where the abovementioned subject(s) is a prerequisite will not be credited.
                      </p>
                    </div>
                    <div className="continuing-notes-endorsed">Endorsed by:</div>
                    <div className="continuing-sign-row">
                      <div className="continuing-sign-field">
                        <input
                          type="text"
                          className="continuing-sign-input"
                          placeholder=" "
                          value={notesStudentSignature}
                          onChange={(e) => setNotesStudentSignature(e.target.value)}
                        />
                        <label>Signature over printed Name of Student</label>
                      </div>
                      <div className="continuing-sign-field">
                        <input
                          type="text"
                          className="continuing-sign-input"
                          placeholder=" "
                          value={notesSignatureDate}
                          onChange={(e) => setNotesSignatureDate(e.target.value)}
                        />
                        <label>Date</label>
                      </div>
                      <div className="continuing-sign-field">
                        <input
                          type="text"
                          className="continuing-sign-input"
                          placeholder=" "
                          value={notesAdviserName}
                          onChange={(e) => setNotesAdviserName(e.target.value)}
                        />
                        <label>Adviser</label>
                      </div>
                    </div>
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
                          <th>UNITS</th>
                          <th>ROOM</th>
                        </tr>
                      </thead>
                      <tbody>
                        {continuingDisplayScheduleRows.length ? (
                          continuingDisplayScheduleRows.map((row) => {
                            return (
                              <tr key={`continuing-display-row-${row.rowIndex}-${row.column}`}>
                                <td><input value={row.dayLabel} readOnly /></td>
                                <td><input className="schedule-time-input" value={row.time} readOnly /></td>
                                <td>
                                  <input
                                    value={row.subject}
                                    readOnly
                                    draggable={isScheduleCellDraggable(row.rowIndex, row.column)}
                                    onDragStart={(e) => onScheduleDragStart(e, row.rowIndex, row.column)}
                                    onDragEnd={onScheduleDragEnd}
                                  />
                                </td>
                                <td><input value={row.units} readOnly /></td>
                                <td><input value={row.room} readOnly /></td>
                              </tr>
                            )
                          })
                        ) : (
                          <tr>
                            <td colSpan={5}>No mapped schedule for the selected Program/Year/Semester/Academic Year/Section.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="continuing-summary-row">
                    <span><strong>Remarks:</strong></span>
                    <span><strong>Total Units:</strong> {continuingTotalUnits}</span>
                    <span><strong>Total Subject/s:</strong> {continuingTotalSubjects}</span>
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
                        <td>{resolvedAdviserName || '-'}</td>
                        <td>
                          <select value={selectedAdviserStatus} onChange={(e) => setSelectedAdviserStatus(e.target.value)}>
                            <option value="pending">Pending</option>
                            <option value="approved">Approved</option>
                            <option value="rejected">Rejected</option>
                          </select>
                        </td>
                        <td><input type="date" value={continuingFormDate} onChange={(e) => setContinuingFormDate(e.target.value)} /></td>
                      </tr>
                      <tr>
                        <td><strong>SCHOOL DEAN</strong></td>
                        <td>{resolvedDeanName || '-'}</td>
                        <td>
                          <select value={selectedDeanStatus} onChange={(e) => setSelectedDeanStatus(e.target.value)}>
                            <option value="pending">Pending</option>
                            <option value="approved">Approved</option>
                            <option value="rejected">Rejected</option>
                          </select>
                        </td>
                        <td><input type="date" value={continuingFormDate} onChange={(e) => setContinuingFormDate(e.target.value)} /></td>
                      </tr>
                    </tbody>
                  </table>
                </>
              )}
            </div>

            {student && (
              <div className="enroll-modal-footer">
                <button type="button" onClick={saveChanges}>
                  Save Changes
                </button>
                <button type="button" onClick={promoteStudent}>
                  Promote Student
                </button>
                <button type="button" onClick={approveAndFinalizeSchedule}>
                  Approve & Finalize
                </button>
                <button type="button" onClick={closeModal}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
