from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('registrar', '0025_staff_chat_message_reaction'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='ContinuingFolderStatus',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('academic_year', models.CharField(max_length=20)),
                ('year_level', models.PositiveSmallIntegerField()),
                ('semester', models.PositiveSmallIntegerField(blank=True, null=True)),
                ('status', models.CharField(choices=[('ongoing', 'Ongoing'), ('done', 'Done')], default='ongoing', max_length=20)),
                ('completed_at', models.DateTimeField(blank=True, null=True)),
                ('program', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='continuing_folder_statuses', to='registrar.program')),
                ('section', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='continuing_folder_statuses', to='registrar.section')),
                ('updated_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='updated_continuing_folder_statuses', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'indexes': [
                    models.Index(fields=['program', 'academic_year', 'year_level', 'semester', 'section'], name='registrar_c_program_ebf6ee_idx'),
                    models.Index(fields=['status'], name='registrar_c_status_0f3f5c_idx'),
                ],
                'unique_together': {('program', 'academic_year', 'year_level', 'semester', 'section')},
            },
        ),
    ]
