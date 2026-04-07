# Generated manually for ProgramOffering and Section migration

import django.db.models.deletion
from django.db import migrations, models


def migrate_sections_to_program_offering(apps, schema_editor):
    Section = apps.get_model('registrar', 'Section')
    ProgramOffering = apps.get_model('registrar', 'ProgramOffering')

    for section in Section.objects.select_related('program').iterator():
        offering, _ = ProgramOffering.objects.get_or_create(
            program_id=section.program_id,
            year_level=section.year_level,
            semester=section.semester,
            defaults={
                'program_adviser': section.program.program_adviser or '',
                'school_dean': section.program.school_dean or '',
            },
        )
        section.program_offering_id = offering.id
        section.save(update_fields=['program_offering_id'])


def reverse_migrate(apps, schema_editor):
    Section = apps.get_model('registrar', 'Section')
    for section in Section.objects.select_related('program_offering').iterator():
        section.program_id = section.program_offering.program_id
        section.year_level = section.program_offering.year_level
        section.semester = section.program_offering.semester
        section.save(update_fields=['program_id', 'year_level', 'semester'])


class Migration(migrations.Migration):

    dependencies = [
        ('registrar', '0015_userprofile_token_invalid_before'),
    ]

    operations = [
        migrations.CreateModel(
            name='ProgramOffering',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('year_level', models.PositiveSmallIntegerField(db_index=True)),
                ('semester', models.PositiveSmallIntegerField(db_index=True, default=1)),
                ('program_adviser', models.CharField(blank=True, max_length=120)),
                ('school_dean', models.CharField(blank=True, max_length=120)),
                ('program', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='offerings', to='registrar.program')),
            ],
            options={
                'unique_together': {('program', 'year_level', 'semester')},
            },
        ),
        migrations.AddField(
            model_name='section',
            name='program_offering',
            field=models.ForeignKey(
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name='sections',
                to='registrar.programoffering',
            ),
        ),
        migrations.RunPython(migrate_sections_to_program_offering, reverse_migrate),
        migrations.RemoveField(
            model_name='section',
            name='program',
        ),
        migrations.RemoveField(
            model_name='section',
            name='year_level',
        ),
        migrations.RemoveField(
            model_name='section',
            name='semester',
        ),
        migrations.AlterField(
            model_name='section',
            name='program_offering',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT,
                related_name='sections',
                to='registrar.programoffering',
            ),
        ),
    ]
