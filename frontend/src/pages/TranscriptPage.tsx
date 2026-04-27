import { FormEvent, Fragment, useEffect, useMemo, useRef, useState } from 'react'

import { api, getErrorMessage } from '../api'
import { SearchIcon, TranscriptIcon } from '../components/Icons'

interface TORSubject {
  id: number
  subject_code: string
  descriptive_title: string
  grade_final: string
  completion: string
  credits: number
  academic_year: string
  semester: number
  year_level: number
}

interface StudentDetail {
  id: number
  student_id: string
  last_name: string
  first_name: string
  middle_name: string
  extension_name: string
  gender?: string
  date_of_birth?: string | null
  nationality?: string
  admission_date?: string | null
  home_address?: string
  elementary_school?: string
  junior_high_school?: string
  senior_high_school?: string
  senior_high_track_strand?: string
  program: number
  year_level: number
  academic_year: string
  semester: number | null
  section: number | null
}

interface Program {
  id: number
  name: string
}

type TranscriptGroup = {
  key: string
  heading: string
  academicYear: string
  yearLevel: number
  semester: number
  subjects: TORSubject[]
}

type TranscriptRecordPage = {
  key: string
  groups: TranscriptGroup[]
  isLast: boolean
}

const SCHOOL_CODE = '18001'
const MOTTO = 'Honus et Excellentia Ad Summum Bonum'
const CAMPUS_LINE = 'City of Bayawan, Negros Oriental'
const CONTACT_LINE = '(035) 430-0263 local 1450'
const BACKGROUND_WATERMARK_ROWS = 320
const BACKGROUND_WATERMARK_TEXT = Array.from({ length: 12 }, () => 'CITY COLLEGE OF BAYAWAN').join('  ')
const RECORD_PAGE_CAPACITY = 26
const LEGAL_PAPER_WIDTH_IN = 8.5
const LEGAL_PAPER_HEIGHT_IN = 13

const buildTorIssueDate = (): Date => new Date()

const formatDateLabel = (value?: string | null): string => {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

const formatSemesterLabel = (semester: number | null | undefined): string => {
  if (semester === 1) return '1st Semester'
  if (semester === 2) return '2nd Semester'
  if (semester === 3) return 'Summer'
  return '-'
}

const formatYearLevelLabel = (yearLevel: number | null | undefined): string => {
  if (yearLevel === 1) return '1st Year'
  if (yearLevel === 2) return '2nd Year'
  if (yearLevel === 3) return '3rd Year'
  if (yearLevel === 4) return '4th Year'
  return yearLevel ? `${yearLevel}th Year` : '-'
}

const buildStudentName = (student: StudentDetail | null): string => {
  if (!student) return '-'
  return `${student.last_name}, ${student.first_name}${student.middle_name ? ` ${student.middle_name}` : ''}${student.extension_name ? ` ${student.extension_name}` : ''}`
}

const buildBackgroundRows = () =>
  Array.from({ length: BACKGROUND_WATERMARK_ROWS }, (_, index) => (
    <div key={`transcript-bg-row-${index}`} className="transcript-page-bg-row" aria-hidden="true">
      {BACKGROUND_WATERMARK_TEXT}
    </div>
  ))

export function TranscriptPage() {
  const [searchId, setSearchId] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [student, setStudent] = useState<StudentDetail | null>(null)
  const [programs, setPrograms] = useState<Program[]>([])
  const [torSubjects, setTorSubjects] = useState<TORSubject[]>([])
  const [error, setError] = useState('')
  const [torIssuedAt, setTorIssuedAt] = useState<Date | null>(null)
  const transcriptPrintRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const loadPrograms = async () => {
      try {
        const response = await api.get<Program[]>('/programs/')
        setPrograms(response.data)
      } catch (err) {
        setError(getErrorMessage(err))
      }
    }

    void loadPrograms()
  }, [])

  const closeModal = () => {
    setIsModalOpen(false)
    setError('')
  }

  const printTranscript = () => {
    const transcriptRoot = transcriptPrintRef.current
    if (!transcriptRoot) return
    const printablePagesMarkup = Array.from(transcriptRoot.querySelectorAll<HTMLElement>('.transcript-page'))
      .map((node) => `<div class="transcript-print-page-shell">${node.outerHTML}</div>`)
      .join('\n')
    if (!printablePagesMarkup) return

    const printFrame = document.createElement('iframe')
    printFrame.setAttribute('aria-hidden', 'true')
    printFrame.style.position = 'fixed'
    printFrame.style.right = '0'
    printFrame.style.bottom = '0'
    printFrame.style.width = '0'
    printFrame.style.height = '0'
    printFrame.style.border = '0'
    printFrame.style.visibility = 'hidden'
    document.body.appendChild(printFrame)

    const printWindow = printFrame.contentWindow
    if (!printWindow) {
      document.body.removeChild(printFrame)
      return
    }

    const headMarkup = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((node) => node.outerHTML)
      .join('\n')

    const printStyles = `
      <link href="https://fonts.googleapis.com/css2?family=Alex+Brush&display=swap" rel="stylesheet">
      <style>
        /* Force 'City College of Bayawan' header to a single line in print and display full text */
        .transcript-print-root .transcript-page-title-wrap {
          position: relative !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          width: 100% !important;
          height: 140px !important;
        }
        /* Perfectly center the motto/campus block in print */
        .transcript-print-root .transcript-motto-campus-block {
          position: absolute !important;
          left: 0 !important;
          right: 0 !important;
          top: -50% !important;
          transform: translateY(50%) !important;
          margin-left: auto !important;
          margin-right: auto !important;
          width: 340px !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: center !important;
          z-index: 2 !important;
        }
        .transcript-print-root .transcript-motto-campus-block .transcript-school-motto,
        .transcript-print-root .transcript-motto-campus-block .transcript-school-campus {
          text-align: center !important;
          width: 100% !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        .transcript-print-root .transcript-motto-campus-block .transcript-school-motto {
          font-family: 'Alex Brush', cursive !important;
          font-size: 1.35rem !important;
          font-weight: 400 !important;
          margin-bottom: 2px !important;
        }
        .transcript-print-root .transcript-motto-campus-block .transcript-school-campus {
          font-size: 25.32rem !important;
          font-weight: 700 !important;
          line-height: 1.08 !important;
          letter-spacing: 0.01em !important;
        }
        /* Move the school brand (logo/code) slightly lower for print so it doesn't block the header */
        .transcript-print-root .transcript-school-brand {
          margin-top: 32px !important;
        }
        .transcript-print-root .transcript-school-name {
          white-space: nowrap !important;
          overflow: visible !important;
          text-overflow: unset !important;
          font-size: 2.1rem !important;
          font-weight: 900 !important;
          letter-spacing: 0.04em !important;
          text-align: center !important;
        }
        /* Only apply to Page 1 (not .transcript-page--records) */
        .transcript-print-root .transcript-page:not(.transcript-page--records) .transcript-student-info {
          margin-bottom: 22px;
          font-size: 16px;
          line-height: 1.7;
        }
        .transcript-print-root .transcript-page:not(.transcript-page--records) .transcript-section {
          margin-bottom: 22px;
        }
        .transcript-print-root .transcript-page:not(.transcript-page--records) .transcript-section-heading {
          font-size: 28px;
          font-weight: 800;
          margin-bottom: 12px;
        }
        .transcript-print-root .transcript-page:not(.transcript-page--records) .transcript-student-info-copy > div,
        .transcript-print-root .transcript-page:not(.transcript-page--records) .transcript-student-id-line {
          font-size: 16px;
          font-weight: 600;
        }
        .transcript-print-root .transcript-page:not(.transcript-page--records) .transcript-graduation-grid > div {
          font-size: 16px;
        }
        .transcript-print-root .transcript-page:not(.transcript-page--records) .transcript-graduation-grid > div strong {
          font-weight: 700;
        }
        .transcript-print-root .transcript-page:not(.transcript-page--records) .transcript-grading-boxes {
          font-size: 16px;
        }
        .transcript-print-root .transcript-page:not(.transcript-page--records) .transcript-grading-title {
          font-size: 18px;
          font-weight: 800;
        }
        .transcript-print-root .transcript-page:not(.transcript-page--records) .transcript-grading-columns > div > div {
          font-size: 16px;
        }
        .transcript-print-root .transcript-official-title {
          margin-top: 12px;
          margin-bottom: 12px;
        }
        @page {
          size: 8.5in 13in;
          margin: 0;
        }
        html,
        body {
          margin: 0;
          padding: 0;
          background: #ffffff;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        body {
          font-family: "Segoe UI", Tahoma, sans-serif;
        }
        @media print {
          html,
          body,
          body *,
          .transcript-print-root,
          .transcript-print-root * {
            visibility: visible !important;
          }
        }
        .transcript-print-root {
          width: ${LEGAL_PAPER_WIDTH_IN}in;
          margin: 0 auto !important;
          background: #ffffff;
        }
        .transcript-print-root .enroll-sheet-form {
          padding: 0 !important;
        }
        .transcript-print-root .transcript-sheet {
          display: block;
          background: #ffffff;
          padding: 0;
        }
        .transcript-print-root .transcript-print-page-shell {
          position: relative;
          width: ${LEGAL_PAPER_WIDTH_IN}in;
          height: ${LEGAL_PAPER_HEIGHT_IN}in;
          margin: 0;
          box-sizing: border-box;
          overflow: hidden;
          background: #ffffff;
        }
        .transcript-print-root .transcript-print-page-shell + .transcript-print-page-shell {
          break-before: page;
          page-break-before: always;
        }
        .transcript-print-root .transcript-page {
          display: block !important;
          width: 100% !important;
          min-height: 100% !important;
          height: 100% !important;
          max-height: 100% !important;
          margin: 0 !important;
          padding: 10px 12px 12px !important;
          box-sizing: border-box;
          border: 0 !important;
          box-shadow: none !important;
          overflow: hidden !important;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .transcript-print-root .transcript-section {
          margin-bottom: 2px;
        }
        .transcript-print-root .transcript-section-heading {
          margin-bottom: 2px;
          font-size: 22px;
        }
        .transcript-print-root .transcript-student-info {
          gap: 0 10px;
        }
        .transcript-print-root .transcript-student-info-copy,
        .transcript-print-root .transcript-graduation-grid {
          font-size: 11px;
          line-height: 1.06;
        }
        .transcript-print-root .transcript-student-photo {
          width: 44px;
          height: 44px;
        }
        .transcript-print-root .transcript-student-id-line {
          font-size: 11px;
        }
        .transcript-print-root .transcript-grading-boxes {
          grid-template-columns: minmax(0, 1fr) 200px;
        }
        .transcript-print-root .transcript-grading-box {
          min-height: 136px;
          padding: 8px 10px;
        }
        .transcript-print-root .transcript-grading-title {
          margin-bottom: 8px;
          font-size: 13px;
        }
        .transcript-print-root .transcript-grading-columns {
          gap: 4px 14px;
          font-size: 11px;
          line-height: 1.32;
        }
        .transcript-print-root .transcript-special-marks {
          gap: 8px;
          font-size: 11px;
          line-height: 1.24;
        }
        .transcript-print-root .transcript-standing-note {
          margin: 10px 0 8px;
          font-size: 11px;
        }
        .transcript-print-root .transcript-remarks-line {
          margin-bottom: 14px;
          font-size: 12px;
        }
        .transcript-print-root .transcript-page-footer {
          grid-template-columns: 210px 1fr;
          gap: 18px;
          align-items: end;
        }
        .transcript-print-root .transcript-seal {
          width: 124px;
          height: 124px;
        }
        .transcript-print-root .transcript-seal-block {
          gap: 4px;
        }
        .transcript-print-root .transcript-seal-block p {
          font-size: 9px;
          line-height: 1.15;
        }
        .transcript-print-root .transcript-signature-block {
          width: min(100%, 260px);
        }
        .transcript-print-root .transcript-signature-name {
          font-size: 12px;
          padding-bottom: 1px;
        }
        .transcript-print-root .transcript-signature-title {
          font-size: 11px;
          margin-top: 2px;
        }
        .transcript-print-root .transcript-signature-date {
          margin-top: 4px;
          font-size: 10px;
        }
        .transcript-print-root .transcript-page--records .transcript-page-header--compact {
          margin-bottom: 6px;
        }
        .transcript-print-root .transcript-record-header {
          margin-top: 2px;
        }
        .transcript-print-root .transcript-record-header-row,
        .transcript-print-root .transcript-record-header-subrow,
        .transcript-print-root .transcript-record-row {
          grid-template-columns: 82px minmax(0, 1fr) 124px 56px;
        }
        .transcript-print-root .transcript-record-header-row > div,
        .transcript-print-root .transcript-record-header-subrow > div {
          padding: 4px 6px;
          font-size: 9px;
        }
        .transcript-print-root .transcript-record-header-grade-split span {
          padding: 4px 0;
        }
        .transcript-print-root .transcript-record-body {
          padding: 6px 0 0;
        }
        .transcript-print-root .transcript-term-group {
          margin-bottom: 8px;
        }
        .transcript-print-root .transcript-term-group-title {
          margin-bottom: 2px;
          font-size: 11px;
        }
        .transcript-print-root .transcript-record-row {
          font-size: 9px;
          line-height: 1.14;
        }
        .transcript-print-root .transcript-record-average {
          margin-top: 3px;
          font-size: 10px;
        }
        .transcript-print-root .transcript-record-footer {
          margin-top: 10px;
        }
        .transcript-print-root .transcript-record-closed {
          font-size: 11px;
        }
        .transcript-print-root .transcript-record-graduated {
          margin-top: 18px;
          font-size: 10px;
          line-height: 1.16;
        }
        .transcript-print-root .transcript-page-header-top {
          grid-template-columns: 164px minmax(0, 1fr) 164px;
          gap: 8px;
        }
        .transcript-print-root .transcript-school-brand {
          gap: 1px;
        }
        .transcript-print-root .transcript-school-logo {
          width: 108px;
          height: 108px;
        }
        .transcript-print-root .transcript-page-header-spacer {
          width: 164px;
        }
        .transcript-print-root .transcript-school-name {
          /* Allow full text, no truncation */
        }
        .transcript-print-root .transcript-page-header {
          padding-top: 12px;
        }
        .transcript-print-root .transcript-page-bg,
        .transcript-print-root .transcript-page-bg-row,
        .transcript-print-root .transcript-page-watermark,
        .transcript-print-root .transcript-page-watermark img {
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .transcript-print-root .transcript-page-bg {
          inset: -6px;
          opacity: 0.085;
        }
        .transcript-print-root .transcript-page-bg-row {
          font-size: 16px;
          line-height: 0.7;
          letter-spacing: 0.03em;
          margin-bottom: 4px;
        }
        .transcript-print-root .transcript-page-watermark img {
          width: min(72%, 860px);
          opacity: 0.08;
        }
        .transcript-print-root .transcript-page-watermark--large img {
          width: min(78%, 920px);
          opacity: 0.09;
        }
      </style>
    `

    printWindow.document.open()
    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charSet="utf-8" />
          <title>Transcript of Records - ${studentName}</title>
          ${headMarkup}
          ${printStyles}
        </head>
        <body>
          <div class="transcript-print-root">
            <div class="enroll-sheet-form transcript-sheet">
              ${printablePagesMarkup}
            </div>
          </div>
        </body>
      </html>
    `)
    printWindow.document.close()

    const cleanupPrintFrame = () => {
      window.setTimeout(() => {
        if (document.body.contains(printFrame)) {
          document.body.removeChild(printFrame)
        }
      }, 250)
    }

    const finalizePrint = () => {
      printWindow.focus()
      printWindow.onafterprint = cleanupPrintFrame
      printWindow.print()
      window.setTimeout(cleanupPrintFrame, 1500)
    }

    const images = Array.from(printWindow.document.images)
    if (!images.length) {
      printWindow.addEventListener('load', () => window.setTimeout(finalizePrint, 200), { once: true })
      return
    }

    let loadedImages = 0
    const handleAssetReady = () => {
      loadedImages += 1
      if (loadedImages === images.length) {
        window.setTimeout(finalizePrint, 250)
      }
    }

    images.forEach((image) => {
      if (image.complete) {
        handleAssetReady()
        return
      }

      image.addEventListener('load', handleAssetReady, { once: true })
      image.addEventListener('error', handleAssetReady, { once: true })
    })
  }

  const groupedSubjects = useMemo<TranscriptGroup[]>(() => {
    const grouped = torSubjects.reduce<Record<string, TranscriptGroup>>((acc, subject) => {
      const key = `${subject.academic_year}|${subject.year_level}|${subject.semester}`
      if (!acc[key]) {
        acc[key] = {
          key,
          heading: `${formatSemesterLabel(subject.semester)}, Academic Year ${subject.academic_year}`,
          academicYear: subject.academic_year,
          yearLevel: subject.year_level,
          semester: subject.semester,
          subjects: [],
        }
      }
      acc[key].subjects.push(subject)
      return acc
    }, {})

    return Object.values(grouped).sort((a, b) => {
      const yearCompare = a.academicYear.localeCompare(b.academicYear)
      if (yearCompare !== 0) return yearCompare
      const levelCompare = a.yearLevel - b.yearLevel
      if (levelCompare !== 0) return levelCompare
      return a.semester - b.semester
    })
  }, [torSubjects])

  const recordPages = useMemo<TranscriptRecordPage[]>(() => {
    if (!groupedSubjects.length) {
      return [{ key: 'record-page-empty', groups: [], isLast: true }]
    }

    const pages: TranscriptRecordPage[] = []
    let currentGroups: TranscriptGroup[] = []
    let currentLoad = 0

    groupedSubjects.forEach((group) => {
      const groupLoad = group.subjects.length + 2
      if (currentGroups.length && currentLoad + groupLoad > RECORD_PAGE_CAPACITY) {
        pages.push({
          key: `record-page-${pages.length + 1}`,
          groups: currentGroups,
          isLast: false,
        })
        currentGroups = []
        currentLoad = 0
      }

      currentGroups.push(group)
      currentLoad += groupLoad
    })

    if (currentGroups.length) {
      pages.push({
        key: `record-page-${pages.length + 1}`,
        groups: currentGroups,
        isLast: true,
      })
    }

    return pages
  }, [groupedSubjects])

  const loadTORSubjects = async (studentId: string) => {
    const response = await api.get<TORSubject[]>(`/students/${studentId}/tor-subjects/`)
    setTorSubjects(response.data)
  }

  const searchStudent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setStudent(null)
    setTorSubjects([])

    try {
      const response = await api.get<StudentDetail>(`/students/${searchId}/`)
      const found = response.data
      setStudent(found)
      await loadTORSubjects(found.student_id)
      setTorIssuedAt(buildTorIssueDate())
      setIsModalOpen(true)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const programName = student ? programs.find((program) => program.id === student.program)?.name || '-' : '-'
  const studentName = buildStudentName(student)
  const backgroundRows = buildBackgroundRows()
  const torIssueDate = torIssuedAt ?? buildTorIssueDate()
  const torIssueDateLabel = torIssueDate.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
  const torIssueYear = torIssueDate.getFullYear()

  return (
    <section className="card transcript-route-page">
      <header className="transcript-route-page-header">
        <h1 className="transcript-route-page-title">
          <TranscriptIcon aria-hidden />
          <span>Transcript of Records</span>
        </h1>
        <p className="transcript-route-page-lede">Search a student by ID and open the transcript in a registrar-style modal.</p>
      </header>
      <p className="workflow-route-hint">
        TOR lines come from <strong>Academic History</strong> and related records built as students are enrolled and promoted. This page is{' '}
        <strong>Read-Only</strong> (search and print). To change Program, Loads, or Term data, use <strong>Enrollment</strong> or{' '}
        <strong>Continuing</strong>; keep master data in <strong>Admin</strong> and <strong>Prospectus</strong>.
      </p>

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

      {error && <div className="error-message">{error}</div>}

      {isModalOpen && student && (
        <div className="enroll-modal-overlay transcript-modal-overlay">
          <div className="enroll-modal transcript-modal" style={{ overflowY: 'auto', maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>
            <div className="enroll-modal-header">
              <h2>Transcript of Records</h2>
              <div className="modal-header-actions">
                <button type="button" onClick={printTranscript}>
                  Print
                </button>
                <button type="button" onClick={closeModal}>
                  Close
                </button>
              </div>
            </div>

            <div ref={transcriptPrintRef} className="enroll-sheet-form transcript-sheet">
              <article className="transcript-page">
                <div className="transcript-page-bg">{backgroundRows}</div>
                <div className="transcript-page-watermark" aria-hidden="true">
                  <img src="/Picture2.png" alt="" />
                </div>

                <header className="transcript-page-header">
                  <div className="transcript-page-header-top">
                    <div className="transcript-school-brand">
                      <img src="/Picture2.png" alt="" className="transcript-school-logo" />
                      <div className="transcript-school-code">SCHOOL CODE: {SCHOOL_CODE}</div>
                    </div>
                    <div className="transcript-page-title-wrap">
                      <div className="transcript-school-name">CITY COLLEGE OF BAYAWAN</div>
                      <div className="transcript-motto-campus-block">
                        <div className="transcript-school-motto">{MOTTO}</div>
                        <div className="transcript-school-campus">{CAMPUS_LINE}</div>
                        <div className="transcript-school-campus">{CONTACT_LINE}</div>
                      </div>
                    </div>
                    <div className="transcript-page-header-spacer" aria-hidden="true" />
                  </div>
                  <div className="transcript-official-title">OFFICIAL TRANSCRIPT OF RECORD</div>
                </header>

                <section className="transcript-name-strip">
                  <div className="transcript-name-label">Name:</div>
                  <div className="transcript-name-slots">
                    <div className="transcript-name-slot">
                      <span className="transcript-name-value">{student.last_name || '-'}</span>
                      <span className="transcript-name-caption">(Last Name)</span>
                    </div>
                    <div className="transcript-name-slot">
                      <span className="transcript-name-value">{student.first_name || '-'}</span>
                      <span className="transcript-name-caption">(First Name)</span>
                    </div>
                    <div className="transcript-name-slot">
                      <span className="transcript-name-value">{`${student.middle_name || '-'}${student.extension_name ? ` ${student.extension_name}` : ''}`}</span>
                      <span className="transcript-name-caption">(Middle Name)</span>
                    </div>
                  </div>
                </section>

                <section className="transcript-section">
                  <h3 className="transcript-section-heading">I. STUDENT INFORMATION</h3>
                  <div className="transcript-student-info">
                    <div className="transcript-student-info-copy">
                      <div><strong>Birth Date:</strong> {formatDateLabel(student.date_of_birth)}</div>
                      <div><strong>Birth Place:</strong> Bayawan City</div>
                      <div><strong>Home Address:</strong> {student.home_address || '-'}</div>
                      <div><strong>Sex:</strong> {student.gender || '-'}</div>
                      <div><strong>Date of Admission:</strong> {formatDateLabel(student.admission_date)}</div>
                      <div><strong>Entrance Info:</strong> {student.senior_high_track_strand || 'Senior High School Graduate'}</div>
                    </div>
                    <div className="transcript-student-id-card">
                      <div className="transcript-student-photo">
                        <img src="/man-woman-icon-male-female-avatar-profile-vector-illustration-gender-symbols-pink-blue-gentleman-lady-toilet-signs_735449-462.png" alt="" />
                      </div>
                      <div className="transcript-student-id-line">
                        <strong>Student ID Number:</strong> {student.student_id}
                      </div>
                    </div>
                  </div>
                </section>

                <section className="transcript-section">
                  <h3 className="transcript-section-heading">II. OTHER RECORDS OF GRADUATION</h3>
                  <div className="transcript-graduation-grid">
                    <div><strong>Elementary School:</strong> {student.elementary_school || '-'}</div>
                    <div className="transcript-graduation-year">- 2019</div>
                    <div><strong>Junior High School:</strong> {student.junior_high_school || '-'}</div>
                    <div className="transcript-graduation-year">- 2023</div>
                    <div><strong>Senior High School:</strong> {student.senior_high_school || '-'}</div>
                    <div className="transcript-graduation-year">- 2025</div>
                    <div><strong>Degree/Program:</strong> {programName}</div>
                    <div className="transcript-graduation-year">- N/A</div>
                  </div>
                </section>

                <section className="transcript-section">
                  <h3 className="transcript-section-heading">III. GRADING SYSTEM</h3>
                  <div className="transcript-grading-boxes">
                    <div className="transcript-grading-box">
                      <div className="transcript-grading-title">Grade Equivalent Table</div>
                      <div className="transcript-grading-columns">
                        <div>
                          <div>1.00 = 95-100</div>
                          <div>1.25 = 94-96</div>
                          <div>1.50 = 91-93</div>
                          <div>1.75 = 89-90</div>
                          <div>2.00 = 86-88</div>
                          <div>2.25 = 83-85</div>
                          <div>2.50 = 80-82</div>
                        </div>
                        <div>
                          <div>2.75 = 77-79</div>
                          <div>3.00 = 75-76</div>
                          <div>5.00 = Below 75%</div>
                          <div>DRP = Dropped</div>
                          <div>INC = Incomplete</div>
                          <div>PT = Passed Failed</div>
                        </div>
                      </div>
                    </div>
                    <div className="transcript-grading-box transcript-grading-box--marks">
                      <div className="transcript-grading-title">Special Marks</div>
                      <div className="transcript-special-marks">
                        <div><strong>INC</strong> = Incomplete</div>
                        <div><strong>DR</strong> = Dropped</div>
                      </div>
                    </div>
                  </div>
                </section>

                <div className="transcript-standing-note">
                  The student is in GOOD STANDING (granted transfer credential) unless otherwise indicated on the transcript.
                </div>

                <div className="transcript-remarks-line">
                  <strong>REMARKS:</strong> FOR EMPLOYMENT PURPOSES ONLY
                </div>

                <footer className="transcript-page-footer">
                  <div className="transcript-seal-block">
                    <div className="transcript-seal" aria-hidden="true" />
                    <p>
                      Unless signed by the Registrar and sealed this record is only a statement of the student's progress to date and
                      not official transcript.
                    </p>
                  </div>
                  <div className="transcript-signature-block">
                    <div className="transcript-signature-name">KRISTINE LILIA J. RUELO</div>
                    <div className="transcript-signature-title">Registrar</div>
                    <div className="transcript-signature-date">Date: ____________</div>
                  </div>
                </footer>
              </article>

              {recordPages.map((page) => (
                <article key={page.key} className="transcript-page transcript-page--records">
                  <div className="transcript-page-bg">{backgroundRows}</div>
                  <div className="transcript-page-watermark transcript-page-watermark--large" aria-hidden="true">
                    <img src="/Picture2.png" alt="" />
                  </div>

                  <header className="transcript-page-header transcript-page-header--compact">
                    <div className="transcript-page-header-top">
                      <div className="transcript-school-brand">
                        <img src="/Picture2.png" alt="" className="transcript-school-logo" />
                        <div className="transcript-school-code">SCHOOL CODE: {SCHOOL_CODE}</div>
                      </div>
                      <div className="transcript-page-title-wrap">
                        <div className="transcript-school-name">CITY COLLEGE OF BAYAWAN</div>
                        <div className="transcript-school-motto">{MOTTO}</div>
                        <div className="transcript-school-campus">{CAMPUS_LINE}</div>
                        <div className="transcript-school-campus">{CONTACT_LINE}</div>
                      </div>
                      <div className="transcript-page-header-spacer" aria-hidden="true" />
                    </div>
                    <div className="transcript-official-title">OFFICIAL TRANSCRIPT OF RECORD</div>
                  </header>

                  <section className="transcript-record-header">
                    <div className="transcript-record-header-main">
                      <div className="transcript-record-header-row">
                        <div>Code</div>
                        <div>Course Title</div>
                        <div>Grade</div>
                        <div>Credits</div>
                      </div>
                      <div className="transcript-record-header-subrow">
                        <div />
                        <div />
                        <div className="transcript-record-header-grade-split">
                          <span>Final</span>
                          <span>Completion</span>
                        </div>
                        <div />
                      </div>
                    </div>
                  </section>

                  <section className="transcript-record-body">
                    {page.groups.length ? (
                      page.groups.map((group) => (
                        <div key={group.key} className="transcript-term-group">
                          <div className="transcript-term-group-title">{group.heading}</div>
                          {group.subjects.map((subject) => (
                            <div key={subject.id} className="transcript-record-row">
                              <div className="transcript-record-code">{subject.subject_code}</div>
                              <div className="transcript-record-title">{subject.descriptive_title}</div>
                              <div className="transcript-record-grade">
                                <span>{subject.grade_final || ''}</span>
                                <span>{subject.completion || ''}</span>
                              </div>
                              <div className="transcript-record-credits">{subject.credits}</div>
                            </div>
                          ))}
                          <div className="transcript-record-average">
                            Semestrial Grade Point Average : <span>2.0</span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="transcript-empty-state transcript-empty-state--page">
                        No TOR subjects found for this student.
                      </div>
                    )}
                  </section>

                  {page.isLast ? (
                    <footer className="transcript-record-footer">
                      <div className="transcript-record-closed">---------- TRANSCRIPT OF RECORD CLOSED ----------</div>
                      <div className="transcript-record-graduated">
                        <span className="transcript-record-graduated-first-line">
                          <span className="transcript-record-graduated-label">GRADUATED:</span>{' '}
                          <span className="transcript-record-graduated-program">{programName}</span>
                        </span>
                        <br />
                        {torIssueDateLabel} as per S.O.
                        <br />
                        No. ############ s. {torIssueYear}
                      </div>
                    </footer>
                  ) : null}
                </article>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
