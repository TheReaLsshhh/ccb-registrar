from collections import defaultdict

from django.db import transaction
from django.db.models import Count
from django.db.models.functions import Trim

from .academic_utils import normalize_academic_year_label
from .models import AcademicHistory, AcademicSubject, AcademicTerm, ProspectusEntry, Student, StudentLoad


def _has_passed_prerequisite(student, prerequisite_subject):
    if not prerequisite_subject:
        return True
    return StudentLoad.objects.filter(
        student=student,
        subject=prerequisite_subject,
        status__in=['passed', 'completed'],
    ).exists()


def _prospectus_entries_for_student(student, term, subject=None):
    base_qs = ProspectusEntry.objects.filter(
        program=student.program,
        year_level=student.year_level,
        semester=term.semester,
    )
    if subject is not None:
        base_qs = base_qs.filter(subject=subject)

    year = normalize_academic_year_label(student.academic_year or '')
    section_id = student.section_id

    if year and section_id:
        qs = base_qs.filter(academic_year=year, section_id=section_id)
        if qs.exists():
            return qs
    if year:
        qs = base_qs.filter(academic_year=year, section__isnull=True)
        if qs.exists():
            return qs
    if section_id:
        qs = base_qs.filter(academic_year='', section_id=section_id)
        if qs.exists():
            return qs
    return base_qs.filter(academic_year='', section__isnull=True)


def get_eligible_subjects(student, term):
    entries = _prospectus_entries_for_student(student, term).select_related('subject', 'prerequisite')

    eligible = []
    for entry in entries:
        if _has_passed_prerequisite(student, entry.prerequisite):
            eligible.append(entry.subject)
    return eligible


def auto_load_students(student_ids, term_id):
    created = 0
    with transaction.atomic():
        term = AcademicTerm.objects.get(pk=term_id)
        students = Student.objects.filter(student_id__in=student_ids, is_active=True).select_related('program')
        for student in students:
            subjects = get_eligible_subjects(student, term)
            for subject in subjects:
                _, was_created = StudentLoad.objects.get_or_create(
                    student=student,
                    term_id=term_id,
                    subject=subject,
                    defaults={'status': 'enrolled'},
                )
                if was_created:
                    created += 1
    return {'created_load_rows': created}


def consolidate_student_academic_histories(student: Student) -> int:
    """
    Merge duplicate AcademicHistory rows for the same student that share the same logical
    (school year after normalization, semester). Moves AcademicSubject rows onto one keeper
    row and deletes extras so update_or_create() cannot raise MultipleObjectsReturned.

    Returns the number of AcademicHistory rows removed.
    """
    rows = list(AcademicHistory.objects.filter(student=student).order_by('id'))
    if len(rows) < 2:
        return 0

    groups: dict[tuple[str, int], list[AcademicHistory]] = defaultdict(list)
    for row in rows:
        key = (normalize_academic_year_label(row.academic_year), row.semester)
        groups[key].append(row)

    removed = 0
    for _key, group in groups.items():
        if len(group) <= 1:
            continue
        keeper = max(group, key=lambda x: (x.updated_at, x.pk))
        for dup in group:
            if dup.pk == keeper.pk:
                continue
            for sub in AcademicSubject.objects.filter(academic_history=dup).select_related('subject'):
                AcademicSubject.objects.update_or_create(
                    academic_history=keeper,
                    subject=sub.subject,
                    defaults={'credits': sub.credits, 'status': sub.status},
                )
            dup.delete()
            removed += 1

        nay = normalize_academic_year_label(keeper.academic_year)
        AcademicHistory.objects.filter(pk=keeper.pk).update(academic_year=nay)

    return removed


def get_students_with_multiple_academic_history(limit=None):
    """
    Students who have more than one AcademicHistory row for the same (trimmed school year, semester).
    """
    duplicate_key_rows = (
        AcademicHistory.objects.annotate(ay_trim=Trim('academic_year'))
        .values('student_id', 'ay_trim', 'semester')
        .annotate(history_count=Count('id'))
        .filter(history_count__gt=1)
        .order_by('-history_count', 'student_id', 'ay_trim', 'semester')
    )
    if limit is not None:
        duplicate_key_rows = duplicate_key_rows[: int(limit)]

    rows = list(duplicate_key_rows)
    if not rows:
        return []

    student_ids = list({r['student_id'] for r in rows})
    students = {s.id: s for s in Student.objects.filter(pk__in=student_ids)}
    history_rows = (
        AcademicHistory.objects.filter(student_id__in=student_ids)
        .annotate(ay_trim=Trim('academic_year'))
        .select_related('program', 'section')
        .order_by('student_id', 'ay_trim', 'semester', 'id')
    )

    histories_by_key: dict[tuple[int, str, int], list[dict]] = defaultdict(list)
    for history in history_rows:
        key = (history.student_id, history.ay_trim, history.semester)
        histories_by_key[key].append(
            {
                'id': history.id,
                'academic_year': history.academic_year,
                'ay_trim': history.ay_trim,
                'semester': history.semester,
                'year_level': history.year_level,
                'status': history.status,
                'program_name': history.program.name,
                'section_name': history.section.name if history.section else '',
            }
        )

    results = []
    for row in rows:
        key = (row['student_id'], row['ay_trim'], row['semester'])
        st = students.get(row['student_id'])
        results.append(
            {
                'student_pk': row['student_id'],
                'student_id': st.student_id if st else '',
                'student_name': ' '.join(part for part in [st.first_name, st.last_name] if st and part) if st else '',
                'history_count': row['history_count'],
                'ay_trim': row['ay_trim'],
                'semester': row['semester'],
                'histories': histories_by_key[key],
            }
        )
    return results
