from django.core.management.base import BaseCommand

from registrar.models import Student
from registrar.services import consolidate_student_academic_histories


class Command(BaseCommand):
    help = (
        'Merge duplicate registrar_academichistory rows per (student, school year, semester). '
        'Keeps the most recently updated row, moves AcademicSubject rows onto it, deletes extras.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--student-id',
            type=str,
            default=None,
            help='Only process this school student_id (e.g. 20250001). Omit to process all students.',
        )

    def handle(self, *args, **options):
        sid = options.get('student_id')
        qs = Student.objects.all().order_by('student_id')
        if sid:
            qs = qs.filter(student_id=sid)
        total_removed = 0
        for student in qs.iterator():
            removed = consolidate_student_academic_histories(student)
            if removed:
                self.stdout.write(self.style.WARNING(f'{student.student_id}: removed {removed} duplicate history row(s).'))
            total_removed += removed
        self.stdout.write(self.style.SUCCESS(f'Done. Total duplicate history rows removed: {total_removed}.'))
