from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('registrar', '0009_split_track_and_strand_fields'),
    ]

    operations = [
        migrations.AddField(
            model_name='student',
            name='adviser_approval_date',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='student',
            name='dean_approval_date',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='academichistory',
            name='adviser_approval_date',
            field=models.DateField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='academichistory',
            name='dean_approval_date',
            field=models.DateField(blank=True, null=True),
        ),
    ]
