from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('registrar', '0010_add_approval_dates'),
    ]

    operations = [
        migrations.AddField(
            model_name='subject',
            name='room',
            field=models.CharField(blank=True, default='', max_length=40),
        ),
        migrations.AddField(
            model_name='subject',
            name='time',
            field=models.CharField(blank=True, default='', max_length=40),
        ),
    ]
