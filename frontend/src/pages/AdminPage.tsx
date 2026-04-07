import { FormEvent, useEffect, useState } from 'react'

import { api, getErrorMessage } from '../api'
import { SaveIcon } from '../components/Icons'

type Department = {
  id: number
  name: string
  code: string
}

type Program = {
  id: number
  name: string
  code: string
  department: number
  program_adviser: string
  school_dean: string
}

type AcademicTerm = {
  id: number
  year_label: string
  semester: number
  is_active: boolean
}

type ProgramOffering = {
  id: number
  program: number
  program_name: string
  department_name: string
  year_level: number
  semester: number
  program_adviser: string
  school_dean: string
}

type Section = {
  id: number
  name: string
  program: number
  year_level: number
  semester: number
}

type FolderKey = 'departments' | 'programs' | 'programOfferings' | 'terms' | 'sections'

const ADMIN_FOLDERS_STORAGE_KEY = 'ccb_admin_folders_open_state'

const defaultOpenFolders: Record<FolderKey, boolean> = {
  departments: true,
  programs: false,
  programOfferings: true,
  terms: false,
  sections: false,
}

export function AdminPage() {
  const currentYear = new Date().getFullYear()
  const academicYearOptions = Array.from({ length: 21 }, (_, i) => {
    const start = currentYear - 10 + i
    return `${start}-${start + 1}`
  })
  const defaultAcademicYear = `${currentYear}-${currentYear + 1}`

  const [departments, setDepartments] = useState<Department[]>([])
  const [programs, setPrograms] = useState<Program[]>([])
  const [programOfferings, setProgramOfferings] = useState<ProgramOffering[]>([])
  const [terms, setTerms] = useState<AcademicTerm[]>([])
  const [sections, setSections] = useState<Section[]>([])

  const [deptName, setDeptName] = useState('')
  const [editingDepartmentId, setEditingDepartmentId] = useState<number | null>(null)

  const [programName, setProgramName] = useState('')
  const [programDepartment, setProgramDepartment] = useState('')
  const [programAdviser, setProgramAdviser] = useState('')
  const [programDean, setProgramDean] = useState('')
  const [editingProgramId, setEditingProgramId] = useState<number | null>(null)

  const [offeringProgram, setOfferingProgram] = useState('')
  const [offeringYearLevel, setOfferingYearLevel] = useState('1')
  const [offeringSemester, setOfferingSemester] = useState('1')
  const [offeringAdviser, setOfferingAdviser] = useState('')
  const [offeringDean, setOfferingDean] = useState('')
  const [editingOfferingId, setEditingOfferingId] = useState<number | null>(null)

  const [termYearLabel, setTermYearLabel] = useState(defaultAcademicYear)
  const [termSemester, setTermSemester] = useState('1')
  const [termIsActive, setTermIsActive] = useState(true)
  const [editingTermId, setEditingTermId] = useState<number | null>(null)

  const [sectionName, setSectionName] = useState('')
  const [sectionProgram, setSectionProgram] = useState('')
  const [sectionYearLevel, setSectionYearLevel] = useState('1')
  const [sectionSemester, setSectionSemester] = useState('1')
  const [editingSectionId, setEditingSectionId] = useState<number | null>(null)

  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [viewDetails, setViewDetails] = useState('')
  const [openFolders, setOpenFolders] = useState<Record<FolderKey, boolean>>(() => {
    if (typeof window === 'undefined') return defaultOpenFolders
    try {
      const raw = window.localStorage.getItem(ADMIN_FOLDERS_STORAGE_KEY)
      if (!raw) return defaultOpenFolders
      const parsed = JSON.parse(raw) as Partial<Record<FolderKey, boolean>>
      return {
        departments: parsed.departments ?? defaultOpenFolders.departments,
        programs: parsed.programs ?? defaultOpenFolders.programs,
        programOfferings: parsed.programOfferings ?? defaultOpenFolders.programOfferings,
        terms: parsed.terms ?? defaultOpenFolders.terms,
        sections: parsed.sections ?? defaultOpenFolders.sections,
      }
    } catch {
      return defaultOpenFolders
    }
  })

  const loadData = async () => {
    const [deptResp, progResp, offeringResp, termResp, sectionResp] = await Promise.all([
      api.get<Department[]>('/departments/'),
      api.get<Program[]>('/programs/'),
      api.get<ProgramOffering[]>('/program-offerings/'),
      api.get<AcademicTerm[]>('/terms/'),
      api.get<Section[]>('/sections/'),
    ])
    setDepartments(deptResp.data)
    setPrograms(progResp.data)
    setProgramOfferings(offeringResp.data)
    setTerms(termResp.data)
    setSections(sectionResp.data)
  }

  useEffect(() => {
    loadData().catch((err) => setError(getErrorMessage(err)))
  }, [])

  useEffect(() => {
    window.localStorage.setItem(ADMIN_FOLDERS_STORAGE_KEY, JSON.stringify(openFolders))
  }, [openFolders])

  const withFeedback = async (action: () => Promise<void>, message: string) => {
    setError('')
    setSuccess('')
    try {
      await action()
      await loadData()
      setSuccess(message)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const resetDepartmentForm = () => {
    setDeptName('')
    setEditingDepartmentId(null)
  }

  const resetProgramForm = () => {
    setProgramName('')
    setProgramDepartment('')
    setProgramAdviser('')
    setProgramDean('')
    setEditingProgramId(null)
  }

  const resetOfferingForm = () => {
    setOfferingProgram('')
    setOfferingYearLevel('1')
    setOfferingSemester('1')
    setOfferingAdviser('')
    setOfferingDean('')
    setEditingOfferingId(null)
  }

  const resetTermForm = () => {
    setTermYearLabel(defaultAcademicYear)
    setTermSemester('1')
    setTermIsActive(true)
    setEditingTermId(null)
  }

  const resetSectionForm = () => {
    setSectionName('')
    setSectionProgram('')
    setSectionYearLevel('1')
    setSectionSemester('1')
    setEditingSectionId(null)
  }

  const submitDepartment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await withFeedback(async () => {
      const payload = { name: deptName, code: '' }
      if (editingDepartmentId) {
        await api.put(`/departments/${editingDepartmentId}/`, payload)
      } else {
        await api.post('/departments/', payload)
      }
      resetDepartmentForm()
    }, editingDepartmentId ? 'Department updated.' : 'Department created.')
  }

  const submitProgram = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await withFeedback(async () => {
      const payload = {
        name: programName,
        code: '',
        department: Number(programDepartment),
        program_adviser: programAdviser,
        school_dean: programDean,
      }
      if (editingProgramId) {
        await api.put(`/programs/${editingProgramId}/`, payload)
      } else {
        await api.post('/programs/', payload)
      }
      resetProgramForm()
    }, editingProgramId ? 'Program updated.' : 'Program created.')
  }

  const submitTerm = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await withFeedback(async () => {
      const payload = {
        year_label: termYearLabel,
        semester: Number(termSemester),
        is_active: termIsActive,
      }
      if (editingTermId) {
        await api.put(`/terms/${editingTermId}/`, payload)
      } else {
        await api.post('/terms/', payload)
      }
      resetTermForm()
    }, editingTermId ? 'Academic term updated.' : 'Academic term created.')
  }

  const submitSection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await withFeedback(async () => {
      const payload = {
        name: sectionName,
        program: Number(sectionProgram),
        year_level: Number(sectionYearLevel),
        semester: Number(sectionSemester),
      }
      if (editingSectionId) {
        await api.put(`/sections/${editingSectionId}/`, payload)
      } else {
        await api.post('/sections/', payload)
      }
      resetSectionForm()
    }, editingSectionId ? 'Section updated.' : 'Section created.')
  }

  const handleDelete = async (
    resource: 'departments' | 'programs' | 'program-offerings' | 'terms' | 'sections',
    id: number,
    label: string,
  ) => {
    const confirmed = window.confirm(`Delete ${label}?`)
    if (!confirmed) return
    await withFeedback(async () => {
      await api.delete(`/${resource}/${id}/`)
    }, `${label} deleted.`)
  }

  const handleView = (title: string, details: Record<string, unknown>) => {
    setViewDetails(`${title}: ${Object.entries(details)
      .map(([k, v]) => `${k}=${String(v)}`)
      .join(' | ')}`)
  }

  const startEditDepartment = (department: Department) => {
    setDeptName(department.name)
    setEditingDepartmentId(department.id)
  }

  const startEditProgram = (program: Program) => {
    setProgramName(program.name)
    setProgramDepartment(String(program.department))
    setProgramAdviser(program.program_adviser || '')
    setProgramDean(program.school_dean || '')
    setEditingProgramId(program.id)
  }

  const startEditOffering = (offering: ProgramOffering) => {
    setOfferingProgram(String(offering.program))
    setOfferingYearLevel(String(offering.year_level))
    setOfferingSemester(String(offering.semester))
    setOfferingAdviser(offering.program_adviser || '')
    setOfferingDean(offering.school_dean || '')
    setEditingOfferingId(offering.id)
  }

  const startEditTerm = (term: AcademicTerm) => {
    setTermYearLabel(term.year_label)
    setTermSemester(String(term.semester))
    setTermIsActive(term.is_active)
    setEditingTermId(term.id)
  }

  const startEditSection = (section: Section) => {
    setSectionName(section.name)
    setSectionProgram(String(section.program))
    setSectionYearLevel(String(section.year_level))
    setSectionSemester(String(section.semester))
    setEditingSectionId(section.id)
  }

  const onFolderToggle = (key: FolderKey, isOpen: boolean) => {
    setOpenFolders((current) => ({ ...current, [key]: isOpen }))
  }

  const programLabel = (id: number) => programs.find((p) => p.id === id)?.name ?? `Program #${id}`
  const departmentLabel = (id: number) => departments.find((d) => d.id === id)?.name ?? `Department #${id}`

  const sectionDisplayLabel = (section: Section) => {
    const programName = programLabel(section.program)
    const semesterLabel =
      section.semester === 1 ? '1st Semester' : section.semester === 2 ? '2nd Semester' : 'Summer'
    return `${programName} Year ${section.year_level} - ${semesterLabel}`
  }

  return (
    <section className="card">
      <h1>Admin Module</h1>
      <p>Manage departments, programs, terms, and sections.</p>

      {error && <p className="error-text">{error}</p>}
      {success && <p className="success-text">{success}</p>}
      {viewDetails && <p>{viewDetails}</p>}

      <h2 className="section-title">Create Department</h2>
      <form className="form-grid" onSubmit={submitDepartment}>
        <input placeholder="Department Name" value={deptName} onChange={(e) => setDeptName(e.target.value)} required />
        <button type="submit" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <SaveIcon /> {editingDepartmentId ? 'Update Department' : 'Save Department'}
        </button>
        {editingDepartmentId && (
          <button type="button" onClick={resetDepartmentForm}>
            Cancel Edit
          </button>
        )}
      </form>

      <h2 className="section-title">Create Program</h2>
      <form className="form-grid" onSubmit={submitProgram}>
        <input placeholder="Program Name" value={programName} onChange={(e) => setProgramName(e.target.value)} required />
        <select value={programDepartment} onChange={(e) => setProgramDepartment(e.target.value)} required>
          <option value="">Select Department</option>
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
        <input placeholder="Program Adviser (optional)" value={programAdviser} onChange={(e) => setProgramAdviser(e.target.value)} />
        <input placeholder="School Dean (optional)" value={programDean} onChange={(e) => setProgramDean(e.target.value)} />
        <button type="submit" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <SaveIcon /> {editingProgramId ? 'Update Program' : 'Save Program'}
        </button>
        {editingProgramId && (
          <button type="button" onClick={resetProgramForm}>
            Cancel Edit
          </button>
        )}
      </form>

      <h2 className="section-title">Program Offerings (Adviser &amp; Dean per Year/Semester)</h2>
      <form
        className="form-grid"
        onSubmit={async (e) => {
          e.preventDefault()
          await withFeedback(async () => {
            const payload = {
              program: Number(offeringProgram),
              year_level: Number(offeringYearLevel),
              semester: Number(offeringSemester),
              program_adviser: offeringAdviser,
              school_dean: offeringDean,
            }
            if (editingOfferingId) {
              await api.put(`/program-offerings/${editingOfferingId}/`, payload)
            } else {
              await api.post('/program-offerings/', payload)
            }
            resetOfferingForm()
          }, editingOfferingId ? 'Program offering updated.' : 'Program offering created.')
        }}
      >
        <select value={offeringProgram} onChange={(e) => setOfferingProgram(e.target.value)} required>
          <option value="">Select Program</option>
          {programs.map((program) => (
            <option key={program.id} value={program.id}>
              {program.name}
            </option>
          ))}
        </select>
        <select value={offeringYearLevel} onChange={(e) => setOfferingYearLevel(e.target.value)}>
          <option value="1">Year 1</option>
          <option value="2">Year 2</option>
          <option value="3">Year 3</option>
          <option value="4">Year 4</option>
        </select>
        <select value={offeringSemester} onChange={(e) => setOfferingSemester(e.target.value)}>
          <option value="1">1st Semester</option>
          <option value="2">2nd Semester</option>
          <option value="3">Summer</option>
        </select>
        <input placeholder="Program Adviser" value={offeringAdviser} onChange={(e) => setOfferingAdviser(e.target.value)} />
        <input placeholder="School Dean" value={offeringDean} onChange={(e) => setOfferingDean(e.target.value)} />
        <button type="submit" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <SaveIcon /> {editingOfferingId ? 'Update Offering' : 'Save Offering'}
        </button>
        {editingOfferingId && (
          <button type="button" onClick={resetOfferingForm}>
            Cancel Edit
          </button>
        )}
      </form>

      <h2 className="section-title">Create Academic Term</h2>
      <form className="form-grid" onSubmit={submitTerm}>
        <select value={termYearLabel} onChange={(e) => setTermYearLabel(e.target.value)} required>
          {academicYearOptions.map((yearLabel) => (
            <option key={yearLabel} value={yearLabel}>
              {yearLabel}
            </option>
          ))}
        </select>
        <select value={termSemester} onChange={(e) => setTermSemester(e.target.value)}>
          <option value="1">1st Semester</option>
          <option value="2">2nd Semester</option>
          <option value="3">Summer</option>
        </select>
        <label>
          <input type="checkbox" checked={termIsActive} onChange={(e) => setTermIsActive(e.target.checked)} /> Active Term
        </label>
        <button type="submit" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <SaveIcon /> {editingTermId ? 'Update Term' : 'Save Term'}
        </button>
        {editingTermId && (
          <button type="button" onClick={resetTermForm}>
            Cancel Edit
          </button>
        )}
      </form>

      <h2 className="section-title">Create Section</h2>
      <form className="form-grid" onSubmit={submitSection}>
        <input placeholder="Section Name" value={sectionName} onChange={(e) => setSectionName(e.target.value)} required />
        <select value={sectionProgram} onChange={(e) => setSectionProgram(e.target.value)} required>
          <option value="">Select Program</option>
          {programs.map((program) => (
            <option key={program.id} value={program.id}>
              {program.name}
            </option>
          ))}
        </select>
        <select value={sectionYearLevel} onChange={(e) => setSectionYearLevel(e.target.value)}>
          <option value="1">Year 1</option>
          <option value="2">Year 2</option>
          <option value="3">Year 3</option>
          <option value="4">Year 4</option>
        </select>
        <select value={sectionSemester} onChange={(e) => setSectionSemester(e.target.value)}>
          <option value="1">1st Semester</option>
          <option value="2">2nd Semester</option>
          <option value="3">Summer</option>
        </select>
        <button type="submit" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
          <SaveIcon /> {editingSectionId ? 'Update Section' : 'Save Section'}
        </button>
        {editingSectionId && (
          <button type="button" onClick={resetSectionForm}>
            Cancel Edit
          </button>
        )}
      </form>

      <h2 className="section-title">Records</h2>
      <div className="admin-folders">
        <details className="admin-folder" open={openFolders.departments} onToggle={(event) => onFolderToggle('departments', event.currentTarget.open)}>
          <summary>
            <span className="folder-title">Departments</span>
            <span className="folder-count">{departments.length}</span>
          </summary>
          <div className="folder-body table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {departments.map((department) => (
                  <tr key={department.id}>
                    <td>{department.name}</td>
                    <td>
                      <button type="button" onClick={() => handleView('Department', department)}>
                        View
                      </button>
                      <button type="button" onClick={() => startEditDepartment(department)}>
                        Edit
                      </button>
                      <button type="button" onClick={() => handleDelete('departments', department.id, `Department ${department.name}`)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        <details className="admin-folder" open={openFolders.programs} onToggle={(event) => onFolderToggle('programs', event.currentTarget.open)}>
          <summary>
            <span className="folder-title">Programs</span>
            <span className="folder-count">{programs.length}</span>
          </summary>
          <div className="folder-body table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Department</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {programs.map((program) => (
                  <tr key={program.id}>
                    <td>{program.name}</td>
                    <td>{departmentLabel(program.department)}</td>
                    <td>
                      <button type="button" onClick={() => handleView('Program', program)}>
                        View
                      </button>
                      <button type="button" onClick={() => startEditProgram(program)}>
                        Edit
                      </button>
                      <button type="button" onClick={() => handleDelete('programs', program.id, `Program ${program.name}`)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        <details className="admin-folder" open={openFolders.programOfferings} onToggle={(event) => onFolderToggle('programOfferings', event.currentTarget.open)}>
          <summary>
            <span className="folder-title">Program Offerings (Program Â· Year Â· Semester)</span>
            <span className="folder-count">{programOfferings.length}</span>
          </summary>
          <div className="folder-body table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Program</th>
                  <th>Year Level</th>
                  <th>Semester</th>
                  <th>Program Adviser</th>
                  <th>School Dean</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {programOfferings.map((offering) => (
                  <tr key={offering.id}>
                    <td>{offering.program_name}</td>
                    <td>Year {offering.year_level}</td>
                    <td>
                      {offering.semester === 1 ? '1st Semester' : offering.semester === 2 ? '2nd Semester' : 'Summer'}
                    </td>
                    <td>{offering.program_adviser || '-'}</td>
                    <td>{offering.school_dean || '-'}</td>
                    <td>
                      <button type="button" onClick={() => handleView('Program Offering', offering)}>
                        View
                      </button>
                      <button type="button" onClick={() => startEditOffering(offering)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleDelete(
                            'program-offerings',
                            offering.id,
                            `${offering.program_name} Year ${offering.year_level} - Sem ${offering.semester}`,
                          )
                        }
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        <details className="admin-folder" open={openFolders.terms} onToggle={(event) => onFolderToggle('terms', event.currentTarget.open)}>
          <summary>
            <span className="folder-title">Academic Terms</span>
            <span className="folder-count">{terms.length}</span>
          </summary>
          <div className="folder-body table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Year</th>
                  <th>Semester</th>
                  <th>Active</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {terms.map((term) => (
                  <tr key={term.id}>
                    <td>{term.year_label}</td>
                    <td>{term.semester}</td>
                    <td>{term.is_active ? 'Yes' : 'No'}</td>
                    <td>
                      <button type="button" onClick={() => handleView('AcademicTerm', term)}>
                        View
                      </button>
                      <button type="button" onClick={() => startEditTerm(term)}>
                        Edit
                      </button>
                      <button type="button" onClick={() => handleDelete('terms', term.id, `Academic Term ${term.year_label}`)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        <details className="admin-folder" open={openFolders.sections} onToggle={(event) => onFolderToggle('sections', event.currentTarget.open)}>
          <summary>
            <span className="folder-title">Sections</span>
            <span className="folder-count">{sections.length}</span>
          </summary>
          <div className="folder-body table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Program / Year / Semester</th>
                  <th>Year Level</th>
                  <th>Semester</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sections
                  .slice()
                  .sort((a, b) => {
                    const programA = programLabel(a.program).toLowerCase()
                    const programB = programLabel(b.program).toLowerCase()
                    if (programA !== programB) return programA.localeCompare(programB)
                    if (a.year_level !== b.year_level) return a.year_level - b.year_level
                    if (a.semester !== b.semester) return a.semester - b.semester
                    return a.name.localeCompare(b.name)
                  })
                  .map((section) => (
                  <tr key={section.id}>
                    <td>{section.name}</td>
                    <td>{sectionDisplayLabel(section)}</td>
                    <td>{section.year_level}</td>
                    <td>
                      {section.semester === 1
                        ? '1st Semester'
                        : section.semester === 2
                        ? '2nd Semester'
                        : 'Summer'}
                    </td>
                    <td>
                      <button type="button" onClick={() => handleView('Section', section)}>
                        View
                      </button>
                      <button type="button" onClick={() => startEditSection(section)}>
                        Edit
                      </button>
                      <button type="button" onClick={() => handleDelete('sections', section.id, `Section ${section.name}`)}>
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </section>
  )
}
