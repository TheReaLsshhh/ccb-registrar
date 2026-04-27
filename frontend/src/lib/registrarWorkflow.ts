/**
 * Shared rules for prospectus resolution and academic-term checks
 * (Continuing + Prospectus + Admin readiness).
 */

export function hasAcademicTermForSelection(
  terms: readonly { year_label: string; semester: number }[],
  academicYear: string,
  semester: string | number,
): boolean {
  if (!academicYear || semester === '' || semester === undefined || semester === null) return false
  const sem = typeof semester === 'string' ? Number(semester) : semester
  if (!Number.isFinite(sem)) return false
  return terms.some((t) => t.year_label === academicYear && Number(t.semester) === sem)
}

export type ProspectusResolutionMode = 'pending' | 'empty' | 'exact' | 'template'

export function resolveProspectusForContinuing<
  T extends {
    program: number
    year_level: number
    semester: number
    academic_year: string
    section: number | null
  },
>(
  entries: readonly T[],
  params: {
    programId: string
    yearLevel: string
    semester: string
    academicYear: string
    sectionId: string
  },
): { mode: ProspectusResolutionMode; entries: T[] } {
  const { programId, yearLevel, semester, academicYear, sectionId } = params
  if (!programId || !yearLevel || !semester || !academicYear || !sectionId) {
    return { mode: 'pending', entries: [] }
  }
  const exact = entries.filter(
    (entry) =>
      String(entry.program) === programId &&
      String(entry.year_level) === yearLevel &&
      String(entry.semester) === semester &&
      entry.academic_year === academicYear &&
      String(entry.section ?? '') === sectionId,
  )
  if (exact.length) return { mode: 'exact', entries: exact }
  const template = entries.filter(
    (entry) =>
      String(entry.program) === programId &&
      String(entry.year_level) === yearLevel &&
      String(entry.semester) === semester &&
      entry.academic_year === '' &&
      entry.section === null,
  )
  if (template.length) return { mode: 'template', entries: template }
  return { mode: 'empty', entries: [] }
}
