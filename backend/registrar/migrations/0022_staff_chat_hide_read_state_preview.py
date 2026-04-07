# Generated manually

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [
        ('registrar', '0021_staff_chat_conversation_last_preview'),
    ]

    operations = [
        migrations.RemoveField(model_name='staffchatconversation', name='last_preview_at'),
        migrations.RemoveField(model_name='staffchatconversation', name='last_preview_sender_id'),
        migrations.RemoveField(model_name='staffchatconversation', name='last_preview_text'),
        migrations.AddField(
            model_name='staffchatreadstate',
            name='thread_list_preview_body',
            field=models.CharField(blank=True, default='', max_length=512),
        ),
        migrations.AddField(
            model_name='staffchatreadstate',
            name='thread_list_preview_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='staffchatreadstate',
            name='thread_list_preview_message',
            field=models.ForeignKey(
                blank=True,
                help_text='When set, thread_list_preview_* lines are cleared if this user unhides this message.',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='+',
                to='registrar.staffchatmessage',
            ),
        ),
        migrations.AddField(
            model_name='staffchatreadstate',
            name='thread_list_preview_sender_id',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
    ]
