from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('registrar', '0011_subject_time_and_room'),
    ]

    operations = [
        migrations.AddField(
            model_name='prospectusentry',
            name='room',
            field=models.CharField(blank=True, default='', max_length=40),
        ),
        migrations.AddField(
            model_name='prospectusentry',
            name='time',
            field=models.CharField(blank=True, default='', max_length=40),
        ),
    ]
