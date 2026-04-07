from collections import defaultdict

from django.db import transaction
from django.db.models import Count

from .models import AcademicHistory, AcademicTerm, ProspectusEntry, Student, StudentLoad


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

    year = student.academic_year or ''
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


def get_students_with_multiple_academic_history(limit=None):
    duplicate_rows = list(
        AcademicHistory.objects.values(
            'student_id',
            'student__student_id',
            'student__first_name',
            'student__last_name',
        )
        .annotate(history_count=Count('id'))
        .filter(history_count__gt=1)
        .order_by('-history_count', 'student__student_id')[:limit]
    )

    if not duplicate_rows:
        return []

    student_ids = [row['student_id'] for row in duplicate_rows]
    history_rows = (
        AcademicHistory.objects.filter(student_id__in=student_ids)
        .select_related('program', 'section')
        .order_by('student__student_id', 'academic_year', 'semester', 'id')
    )

    histories_by_student = defaultdict(list)
    for history in history_rows:
        histories_by_student[history.student_id].append(
            {
                'id': history.id,
                'academic_year': history.academic_year,
                'semester': history.semester,
                'year_level': history.year_level,
                'status': history.status,
                'program_name': history.program.name,
                'section_name': history.section.name if history.section else '',
            }
        )

    results = []
    for row in duplicate_rows:
        results.append(
            {
                'student_pk': row['student_id'],
                'student_id': row['student__student_id'],
                'student_name': ' '.join(
                    part
                    for part in [row['student__first_name'], row['student__last_name']]
                    if part
                ),
                'history_count': row['history_count'],
                'histories': histories_by_student[row['student_id']],
            }
        )
    return results
