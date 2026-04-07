# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('registrar', '0022_staff_chat_hide_read_state_preview'),
    ]

    operations = [
        migrations.AddField(
            model_name='staffchatmessagehidden',
            name='list_in_hidden_ui',
            field=models.BooleanField(
                default=True,
                help_text='If False, the user removed the message from their view (e.g. sender delete-for-me); '
                'it does not appear in Hidden and cannot be unhidden.',
            ),
        ),
    ]
