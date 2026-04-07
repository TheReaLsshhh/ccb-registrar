from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('registrar', '0008_academichistory_admission_date_academichistory_age_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='student',
            name='senior_high_track',
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name='student',
            name='senior_high_strand',
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name='academichistory',
            name='senior_high_track',
            field=models.CharField(blank=True, max_length=120),
        ),
        migrations.AddField(
            model_name='academichistory',
            name='senior_high_strand',
            field=models.CharField(blank=True, max_length=120),
        ),
    ]
