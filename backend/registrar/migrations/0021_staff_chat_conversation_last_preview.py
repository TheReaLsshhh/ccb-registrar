# Generated manually

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('registrar', '0020_staff_chat_edit_hide'),
    ]

    operations = [
        migrations.AddField(
            model_name='staffchatconversation',
            name='last_preview_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='staffchatconversation',
            name='last_preview_sender_id',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='staffchatconversation',
            name='last_preview_text',
            field=models.CharField(
                blank=True,
                default='',
                help_text='Denormalized sidebar preview when the latest activity was a delete-for-everyone.',
                max_length=512,
            ),
        ),
    ]
