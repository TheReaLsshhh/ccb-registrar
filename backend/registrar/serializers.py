import re

from django.contrib.auth.models import User
from rest_framework import serializers

from .models import (
    AcademicHistory,
    AcademicTerm,
    AuditLog,
    ContinuingFolderStatus,
    Department,
    Program,
    ProgramOffering,
    ProspectusEntry,
    Section,
    StaffChatConversation,
    StaffChatMessage,
    Student,
    StudentLoad,
    Subject,
    UserProfile,
)
from .services import _prospectus_entries_for_student
from .staff_chat import staff_chat_total_unread_for_user, staff_chat_unread_count_for_viewer


class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = '__all__'


class ProgramSerializer(serializers.ModelSerializer):
    class Meta:
        model = Program
        fields = '__all__'


class AcademicTermSerializer(serializers.ModelSerializer):
    class Meta:
        model = AcademicTerm
        fields = '__all__'


class ProgramOfferingSerializer(serializers.ModelSerializer):
    program_name = serializers.CharField(source='program.name', read_only=True)
    department_name = serializers.CharField(source='program.department.name', read_only=True)

    class Meta:
        model = ProgramOffering
        fields = ['id', 'program', 'program_name', 'department_name', 'year_level', 'semester', 'program_adviser', 'school_dean']


class SectionSerializer(serializers.ModelSerializer):
    program = serializers.IntegerField(source='program_offering.program_id', read_only=True)
    year_level = serializers.IntegerField(source='program_offering.year_level', read_only=True)
    semester = serializers.IntegerField(source='program_offering.semester', read_only=True)
    program_offering = serializers.PrimaryKeyRelatedField(
        queryset=ProgramOffering.objects.all(), required=False, allow_null=True
    )

    class Meta:
        model = Section
        fields = ['id', 'name', 'program', 'year_level', 'semester', 'program_offering', 'created_at', 'updated_at']

    def create(self, validated_data):
        program_offering = validated_data.pop('program_offering', None)
        if not program_offering:
            program_id = self.initial_data.get('program')
            year_level = self.initial_data.get('year_level')
            semester = self.initial_data.get('semester')
            if program_id is not None and year_level is not None and semester is not None:
                offering, _ = ProgramOffering.objects.get_or_create(
                    program_id=int(program_id),
                    year_level=int(year_level),
                    semester=int(semester),
                    defaults={'program_adviser': '', 'school_dean': ''},
                )
                program_offering = offering
        if not program_offering:
            raise serializers.ValidationError('program_offering or (program, year_level, semester) is required.')
        validated_data['program_offering'] = program_offering
        return super().create(validated_data)

    def update(self, instance, validated_data):
        program_offering = validated_data.pop('program_offering', None)
        if not program_offering and 'program' in self.initial_data:
            program_id = self.initial_data.get('program')
            year_level = self.initial_data.get('year_level')
            semester = self.initial_data.get('semester')
            if program_id is not None and year_level is not None and semester is not None:
                offering, _ = ProgramOffering.objects.get_or_create(
                    program_id=int(program_id),
                    year_level=int(year_level),
                    semester=int(semester),
                    defaults={'program_adviser': '', 'school_dean': ''},
                )
                program_offering = offering
        if program_offering:
            validated_data['program_offering'] = program_offering
        return super().update(instance, validated_data)


class SubjectSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subject
        fields = '__all__'


class ProspectusEntrySerializer(serializers.ModelSerializer):
    TIME_PATTERN = re.compile(r'^(MWF|TTH|SATURDAY)\s+.+$', re.IGNORECASE)

    class Meta:
        model = ProspectusEntry
        fields = '__all__'

    def validate_time(self, value):
        normalized = (value or '').strip().upper()
        if not normalized:
            return ''
        normalized = re.sub(r'\s+', ' ', normalized)
        if not self.TIME_PATTERN.match(normalized):
            raise serializers.ValidationError('Time must be like "MWF 7:00-8:00", "TTH 8:31-10:00", or "SATURDAY 1:00-4:30".')
        return normalized

    def validate_room(self, value):
        return (value or '').strip().upper()

    def validate(self, attrs):
        attrs = super().validate(attrs)
        program = attrs.get('program') or getattr(self.instance, 'program', None)
        year_level = attrs.get('year_level') or getattr(self.instance, 'year_level', None)
        semester = attrs.get('semester') or getattr(self.instance, 'semester', None)
        academic_year = attrs.get('academic_year', getattr(self.instance, 'academic_year', '')) or ''
        section = attrs.get('section') if 'section' in attrs else getattr(self.instance, 'section', None)
        time_value = attrs.get('time') if 'time' in attrs else getattr(self.instance, 'time', '')

        if not (program and year_level and semester and time_value):
            return attrs

        duplicate_qs = ProspectusEntry.objects.filter(
            program=program,
            year_level=year_level,
            semester=semester,
            academic_year=academic_year,
            section=section,
            time=time_value,
        )
        if self.instance:
            duplicate_qs = duplicate_qs.exclude(pk=self.instance.pk)
        if duplicate_qs.exists():
            raise serializers.ValidationError({'time': 'Duplicate time slot for this section and term.'})

        return attrs


class StudentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Student
        fields = '__all__'


class StudentLoadSerializer(serializers.ModelSerializer):
    class Meta:
        model = StudentLoad
        fields = '__all__'

    def validate(self, attrs):
        student = attrs.get('student') or getattr(self.instance, 'student', None)
        term = attrs.get('term') or getattr(self.instance, 'term', None)
        subject = attrs.get('subject') or getattr(self.instance, 'subject', None)

        if not student or not term or not subject:
            return attrs

        if not term.is_active:
            raise serializers.ValidationError('Loads can only be created or updated for the active term.')

        prospectus_entry = _prospectus_entries_for_student(student, term, subject=subject).select_related('prerequisite').first()
        if not prospectus_entry:
            raise serializers.ValidationError('Selected subject is not available in student prospectus mapping for this term.')

        prerequisite = prospectus_entry.prerequisite
        if prerequisite:
            passed = StudentLoad.objects.filter(
                student=student,
                subject=prerequisite,
                status__in=['passed', 'completed'],
            ).exists()
            if not passed:
                raise serializers.ValidationError(
                    f'Prerequisite not satisfied. Complete {prerequisite.code} before enrolling this subject.'
                )

        return attrs


class AcademicHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = AcademicHistory
        fields = '__all__'


class ContinuingFolderStatusSerializer(serializers.ModelSerializer):
    program_name = serializers.CharField(source='program.name', read_only=True)
    section_name = serializers.CharField(source='section.name', read_only=True)
    updated_by_username = serializers.CharField(source='updated_by.username', read_only=True)

    class Meta:
        model = ContinuingFolderStatus
        fields = [
            'id',
            'program',
            'program_name',
            'academic_year',
            'year_level',
            'semester',
            'section',
            'section_name',
            'status',
            'updated_by',
            'updated_by_username',
            'completed_at',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['updated_by', 'completed_at', 'created_at', 'updated_at']


class StudentDetailSerializer(serializers.ModelSerializer):
    loads = serializers.SerializerMethodField()

    class Meta:
        model = Student
        fields = '__all__'

    def get_loads(self, obj):
        load_qs = obj.loads.select_related('subject', 'term').all().order_by('-term__year_label', 'subject__code')
        result = []
        for load in load_qs:
            result.append(
                {
                    'id': load.id,
                    'status': load.status,
                    'term_id': load.term_id,
                    'term_label': f'{load.term.year_label} - Sem {load.term.semester}',
                    'subject_id': load.subject_id,
                    'subject_code': load.subject.code,
                    'subject_title': load.subject.title,
                    'subject_time': '',
                    'subject_room': '',
                }
            )
        return result

class AuditLogSerializer(serializers.ModelSerializer):
    actor_username = serializers.CharField(source='actor.username', read_only=True)

    class Meta:
        model = AuditLog
        fields = '__all__'


class UserProfileSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    photo_url = serializers.SerializerMethodField()

    class Meta:
        model = UserProfile
        fields = ['username', 'photo_url']

    def _build_versioned_photo_url(self, obj):
        if not obj.photo:
            return None
        request = self.context.get('request')
        url = obj.photo.url
        version = int(obj.updated_at.timestamp()) if obj.updated_at else None
        if version:
            separator = '&' if '?' in url else '?'
            url = f'{url}{separator}v={version}'
        return request.build_absolute_uri(url) if request else url

    def get_photo_url(self, obj):
        return self._build_versioned_photo_url(obj)


class MeSerializer(serializers.ModelSerializer):
    """Full profile for GET /me/ - includes User fields."""
    id = serializers.IntegerField(source='user.id', read_only=True)
    username = serializers.CharField(source='user.username', read_only=True)
    email = serializers.EmailField(source='user.email', read_only=True)
    first_name = serializers.CharField(source='user.first_name', read_only=True)
    last_name = serializers.CharField(source='user.last_name', read_only=True)
    password_hashed = serializers.CharField(source='user.password', read_only=True)
    last_login = serializers.DateTimeField(source='user.last_login', read_only=True)
    is_staff = serializers.BooleanField(source='user.is_staff', read_only=True)
    is_superuser = serializers.BooleanField(source='user.is_superuser', read_only=True)
    is_active = serializers.BooleanField(source='user.is_active', read_only=True)
    date_joined = serializers.DateTimeField(source='user.date_joined', read_only=True)
    photo_url = serializers.SerializerMethodField()
    staff_chat_unread_total = serializers.SerializerMethodField()

    class Meta:
        model = UserProfile
        fields = [
            'id', 'username', 'email', 'first_name', 'last_name', 'password_hashed',
            'last_login', 'is_staff', 'is_superuser', 'is_active', 'date_joined',
            'photo_url', 'staff_chat_unread_total',
        ]

    def _build_versioned_photo_url(self, obj):
        if not obj.photo:
            return None
        request = self.context.get('request')
        url = obj.photo.url
        version = int(obj.updated_at.timestamp()) if obj.updated_at else None
        if version:
            separator = '&' if '?' in url else '?'
            url = f'{url}{separator}v={version}'
        return request.build_absolute_uri(url) if request else url

    def get_photo_url(self, obj):
        return self._build_versioned_photo_url(obj)

    def get_staff_chat_unread_total(self, obj):
        return staff_chat_total_unread_for_user(obj.user)


class MeUpdateSerializer(serializers.Serializer):
    """For PATCH /me/ - only allowed fields."""
    username = serializers.CharField(required=False, max_length=150)
    email = serializers.EmailField(required=False, allow_blank=True)
    first_name = serializers.CharField(required=False, max_length=150, allow_blank=True)
    last_name = serializers.CharField(required=False, max_length=150, allow_blank=True)
    password = serializers.CharField(required=False, write_only=True, style={'input_type': 'password'})
    is_active = serializers.BooleanField(required=False)

    def validate_username(self, value):
        from django.contrib.auth.models import User
        user = self.context['request'].user
        existing = User.objects.filter(username=value).exclude(pk=user.pk).exists()
        if existing:
            raise serializers.ValidationError('A user with that username already exists.')
        return value

    def update(self, instance, validated_data):
        user = instance.user
        request = self.context['request']
        if 'username' in validated_data:
            user.username = validated_data['username']
        if 'email' in validated_data:
            user.email = validated_data['email']
        if 'first_name' in validated_data:
            user.first_name = validated_data['first_name']
        if 'last_name' in validated_data:
            user.last_name = validated_data['last_name']
        if 'password' in validated_data and validated_data['password']:
            user.set_password(validated_data['password'])
        if 'is_active' in validated_data:
            if not request.user.is_superuser:
                raise serializers.ValidationError({'is_active': 'Only superusers can change active status.'})
            user.is_active = validated_data['is_active']
        user.save()
        return instance


class RegistrarAccountCreateSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    email = serializers.EmailField(required=False, allow_blank=True)
    first_name = serializers.CharField(required=False, max_length=150, allow_blank=True)
    last_name = serializers.CharField(required=False, max_length=150, allow_blank=True)
    password = serializers.CharField(write_only=True, min_length=8, style={'input_type': 'password'})
    is_active = serializers.BooleanField(required=False, default=True)

    def validate_username(self, value):
        from django.contrib.auth.models import User

        normalized = value.strip()
        if not normalized:
            raise serializers.ValidationError('Username is required.')
        if User.objects.filter(username=normalized).exists():
            raise serializers.ValidationError('A user with that username already exists.')
        return normalized

    def create(self, validated_data):
        from django.contrib.auth.models import User

        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data.get('email', '').strip(),
            password=validated_data['password'],
            first_name=validated_data.get('first_name', '').strip(),
            last_name=validated_data.get('last_name', '').strip(),
        )
        user.is_staff = True
        user.is_superuser = False
        user.is_active = validated_data.get('is_active', True)
        user.save()
        UserProfile.objects.get_or_create(user=user)
        return user


class StaffChatPeerSerializer(serializers.ModelSerializer):
    photo_url = serializers.SerializerMethodField()
    presence = serializers.SerializerMethodField()
    last_activity_at = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name', 'photo_url', 'presence', 'last_activity_at']

    def get_presence(self, obj):
        from .staff_presence import staff_presence_status

        return staff_presence_status(obj)

    def get_last_activity_at(self, obj):
        profile = getattr(obj, 'profile', None)
        if not profile or not profile.last_activity_at:
            return None
        return profile.last_activity_at.isoformat()

    def get_photo_url(self, obj):
        profile = getattr(obj, 'profile', None)
        if not profile or not profile.photo:
            return None
        request = self.context.get('request')
        url = profile.photo.url
        version = int(profile.updated_at.timestamp()) if profile.updated_at else None
        if version:
            separator = '&' if '?' in url else '?'
            url = f'{url}{separator}v={version}'
        return request.build_absolute_uri(url) if request else url


class StaffChatMessageSerializer(serializers.ModelSerializer):
    sender_id = serializers.IntegerField(read_only=True)
    sender_username = serializers.CharField(source='sender.username', read_only=True)
    sender_first_name = serializers.CharField(source='sender.first_name', read_only=True)
    sender_last_name = serializers.CharField(source='sender.last_name', read_only=True)
    attachment_url = serializers.SerializerMethodField()
    attachment_kind = serializers.SerializerMethodField()
    attachment_name = serializers.SerializerMethodField()
    reactions = serializers.SerializerMethodField()

    class Meta:
        model = StaffChatMessage
        fields = [
            'id', 'conversation', 'sender_id', 'sender_username', 'sender_first_name', 'sender_last_name', 'body', 'created_at', 'edited_at',
            'attachment_url', 'attachment_kind', 'attachment_name',
            'reactions',
        ]
        read_only_fields = fields

    def get_reactions(self, obj):
        return [{'user_id': r.user_id, 'emoji': r.emoji} for r in obj.reactions.all()]

    def get_attachment_url(self, obj):
        if not obj.attachment:
            return None
        request = self.context.get('request')
        url = obj.attachment.url
        return request.build_absolute_uri(url) if request else url

    def get_attachment_kind(self, obj):
        if not obj.attachment or not obj.attachment.name:
            return None
        name = (obj.attachment_original_name or obj.attachment.name).lower()
        if name.endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp')):
            return 'image'
        return 'file'

    def get_attachment_name(self, obj):
        if not obj.attachment:
            return None
        return obj.attachment_original_name or None


class StaffChatConversationListSerializer(serializers.ModelSerializer):
    other_user = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()

    class Meta:
        model = StaffChatConversation
        fields = ['id', 'other_user', 'last_message', 'updated_at', 'unread_count']

    def get_other_user(self, obj):
        viewer = self.context['request'].user
        other = obj.user_b if obj.user_a_id == viewer.pk else obj.user_a
        return StaffChatPeerSerializer(other, context=self.context).data

    def get_last_message(self, obj):
        preview_text = (getattr(obj, '_rs_preview_body', None) or '').strip()
        preview_at = getattr(obj, '_rs_preview_at', None)
        preview_sender = getattr(obj, '_rs_preview_sender', None)
        last_at = getattr(obj, '_last_at', None)

        use_preview = False
        if preview_text and preview_at:
            if last_at is None:
                use_preview = True
            elif preview_at > last_at:
                use_preview = True

        if use_preview:
            return {'body': preview_text, 'created_at': preview_at, 'sender_id': preview_sender}

        raw_body = getattr(obj, '_last_body', None)
        body = (raw_body or '').strip()
        attach_name = (getattr(obj, '_last_attachment_name', None) or '').strip()
        attach_key = getattr(obj, '_last_attachment', None)
        has_attachment = bool(attach_key and str(attach_key).strip())

        def _last_msg_is_image(name: str, key: str) -> bool:
            n = f'{name} {key}'.lower()
            return n.endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'))

        if has_attachment:
            is_img = _last_msg_is_image(attach_name, str(attach_key))
            if body:
                prefix = '📷 Photo' if is_img else (f'📎 {attach_name}' if attach_name else '📎 File')
                body_out = f'{prefix} · {body}'
            else:
                if is_img:
                    suffix = f' ({attach_name})' if attach_name else ''
                    body_out = f'📷 Photo{suffix}'
                else:
                    body_out = f'📎 {attach_name}' if attach_name else '📎 File'
        elif not body and attach_name:
            body_out = f'📎 {attach_name}'
        elif not body and not attach_name:
            return None
        else:
            body_out = body
        return {
            'body': body_out,
            'created_at': last_at,
            'sender_id': getattr(obj, '_last_sender', None),
        }

    def get_unread_count(self, obj):
        return staff_chat_unread_count_for_viewer(obj, self.context['request'].user)
