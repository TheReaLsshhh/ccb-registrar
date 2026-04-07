import { FormEvent, Fragment, useEffect, useState } from 'react'

import { api, getErrorMessage } from '../api'
import { SearchIcon } from '../components/Icons'

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

export function TranscriptPage() {
  const [searchId, setSearchId] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [student, setStudent] = useState<StudentDetail | null>(null)
  const [programs, setPrograms] = useState<Program[]>([])
  const [torSubjects, setTorSubjects] = useState<TORSubject[]>([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

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
    setSuccess('')
  }

  const loadTORSubjects = async (studentId: string) => {
    const response = await api.get<TORSubject[]>(`/students/${studentId}/tor-subjects/`)
    setTorSubjects(response.data)
  }

  const searchStudent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setSuccess('')
    setStudent(null)
    setTorSubjects([])

    try {
      const response = await api.get<StudentDetail>(`/students/${searchId}/`)
      const found = response.data
      setStudent(found)
      await loadTORSubjects(found.student_id)
      setIsModalOpen(true)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const groupedSubjects = torSubjects.reduce<Record<string, TORSubject[]>>((grouped, subject) => {
    const semesterLabel = subject.semester === 1 ? '1st Semester' : subject.semester === 2 ? '2nd Semester' : 'Summer'
    const yearLabel =
      subject.year_level === 1
        ? '1st Year'
        : subject.year_level === 2
          ? '2nd Year'
          : subject.year_level === 3
            ? '3rd Year'
            : `${subject.year_level}th Year`
    const key = `${subject.academic_year} | ${yearLabel} | ${semesterLabel}`
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(subject)
    return grouped
  }, {})

  const yearSemesterOrder = Object.keys(groupedSubjects).sort((a, b) => {
    const first = groupedSubjects[a]?.[0]
    const second = groupedSubjects[b]?.[0]
    if (!first || !second) return a.localeCompare(b)
    const yearCompare = first.academic_year.localeCompare(second.academic_year)
    if (yearCompare !== 0) return yearCompare
    const levelCompare = first.year_level - second.year_level
    if (levelCompare !== 0) return levelCompare
    return first.semester - second.semester
  })

  const programName = student ? programs.find((program) => program.id === student.program)?.name || '-' : '-'
  const fullName = student
    ? `${student.last_name}, ${student.first_name}${student.middle_name ? ` ${student.middle_name}` : ''}${student.extension_name ? ` ${student.extension_name}` : ''}`
    : '-'

  return (
    <section className="card">
      <h1>Transcript of Records</h1>
      <p>Search a student by ID and open the transcript in a registrar-style modal.</p>

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
      {isModalOpen && (
        <div className="enroll-modal-overlay">
          <div className="enroll-modal transcript-modal" style={{ overflowY: 'auto', maxHeight: '90vh' }} onClick={(e) => e.stopPropagation()}>
            <div className="enroll-modal-header">
              <h2>Transcript of Records</h2>
              <div className="modal-header-actions">
                <button type="button" onClick={closeModal}>
                  Close
                </button>
              </div>
            </div>

            <div className="enroll-sheet-form">
              {error && <div className="error-message">{error}</div>}

              {student && (
                <div className="transcript-document">
                  <div className="transcript-watermark" aria-hidden="true">
                    <img src="/Picture2.png" alt="" />
                  </div>

                  <div className="transcript-doc-header">
                    <div className="transcript-doc-brand">
                      <img src="/Picture2.png" alt="" className="transcript-doc-logo" />
                      <div className="transcript-doc-title-group">
                        <div className="transcript-doc-school">CITY COLLEGE OF BAYAWAN</div>
                        <div className="transcript-doc-office">OFFICE OF THE COLLEGE REGISTRAR</div>
                        <div className="transcript-doc-copy">Official Transcript of Records</div>
                      </div>
                      <img src="/ccb_registrar_logo.png" alt="" className="transcript-doc-logo transcript-doc-logo--secondary" />
                    </div>
                  </div>

                  <div className="transcript-doc-panel">
                    <div className="transcript-doc-section-title">Personal Data</div>
                    <div className="transcript-doc-info-grid">
                      <div><span>Name:</span> {fullName}</div>
                      <div><span>Student No.:</span> {student.student_id}</div>
                      <div><span>Date of Birth:</span> {student.date_of_birth || '-'}</div>
                      <div><span>Gender:</span> {student.gender || '-'}</div>
                      <div><span>Nationality:</span> {student.nationality || '-'}</div>
                      <div><span>Academic Program/Course:</span> {programName}</div>
                    </div>
                  </div>

                  <div className="transcript-doc-panel">
                    <div className="transcript-doc-section-title">Entrance Data</div>
                    <div className="transcript-doc-info-grid transcript-doc-info-grid--compact">
                      <div><span>Date/Term Admitted:</span> {student.admission_date || '-'}</div>
                      <div><span>School Year:</span> {student.academic_year || '-'}</div>
                      <div><span>Current Year Level:</span> {student.year_level || '-'}</div>
                      <div><span>Current Semester:</span> {student.semester || '-'}</div>
                    </div>
                  </div>

                  <div className="transcript-doc-panel transcript-doc-panel--record">
                    <div className="transcript-doc-section-title">Academic Record</div>

                    {yearSemesterOrder.length ? (
                      <div className="table-wrap transcript-doc-table-wrap">
                        <table className="transcript-doc-table">
                          <thead>
                              <tr>
                                <th style={{ width: '22%' }}>Term &amp; School Year</th>
                                <th style={{ width: '18%' }}>Subject Code</th>
                                <th>Descriptive Title</th>
                                <th style={{ width: '10%' }}>Credits</th>
                              </tr>
                            </thead>
                          <tbody>
                            {yearSemesterOrder.map((yearSemester) => {
                              const subjects = groupedSubjects[yearSemester]
                              if (!subjects || subjects.length === 0) return null

                              return (
                                <Fragment key={yearSemester}>
                                  <tr className="transcript-doc-term-row">
                                    <td colSpan={5}>{yearSemester}</td>
                                  </tr>
                                  {subjects.map((subject, index) => (
                                    <tr key={subject.id}>
                                      <td>{index === 0 ? yearSemester : ''}</td>
                                      <td>{subject.subject_code}</td>
                                      <td>{subject.descriptive_title}</td>
                                      <td>{subject.credits}</td>
                                    </tr>
                                  ))}
                                  <tr className="transcript-total-row">
                                    <td colSpan={3} style={{ textAlign: 'right' }}>Total Credits:</td>
                                    <td>{subjects.reduce((sum, subject) => sum + subject.credits, 0)}</td>
                                  </tr>
                                </Fragment>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="transcript-empty-state">
                        No TOR subjects found for this student.
                      </div>
                    )}
                  </div>

                  <div className="transcript-doc-footer">
                    <div className="transcript-doc-legend">
                      <div className="transcript-doc-section-title transcript-doc-section-title--small">Remarks</div>
                      <p>Grades are not available yet. This copy currently lists the student's taken subjects and earned credits only.</p>
                    </div>
                    <div className="transcript-doc-signatures">
                      <div className="transcript-doc-sign-box">
                        <span>Prepared by</span>
                        <strong>COLLEGE REGISTRAR</strong>
                      </div>
                      <div className="transcript-doc-sign-box">
                        <span>Checked by</span>
                        <strong>REGISTRAR ADMIN</strong>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
