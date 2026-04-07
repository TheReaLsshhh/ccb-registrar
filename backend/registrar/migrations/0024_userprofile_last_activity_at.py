from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('registrar', '0023_staff_chat_hidden_list_in_ui'),
    ]

    operations = [
        migrations.AddField(
            model_name='userprofile',
            name='last_activity_at',
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
    ]
