from django.core.management.base import BaseCommand
from django.db import transaction

from registrar.models import AcademicHistory, Student


class Command(BaseCommand):
    help = (
        'Backfill stale ongoing AcademicHistory rows from semester 1 to semester 2 '
        'for students whose live Student.semester is already 2.'
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--apply',
            action='store_true',
            help='Persist the updates. Without this flag, the command runs as a dry run.',
        )

    def handle(self, *args, **options):
        apply_changes = options['apply']

        candidate_students = Student.objects.filter(
            is_active=True,
            semester=2,
            academic_year__gt='',
        ).only('id', 'student_id', 'academic_year')

        updates = []
        skipped_existing_sem2 = []

        for student in candidate_students:
            if AcademicHistory.objects.filter(
                student=student,
                academic_year=student.academic_year,
                semester=2,
            ).exists():
                skipped_existing_sem2.append(student.student_id)
                continue

            history = (
                AcademicHistory.objects.filter(
                    student=student,
                    academic_year=student.academic_year,
                    semester=1,
                    status='ongoing',
                )
                .order_by('-updated_at', '-id')
                .first()
            )
            if not history:
                continue

            updates.append(
                {
                    'history_id': history.id,
                    'student_id': student.student_id,
                    'academic_year': student.academic_year,
                }
            )

        self.stdout.write(f'Found {len(updates)} stale ongoing AcademicHistory row(s) to change from semester 1 to 2.')
        if skipped_existing_sem2:
            self.stdout.write(
                f"Skipped {len(skipped_existing_sem2)} student(s) that already have a semester-2 AcademicHistory row: "
                + ', '.join(skipped_existing_sem2)
            )

        if not updates:
            self.stdout.write(self.style.SUCCESS('No changes needed.'))
            return

        for item in updates:
            self.stdout.write(
                f"History #{item['history_id']} | Student {item['student_id']} | AY {item['academic_year']} | 1 -> 2"
            )

        if not apply_changes:
            self.stdout.write(self.style.WARNING('Dry run only. Re-run with --apply to save these changes.'))
            return

        history_ids = [item['history_id'] for item in updates]
        with transaction.atomic():
            changed = AcademicHistory.objects.filter(id__in=history_ids, semester=1).update(semester=2)

        self.stdout.write(self.style.SUCCESS(f'Updated {changed} AcademicHistory row(s) from semester 1 to 2.'))
