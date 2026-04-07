from django.db import migrations


def copy_subject_schedule_to_prospectus(apps, schema_editor):
    Subject = apps.get_model('registrar', 'Subject')
    ProspectusEntry = apps.get_model('registrar', 'ProspectusEntry')

    subject_schedule = {
        subject.id: {'time': (subject.time or '').strip().upper(), 'room': (subject.room or '').strip().upper()}
        for subject in Subject.objects.all().only('id', 'time', 'room')
    }

    for entry in ProspectusEntry.objects.all().only('id', 'subject_id', 'time', 'room'):
        if (entry.time or '').strip() and (entry.room or '').strip():
            continue
        source = subject_schedule.get(entry.subject_id)
        if not source:
            continue
        if not (entry.time or '').strip() and source['time']:
            entry.time = source['time']
        if not (entry.room or '').strip() and source['room']:
            entry.room = source['room']
        entry.save(update_fields=['time', 'room'])


class Migration(migrations.Migration):

    dependencies = [
        ('registrar', '0012_prospectusentry_time_and_room'),
    ]

    operations = [
        migrations.RunPython(copy_subject_schedule_to_prospectus, migrations.RunPython.noop),
    ]
