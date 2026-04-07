import uuid

from django.contrib.auth.models import User
from django.db import models


class TimeStampedModel(models.Model):
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        abstract = True


def user_profile_photo_upload_to(instance, filename: str) -> str:
    safe = filename.replace('\\', '/').split('/')[-1]
    return f'profiles/user_{instance.user_id}/{safe}'


class UserProfile(TimeStampedModel):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    photo = models.ImageField(upload_to=user_profile_photo_upload_to, blank=True, null=True)
    token_invalid_before = models.DateTimeField(null=True, blank=True)
    last_activity_at = models.DateTimeField(null=True, blank=True, db_index=True)

    def __str__(self) -> str:
        return f'Profile({self.user.username})'


class Department(TimeStampedModel):
    name = models.CharField(max_length=120)
    code = models.CharField(max_length=20, blank=True, default='')

    def __str__(self) -> str:
        return f'{self.code} - {self.name}' if self.code else self.name


class Program(TimeStampedModel):
    name = models.CharField(max_length=150)
    code = models.CharField(max_length=20, blank=True, default='')
    department = models.ForeignKey(Department, on_delete=models.PROTECT, related_name='programs')
    program_adviser = models.CharField(max_length=120, blank=True)
    school_dean = models.CharField(max_length=120, blank=True)

    def __str__(self) -> str:
        return self.name


class ProgramOffering(TimeStampedModel):
    """Program + Year Level + Semester with its own Program Adviser and School Dean."""
    program = models.ForeignKey(Program, on_delete=models.PROTECT, related_name='offerings')
    year_level = models.PositiveSmallIntegerField(db_index=True)
    semester = models.PositiveSmallIntegerField(default=1, db_index=True)
    program_adviser = models.CharField(max_length=120, blank=True)
    school_dean = models.CharField(max_length=120, blank=True)

    class Meta:
        unique_together = ('program', 'year_level', 'semester')

    def __str__(self) -> str:
        return f'{self.program.name} Year {self.year_level} - Sem {self.semester}'


class AcademicTerm(TimeStampedModel):
    year_label = models.CharField(max_length=20)
    semester = models.PositiveSmallIntegerField(db_index=True)
    is_active = models.BooleanField(default=False)

    class Meta:
        unique_together = ('year_label', 'semester')


class Section(TimeStampedModel):
    name = models.CharField(max_length=40)
    program_offering = models.ForeignKey(
        ProgramOffering, on_delete=models.PROTECT, related_name='sections',
    )


class Subject(TimeStampedModel):
    code = models.CharField(max_length=20, unique=True)
    title = models.CharField(max_length=180)
    units = models.DecimalField(max_digits=4, decimal_places=1)
    time = models.CharField(max_length=40, blank=True, default='')
    room = models.CharField(max_length=40, blank=True, default='')

    def __str__(self) -> str:
        return self.code


class ProspectusEntry(TimeStampedModel):
    program = models.ForeignKey(Program, on_delete=models.CASCADE, related_name='prospectus_entries')
    subject = models.ForeignKey(Subject, on_delete=models.PROTECT, related_name='prospectus_entries')
    year_level = models.PositiveSmallIntegerField()
    semester = models.PositiveSmallIntegerField()
    academic_year = models.CharField(max_length=20, blank=True, default='')
    section = models.ForeignKey(Section, on_delete=models.SET_NULL, related_name='prospectus_entries', null=True, blank=True)
    prerequisite = models.ForeignKey(Subject, on_delete=models.PROTECT, related_name='unlocks', null=True, blank=True)
    time = models.CharField(max_length=40, blank=True, default='')
    room = models.CharField(max_length=40, blank=True, default='')

    class Meta:
        unique_together = ('program', 'subject', 'year_level', 'semester', 'academic_year', 'section')
        indexes = [
            models.Index(fields=['year_level', 'semester']),
            models.Index(fields=['program', 'year_level', 'semester', 'academic_year', 'section']),
        ]


class Student(TimeStampedModel):
    student_id = models.CharField(max_length=30, unique=True, db_index=True)
    first_name = models.CharField(max_length=80)
    last_name = models.CharField(max_length=80)
    middle_name = models.CharField(max_length=80, blank=True)
    extension_name = models.CharField(max_length=30, blank=True)
    gender = models.CharField(max_length=20, blank=True)
    sex = models.CharField(max_length=20, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    age = models.PositiveSmallIntegerField(null=True, blank=True)
    civil_status = models.CharField(max_length=30, blank=True)
    nationality = models.CharField(max_length=60, blank=True)
    admission_date = models.DateField(null=True, blank=True)
    scholarship = models.CharField(max_length=120, blank=True)
    course = models.CharField(max_length=120, blank=True)
    program = models.ForeignKey(Program, on_delete=models.PROTECT, related_name='students')
    section = models.ForeignKey(Section, on_delete=models.PROTECT, related_name='students', null=True, blank=True)
    year_level = models.PositiveSmallIntegerField(default=1, db_index=True)
    academic_year = models.CharField(max_length=20, blank=True)
    semester = models.PositiveSmallIntegerField(null=True, blank=True)
    home_address = models.TextField(blank=True)
    postal_code = models.CharField(max_length=12, blank=True)
    email_address = models.EmailField(blank=True)
    contact_number = models.CharField(max_length=30, blank=True)
    mother_maiden_name = models.CharField(max_length=120, blank=True)
    mother_contact_number = models.CharField(max_length=30, blank=True)
    father_name = models.CharField(max_length=120, blank=True)
    father_contact_number = models.CharField(max_length=30, blank=True)
    elementary_school = models.CharField(max_length=180, blank=True)
    junior_high_school = models.CharField(max_length=180, blank=True)
    senior_high_school = models.CharField(max_length=180, blank=True)
    senior_high_track = models.CharField(max_length=120, blank=True)
    senior_high_strand = models.CharField(max_length=120, blank=True)
    senior_high_track_strand = models.CharField(max_length=120, blank=True)
    subject_load_schedule = models.TextField(blank=True)
    adviser_name = models.CharField(max_length=120, blank=True)
    adviser_approval_status = models.CharField(max_length=20, default='pending')
    adviser_approval_date = models.DateField(null=True, blank=True)
    dean_name = models.CharField(max_length=120, blank=True)
    dean_approval_status = models.CharField(max_length=20, default='pending')
    dean_approval_date = models.DateField(null=True, blank=True)
    is_active = models.BooleanField(default=True)

    def __str__(self) -> str:
        return self.student_id


class StudentLoad(TimeStampedModel):
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='loads')
    term = models.ForeignKey(AcademicTerm, on_delete=models.PROTECT, related_name='loads')
    subject = models.ForeignKey(Subject, on_delete=models.PROTECT, related_name='student_loads')
    status = models.CharField(max_length=20, default='enrolled')

    class Meta:
        unique_together = ('student', 'term', 'subject')


class AcademicHistory(TimeStampedModel):
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name='academic_history')
    academic_year = models.CharField(max_length=20)  # "2025-2026"
    year_level = models.PositiveSmallIntegerField()  # 1, 2, 3, 4
    semester = models.PositiveSmallIntegerField()  # 1, 2, Summer
    program = models.ForeignKey(Program, on_delete=models.PROTECT)
    section = models.ForeignKey(Section, on_delete=models.PROTECT, null=True, blank=True)
    
    # Personal Information (snapshot from Student at time of semester)
    first_name = models.CharField(max_length=80, null=True, blank=True)
    last_name = models.CharField(max_length=80, null=True, blank=True)
    middle_name = models.CharField(max_length=80, blank=True)
    extension_name = models.CharField(max_length=30, blank=True)
    gender = models.CharField(max_length=20, blank=True)
    sex = models.CharField(max_length=20, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    age = models.PositiveSmallIntegerField(null=True, blank=True)
    civil_status = models.CharField(max_length=30, blank=True)
    nationality = models.CharField(max_length=60, blank=True)
    admission_date = models.DateField(null=True, blank=True)
    scholarship = models.CharField(max_length=120, blank=True)
    course = models.CharField(max_length=120, blank=True)
    
    # Contact Information (snapshot)
    home_address = models.TextField(blank=True)
    postal_code = models.CharField(max_length=12, blank=True)
    email_address = models.EmailField(blank=True)
    contact_number = models.CharField(max_length=30, blank=True)
    
    # Family Information (snapshot)
    mother_maiden_name = models.CharField(max_length=120, blank=True)
    mother_contact_number = models.CharField(max_length=30, blank=True)
    father_name = models.CharField(max_length=120, blank=True)
    father_contact_number = models.CharField(max_length=30, blank=True)
    
    # Educational Background (snapshot)
    elementary_school = models.CharField(max_length=180, blank=True)
    junior_high_school = models.CharField(max_length=180, blank=True)
    senior_high_school = models.CharField(max_length=180, blank=True)
    senior_high_track = models.CharField(max_length=120, blank=True)
    senior_high_strand = models.CharField(max_length=120, blank=True)
    senior_high_track_strand = models.CharField(max_length=120, blank=True) 
    
    # Academic Information for this Semester
    subject_load_schedule = models.TextField(blank=True)
    adviser_name = models.CharField(max_length=120, blank=True)
    adviser_approval_status = models.CharField(max_length=20, default='pending')
    adviser_approval_date = models.DateField(null=True, blank=True)
    dean_name = models.CharField(max_length=120, blank=True)
    dean_approval_status = models.CharField(max_length=20, default='pending')
    dean_approval_date = models.DateField(null=True, blank=True)
    
    # Status and Dates
    status = models.CharField(max_length=20, default='ongoing')  # ongoing, completed, dropped
    start_date = models.DateField()
    end_date = models.DateField(null=True, blank=True)
    
    class Meta:
        unique_together = ('student', 'academic_year', 'semester')
        ordering = ['-academic_year', '-semester']

    def __str__(self) -> str:
        return f'{self.student.student_id} - {self.academic_year} Year {self.year_level} Sem {self.semester}'


class AcademicSubject(TimeStampedModel):
    academic_history = models.ForeignKey(AcademicHistory, on_delete=models.CASCADE, related_name='subjects')
    subject = models.ForeignKey(Subject, on_delete=models.PROTECT)
    credits = models.DecimalField(max_digits=4, decimal_places=1)
    status = models.CharField(max_length=20, default='enrolled')  # enrolled, completed
    
    class Meta:
        unique_together = ('academic_history', 'subject')

    def __str__(self) -> str:
        return f'{self.academic_history.student.student_id} - {self.subject.code}'


class ContinuingFolderStatus(TimeStampedModel):
    STATUS_ONGOING = 'ongoing'
    STATUS_DONE = 'done'
    STATUS_CHOICES = [
        (STATUS_ONGOING, 'Ongoing'),
        (STATUS_DONE, 'Done'),
    ]

    program = models.ForeignKey(Program, on_delete=models.CASCADE, related_name='continuing_folder_statuses')
    academic_year = models.CharField(max_length=20)
    year_level = models.PositiveSmallIntegerField()
    semester = models.PositiveSmallIntegerField(null=True, blank=True)
    section = models.ForeignKey(Section, on_delete=models.CASCADE, related_name='continuing_folder_statuses', null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_ONGOING)
    updated_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='updated_continuing_folder_statuses')
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ('program', 'academic_year', 'year_level', 'semester', 'section')
        indexes = [
            models.Index(fields=['program', 'academic_year', 'year_level', 'semester', 'section']),
            models.Index(fields=['status']),
        ]

    def __str__(self) -> str:
        section_name = self.section.name if self.section_id else 'Unassigned'
        semester = self.semester if self.semester is not None else '-'
        return f'{self.program.name} | {self.academic_year} | Year {self.year_level} | Section {section_name} | Sem {semester}'


class StaffChatConversation(TimeStampedModel):
    """Direct thread between two staff users. IDs are stored with user_a_id < user_b_id."""

    user_a = models.ForeignKey(User, on_delete=models.CASCADE, related_name='staff_chat_as_lower')
    user_b = models.ForeignKey(User, on_delete=models.CASCADE, related_name='staff_chat_as_higher')

    class Meta:
        constraints = [
            models.CheckConstraint(check=models.Q(user_a_id__lt=models.F('user_b_id')), name='staffchat_ordered_pair'),
            models.UniqueConstraint(fields=['user_a', 'user_b'], name='staffchat_unique_pair'),
        ]


def staff_chat_attachment_upload_to(instance, filename: str) -> str:
    safe = filename.replace('\\', '/').split('/')[-1]
    return f'staff-chat/conv_{instance.conversation_id}/{uuid.uuid4().hex}_{safe}'


class StaffChatMessage(TimeStampedModel):
    conversation = models.ForeignKey(StaffChatConversation, on_delete=models.CASCADE, related_name='messages')
    sender = models.ForeignKey(User, on_delete=models.CASCADE, related_name='staff_chat_messages_sent')
    body = models.CharField(max_length=4000, blank=True, default='')
    attachment = models.FileField(upload_to=staff_chat_attachment_upload_to, blank=True, null=True, max_length=500)
    attachment_original_name = models.CharField(max_length=255, blank=True, default='')
    edited_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['created_at', 'id']


class StaffChatMessageReaction(TimeStampedModel):
    """One reaction emoji per user per message (change by posting a different emoji)."""

    message = models.ForeignKey(StaffChatMessage, on_delete=models.CASCADE, related_name='reactions')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='staff_chat_message_reactions')
    emoji = models.CharField(max_length=32)

    class Meta:
        ordering = ['id']
        constraints = [
            models.UniqueConstraint(fields=['message', 'user'], name='staffchat_reaction_one_per_user'),
        ]


class StaffChatMessageHidden(TimeStampedModel):
    """Per-user omission from main thread; optional listing under Hidden (recoverable)."""

    message = models.ForeignKey(StaffChatMessage, on_delete=models.CASCADE, related_name='hidden_for')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='staff_chat_hidden_messages')
    list_in_hidden_ui = models.BooleanField(
        default=True,
        help_text='If False, the user removed the message from their view (e.g. sender delete-for-me); '
        'it does not appear in Hidden and cannot be unhidden.',
    )

    class Meta:
        unique_together = ('message', 'user')


class StaffChatReadState(TimeStampedModel):
    """Per-user read cursor for a conversation (messages after this are unread for that user)."""

    conversation = models.ForeignKey(StaffChatConversation, on_delete=models.CASCADE, related_name='read_states')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='staff_chat_read_states')
    last_read_message = models.ForeignKey(
        StaffChatMessage, on_delete=models.SET_NULL, null=True, blank=True, related_name='+'
    )
    thread_list_preview_body = models.CharField(max_length=512, blank=True, default='')
    thread_list_preview_at = models.DateTimeField(null=True, blank=True)
    thread_list_preview_sender_id = models.PositiveIntegerField(null=True, blank=True)
    thread_list_preview_message = models.ForeignKey(
        StaffChatMessage,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='+',
        help_text='When set, thread_list_preview_* lines are cleared if this user unhides this message.',
    )

    class Meta:
        unique_together = ('conversation', 'user')


class AuditLog(TimeStampedModel):
    actor = models.ForeignKey(User, on_delete=models.SET_NULL, null=True)
    action = models.CharField(max_length=20)
    entity = models.CharField(max_length=50)
    entity_id = models.CharField(max_length=50)
    payload = models.JSONField(default=dict)
