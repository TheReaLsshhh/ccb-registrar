import re
from datetime import date
from pathlib import Path

from django.db import transaction
from django.db.models import Exists, OuterRef, Prefetch, Q, Subquery
from django.shortcuts import get_object_or_404
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet, ReadOnlyModelViewSet

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
    StaffChatMessageHidden,
    StaffChatMessageReaction,
    StaffChatReadState,
    Student,
    StudentLoad,
    Subject,
    UserProfile,
)
from .academic_utils import normalize_academic_year_label
from .permissions import IsRegistrarOrStaff
from .serializers import (
    AcademicHistorySerializer,
    AcademicTermSerializer,
    AuditLogSerializer,
    ContinuingFolderStatusSerializer,
    DepartmentSerializer,
    MeSerializer,
    MeUpdateSerializer,
    ProgramOfferingSerializer,
    ProgramSerializer,
    ProspectusEntrySerializer,
    RegistrarAccountCreateSerializer,
    SectionSerializer,
    StaffChatConversationListSerializer,
    StaffChatMessageSerializer,
    StaffChatPeerSerializer,
    StudentDetailSerializer,
    StudentLoadSerializer,
    StudentSerializer,
    SubjectSerializer,
    UserProfileSerializer,
)
from .services import (
    auto_load_students,
    consolidate_student_academic_histories,
    get_eligible_subjects,
    get_students_with_multiple_academic_history,
)
from .staff_chat import (
    STAFF_CHAT_ALLOWED_REACTION_EMOJIS,
    broadcast_staff_chat_message,
    broadcast_staff_chat_payload,
    clear_thread_list_preview_for_conversation,
    get_or_create_staff_conversation,
    messages_visible_to_user_qs,
    set_thread_list_preview_for_user,
    set_thread_list_preview_for_participants,
    staff_chat_reaction_list_preview,
    staff_chat_delete_list_preview,
    sync_staff_chat_read_state,
)
from .tasks import auto_load_students_task

STAFF_CHAT_ALLOWED_ATTACHMENT_SUFFIXES = frozenset({
    '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.txt', '.csv',
    '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp',
})
STAFF_CHAT_ATTACHMENT_MAX_BYTES = 15 * 1024 * 1024

_STAFF_CHAT_MSG_REACTIONS_PREFETCH = Prefetch(
    'reactions',
    queryset=StaffChatMessageReaction.objects.order_by('id'),
)


def _parse_tor_schedule_rows(schedule_text, subjects_by_code):
    if not schedule_text or not schedule_text.strip():
        return []

    rows = []
    row_map = {}

    def parse_schedule_side(raw_side):
        units_match = re.match(r'^(.*?)(?:\s*\(([^()]*)\))?\s*$', raw_side)
        content = units_match.group(1).strip() if units_match else raw_side.strip()
        units = (units_match.group(2).strip() if units_match and units_match.group(2) else '')
        separator_index = content.find(': ')
        if separator_index < 0:
            return None
        time = content[:separator_index].strip()
        subject_text = content[separator_index + 2 :].strip()
        return {'time': time, 'subject_text': subject_text, 'units': units}

    def resolve_subject_parts(subject_text):
        normalized = subject_text.strip()
        if not normalized or normalized.upper() == 'SATURDAY':
            return None

        normalized = normalized.replace('\u00a0', ' ')
        matched_subject = None
        for code, subject in subjects_by_code.items():
            if normalized == code or normalized.startswith(f'{code} '):
                matched_subject = subject
                break

        if matched_subject:
            return {
                'subject_code': matched_subject.code,
                'descriptive_title': matched_subject.title,
                'credits': float(matched_subject.units),
            }

        parts = normalized.split(None, 1)
        code = parts[0] if parts else normalized
        title = parts[1] if len(parts) > 1 else normalized
        return {
            'subject_code': code,
            'descriptive_title': title,
            'credits': 0.0,
        }

    for raw_line in schedule_text.splitlines():
        normalized_line = ' '.join(raw_line.split()).strip()
        if not normalized_line:
            continue

        schedule_segments = []
        mwf_match = re.match(r'^MWF\s+(.*?)(?:\s+\|\s+TTH\s+(.*))?$', normalized_line)
        if mwf_match:
            schedule_segments.append(('MWF', mwf_match.group(1).strip()))
            if mwf_match.group(2):
                schedule_segments.append(('TTH', mwf_match.group(2).strip()))

        for day_label, raw_side in schedule_segments:
            parsed_side = parse_schedule_side(raw_side)
            if not parsed_side:
                continue
            subject_parts = resolve_subject_parts(parsed_side['subject_text'])
            if not subject_parts:
                continue

            row_key = (
                subject_parts['subject_code'],
                subject_parts['descriptive_title'],
                parsed_side['units'] or subject_parts['credits'],
            )
            schedule_label = f"{day_label} {parsed_side['time']}".strip()

            existing = row_map.get(row_key)
            if existing:
                if schedule_label and schedule_label not in existing['schedule_parts']:
                    existing['schedule_parts'].append(schedule_label)
                continue

            row = {
                'subject_code': subject_parts['subject_code'],
                'descriptive_title': subject_parts['descriptive_title'],
                'credits': float(parsed_side['units']) if parsed_side['units'] else float(subject_parts['credits']),
                'schedule_parts': [schedule_label] if schedule_label else [],
            }
            row_map[row_key] = row
            rows.append(row)

    return rows


def sync_student_current_academic_history(student):
    if not student.academic_year or not student.semester:
        return None

    consolidate_student_academic_histories(student)

    today = date.today()
    academic_year_key = normalize_academic_year_label(student.academic_year)
    history, _ = AcademicHistory.objects.update_or_create(
        student=student,
        academic_year=academic_year_key,
        semester=student.semester,
        defaults={
            'academic_year': academic_year_key,
            'year_level': student.year_level,
            'program': student.program,
            'section': student.section,
            'first_name': student.first_name,
            'last_name': student.last_name,
            'middle_name': student.middle_name,
            'extension_name': student.extension_name,
            'gender': student.gender,
            'sex': student.sex,
            'date_of_birth': student.date_of_birth,
            'age': student.age,
            'civil_status': student.civil_status,
            'nationality': student.nationality,
            'admission_date': student.admission_date,
            'scholarship': student.scholarship,
            'course': student.course,
            'home_address': student.home_address,
            'postal_code': student.postal_code,
            'email_address': student.email_address,
            'contact_number': student.contact_number,
            'mother_maiden_name': student.mother_maiden_name,
            'mother_contact_number': student.mother_contact_number,
            'father_name': student.father_name,
            'father_contact_number': student.father_contact_number,
            'elementary_school': student.elementary_school,
            'junior_high_school': student.junior_high_school,
            'senior_high_school': student.senior_high_school,
            'senior_high_track': student.senior_high_track,
            'senior_high_strand': student.senior_high_strand,
            'senior_high_track_strand': student.senior_high_track_strand,
            'subject_load_schedule': student.subject_load_schedule,
            'adviser_name': student.adviser_name,
            'adviser_approval_status': student.adviser_approval_status,
            'adviser_approval_date': student.adviser_approval_date,
            'dean_name': student.dean_name,
            'dean_approval_status': student.dean_approval_status,
            'dean_approval_date': student.dean_approval_date,
            'status': 'ongoing',
            'start_date': student.admission_date or today,
            'end_date': None,
        },
    )
    return history


def _user_in_staff_conversation(conversation: StaffChatConversation, user) -> bool:
    return user.pk in (conversation.user_a_id, conversation.user_b_id)


def _annotate_staff_chat_conversation_for_viewer(qs, user):
    hidden_ids = StaffChatMessageHidden.objects.filter(user=user).values('message_id')
    visible = StaffChatMessage.objects.filter(conversation=OuterRef('pk')).exclude(id__in=hidden_ids)
    rs = StaffChatReadState.objects.filter(conversation=OuterRef('pk'), user=user)
    return qs.annotate(
        _last_body=Subquery(visible.order_by('-created_at', '-id').values('body')[:1]),
        _last_at=Subquery(visible.order_by('-created_at', '-id').values('created_at')[:1]),
        _last_sender=Subquery(visible.order_by('-created_at', '-id').values('sender_id')[:1]),
        _last_attachment=Subquery(visible.order_by('-created_at', '-id').values('attachment')[:1]),
        _last_attachment_name=Subquery(
            visible.order_by('-created_at', '-id').values('attachment_original_name')[:1]
        ),
        _rs_preview_body=Subquery(rs.values('thread_list_preview_body')[:1]),
        _rs_preview_at=Subquery(rs.values('thread_list_preview_at')[:1]),
        _rs_preview_sender=Subquery(rs.values('thread_list_preview_sender_id')[:1]),
    )


class StaffChatPeersView(APIView):
    permission_classes = [IsRegistrarOrStaff]

    def get(self, request):
        peers = (
            User.objects.filter(is_active=True, is_staff=True)
            .exclude(pk=request.user.pk)
            .select_related('profile')
            .order_by('username')
        )
        data = StaffChatPeerSerializer(peers, many=True, context={'request': request}).data
        return Response(data)


class StaffChatConversationsView(APIView):
    permission_classes = [IsRegistrarOrStaff]

    def get(self, request):
        user = request.user
        has_any_message = StaffChatMessage.objects.filter(conversation_id=OuterRef('pk'))
        qs = (
            _annotate_staff_chat_conversation_for_viewer(
                StaffChatConversation.objects.filter(Q(user_a=user) | Q(user_b=user)).filter(
                    Exists(has_any_message),
                ),
                user,
            )
            .select_related('user_a', 'user_b', 'user_a__profile', 'user_b__profile')
            .order_by('-updated_at')
        )
        return Response(StaffChatConversationListSerializer(qs, many=True, context={'request': request}).data)

    def post(self, request):
        other_pk = request.data.get('other_user')
        try:
            other_pk = int(other_pk)
        except (TypeError, ValueError):
            return Response({'detail': 'other_user must be a user id.'}, status=status.HTTP_400_BAD_REQUEST)

        other = get_object_or_404(User, pk=other_pk, is_active=True, is_staff=True)
        if other.pk == request.user.pk:
            return Response({'detail': 'Cannot start a chat with yourself.'}, status=status.HTTP_400_BAD_REQUEST)

        conversation, created = get_or_create_staff_conversation(request.user, other)
        annotated = (
            _annotate_staff_chat_conversation_for_viewer(
                StaffChatConversation.objects.filter(pk=conversation.pk),
                request.user,
            )
            .select_related('user_a', 'user_b', 'user_a__profile', 'user_b__profile')
        )
        conv_obj = annotated.first()
        payload = StaffChatConversationListSerializer(conv_obj, context={'request': request}).data
        return Response({'created': created, 'conversation': payload}, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class StaffChatMessagesView(APIView):
    permission_classes = [IsRegistrarOrStaff]
    parser_classes = [JSONParser, MultiPartParser, FormParser]

    def get(self, request, pk):
        conversation = get_object_or_404(StaffChatConversation, pk=pk)
        if not _user_in_staff_conversation(conversation, request.user):
            return Response(status=status.HTTP_403_FORBIDDEN)
        try:
            limit = int(request.query_params.get('limit', 80))
        except (TypeError, ValueError):
            limit = 80
        limit = max(1, min(limit, 200))
        qs = (
            messages_visible_to_user_qs(conversation, request.user)
            .prefetch_related(_STAFF_CHAT_MSG_REACTIONS_PREFETCH)
            .order_by('-created_at', '-id')[:limit]
        )
        messages = list(reversed(list(qs)))
        # Read state is updated via POST .../read/ when the client applies this payload, so abandoned
        # in-flight GETs (e.g. user navigates away) do not mark the thread read on the server.
        return Response(
            StaffChatMessageSerializer(messages, many=True, context={'request': request}).data,
        )

    def post(self, request, pk):
        conversation = get_object_or_404(StaffChatConversation, pk=pk)
        if not _user_in_staff_conversation(conversation, request.user):
            return Response(status=status.HTTP_403_FORBIDDEN)
        body = (request.data.get('body') or '').strip()
        upload = request.FILES.get('attachment')

        if not upload and not body:
            return Response(
                {'detail': 'Message text or a file attachment is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(body) > 4000:
            return Response({'detail': 'Message is too long.'}, status=status.HTTP_400_BAD_REQUEST)

        if upload:
            if upload.size > STAFF_CHAT_ATTACHMENT_MAX_BYTES:
                return Response({'detail': 'Attachment is too large (max 15 MB).'}, status=status.HTTP_400_BAD_REQUEST)
            ext = Path(upload.name).suffix.lower()
            if ext not in STAFF_CHAT_ALLOWED_ATTACHMENT_SUFFIXES:
                return Response(
                    {'detail': f'File type not allowed. Allowed: {", ".join(sorted(STAFF_CHAT_ALLOWED_ATTACHMENT_SUFFIXES))}'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        safe_name = Path(upload.name).name[:255] if upload else ''
        message = StaffChatMessage.objects.create(
            conversation=conversation,
            sender=request.user,
            body=body,
            attachment=upload if upload else None,
            attachment_original_name=safe_name,
        )
        clear_thread_list_preview_for_conversation(conversation)
        conversation.save()
        data = StaffChatMessageSerializer(message, context={'request': request}).data
        broadcast_staff_chat_message(
            conversation_id=conversation.pk,
            message_payload=data,
            user_a_id=conversation.user_a_id,
            user_b_id=conversation.user_b_id,
        )
        sync_staff_chat_read_state(conversation, request.user)
        return Response(data, status=status.HTTP_201_CREATED)


class StaffChatMessageDetailView(APIView):
    permission_classes = [IsRegistrarOrStaff]

    def patch(self, request, pk, msg_pk):
        conversation = get_object_or_404(StaffChatConversation, pk=pk)
        if not _user_in_staff_conversation(conversation, request.user):
            return Response(status=status.HTTP_403_FORBIDDEN)
        if not messages_visible_to_user_qs(conversation, request.user).filter(pk=msg_pk).exists():
            return Response({'detail': 'Message not found.'}, status=status.HTTP_404_NOT_FOUND)

        message = get_object_or_404(StaffChatMessage, pk=msg_pk, conversation=conversation)
        if message.sender_id != request.user.id:
            return Response({'detail': 'You can only edit your own messages.'}, status=status.HTTP_403_FORBIDDEN)

        remove_attachment = request.data.get('remove_attachment')
        if remove_attachment in (True, 'true', '1', 1, 'yes'):
            if message.attachment:
                message.attachment.delete(save=False)
            message.attachment = None
            message.attachment_original_name = ''

        if 'body' in request.data:
            message.body = (request.data.get('body') or '').strip()[:4000]

        if not (message.body or '').strip() and not message.attachment:
            return Response({'detail': 'Message must have text or an attachment.'}, status=status.HTTP_400_BAD_REQUEST)

        message.edited_at = timezone.now()
        message.save()
        message = StaffChatMessage.objects.prefetch_related(_STAFF_CHAT_MSG_REACTIONS_PREFETCH).get(pk=message.pk)
        data = StaffChatMessageSerializer(message, context={'request': request}).data
        broadcast_staff_chat_payload(
            {'type': 'staff_chat.message_updated', 'conversation_id': conversation.pk, 'message': data},
            [conversation.user_a_id, conversation.user_b_id],
        )
        return Response(data)

    def delete(self, request, pk, msg_pk):
        conversation = get_object_or_404(StaffChatConversation, pk=pk)
        if not _user_in_staff_conversation(conversation, request.user):
            return Response(status=status.HTTP_403_FORBIDDEN)
        message = get_object_or_404(StaffChatMessage, pk=msg_pk, conversation=conversation)

        if message.sender_id == request.user.id:
            scope = (request.query_params.get('scope') or 'everyone').lower()
            if scope in ('self', 'me', 'for_me'):
                if not messages_visible_to_user_qs(conversation, request.user).filter(pk=msg_pk).exists():
                    return Response({'detail': 'Message not found.'}, status=status.HTTP_404_NOT_FOUND)
                row, created = StaffChatMessageHidden.objects.get_or_create(
                    message=message,
                    user=request.user,
                    defaults={'list_in_hidden_ui': False},
                )
                if not created:
                    row.list_in_hidden_ui = False
                    row.save(update_fields=['list_in_hidden_ui', 'updated_at'])
                sync_staff_chat_read_state(conversation, request.user)
                broadcast_staff_chat_payload(
                    {
                        'type': 'staff_chat.message_hidden',
                        'conversation_id': conversation.pk,
                        'message_id': message.pk,
                        'scope': 'self',
                        'list_in_hidden_ui': False,
                    },
                    [request.user.id],
                )
                return Response(status=status.HTTP_204_NO_CONTENT)

            preview = staff_chat_delete_list_preview(actor_username=message.sender.username, message=message)
            now = timezone.now()
            mid = message.pk
            set_thread_list_preview_for_participants(
                conversation=conversation,
                body=preview,
                at=now,
                sender_id=message.sender_id,
                source_message=message,
            )
            conversation.save()
            if message.attachment:
                message.attachment.delete(save=False)
            message.delete()
            broadcast_staff_chat_payload(
                {
                    'type': 'staff_chat.message_deleted',
                    'conversation_id': conversation.pk,
                    'message_id': mid,
                },
                [conversation.user_a_id, conversation.user_b_id],
            )
            return Response(status=status.HTTP_204_NO_CONTENT)

        if not messages_visible_to_user_qs(conversation, request.user).filter(pk=msg_pk).exists():
            return Response({'detail': 'Message not found.'}, status=status.HTTP_404_NOT_FOUND)

        StaffChatMessageHidden.objects.get_or_create(
            message=message,
            user=request.user,
            defaults={'list_in_hidden_ui': True},
        )
        sync_staff_chat_read_state(conversation, request.user)
        broadcast_staff_chat_payload(
            {
                'type': 'staff_chat.message_hidden',
                'conversation_id': conversation.pk,
                'message_id': message.pk,
                'scope': 'self',
                'list_in_hidden_ui': True,
            },
            [request.user.id],
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


class StaffChatHiddenMessagesView(APIView):
    permission_classes = [IsRegistrarOrStaff]

    def get(self, request, pk):
        conversation = get_object_or_404(StaffChatConversation, pk=pk)
        if not _user_in_staff_conversation(conversation, request.user):
            return Response(status=status.HTTP_403_FORBIDDEN)
        try:
            limit = int(request.query_params.get('limit', 80))
        except (TypeError, ValueError):
            limit = 80
        limit = max(1, min(limit, 200))
        qs = (
            StaffChatMessage.objects.filter(
                conversation=conversation,
                hidden_for__user=request.user,
                hidden_for__list_in_hidden_ui=True,
            )
            .distinct()
            .prefetch_related(_STAFF_CHAT_MSG_REACTIONS_PREFETCH)
            .order_by('-created_at', '-id')[:limit]
        )
        messages = list(reversed(list(qs)))
        return Response(StaffChatMessageSerializer(messages, many=True, context={'request': request}).data)


class StaffChatMessageReactionView(APIView):
    permission_classes = [IsRegistrarOrStaff]

    def post(self, request, pk, msg_pk):
        conversation = get_object_or_404(StaffChatConversation, pk=pk)
        if not _user_in_staff_conversation(conversation, request.user):
            return Response(status=status.HTTP_403_FORBIDDEN)
        if not messages_visible_to_user_qs(conversation, request.user).filter(pk=msg_pk).exists():
            return Response({'detail': 'Message not found.'}, status=status.HTTP_404_NOT_FOUND)

        emoji = (request.data.get('emoji') or '').strip()
        if emoji not in STAFF_CHAT_ALLOWED_REACTION_EMOJIS:
            return Response({'detail': 'Invalid reaction.'}, status=status.HTTP_400_BAD_REQUEST)

        message = get_object_or_404(StaffChatMessage, pk=msg_pk, conversation=conversation)
        existing = StaffChatMessageReaction.objects.filter(message=message, user=request.user).first()
        reaction_removed = False
        if existing and existing.emoji == emoji:
            existing.delete()
            reaction_removed = True
        else:
            StaffChatMessageReaction.objects.update_or_create(
                message=message,
                user=request.user,
                defaults={'emoji': emoji},
            )
            preview_at = timezone.now()
            for uid in (conversation.user_a_id, conversation.user_b_id):
                set_thread_list_preview_for_user(
                    conversation=conversation,
                    user_id=uid,
                    body=staff_chat_reaction_list_preview(
                        viewer_id=uid,
                        actor_id=request.user.pk,
                        actor_username=request.user.username,
                        message=message,
                        emoji=emoji,
                    ),
                    at=preview_at,
                    sender_id=request.user.pk,
                    source_message=message,
                )
        message = StaffChatMessage.objects.prefetch_related(_STAFF_CHAT_MSG_REACTIONS_PREFETCH).get(pk=message.pk)
        data = StaffChatMessageSerializer(message, context={'request': request}).data
        broadcast_staff_chat_payload(
            {'type': 'staff_chat.message_updated', 'conversation_id': conversation.pk, 'message': data},
            [conversation.user_a_id, conversation.user_b_id],
        )
        if not reaction_removed:
            broadcast_staff_chat_payload(
                {
                    'type': 'staff_chat.reaction',
                    'conversation_id': conversation.pk,
                    'message_id': message.pk,
                    'actor_id': request.user.pk,
                    'actor_username': request.user.username,
                    'target_sender_id': message.sender_id,
                    'emoji': emoji,
                },
                [conversation.user_a_id, conversation.user_b_id],
            )
        return Response(data)

    def delete(self, request, pk, msg_pk):
        conversation = get_object_or_404(StaffChatConversation, pk=pk)
        if not _user_in_staff_conversation(conversation, request.user):
            return Response(status=status.HTTP_403_FORBIDDEN)
        if not messages_visible_to_user_qs(conversation, request.user).filter(pk=msg_pk).exists():
            return Response({'detail': 'Message not found.'}, status=status.HTTP_404_NOT_FOUND)

        message = get_object_or_404(StaffChatMessage, pk=msg_pk, conversation=conversation)
        StaffChatMessageReaction.objects.filter(message=message, user=request.user).delete()
        for uid in (conversation.user_a_id, conversation.user_b_id):
            rs = StaffChatReadState.objects.filter(conversation=conversation, user_id=uid).first()
            if rs and rs.thread_list_preview_message_id == message.id:
                rs.thread_list_preview_body = ''
                rs.thread_list_preview_at = None
                rs.thread_list_preview_sender_id = None
                rs.thread_list_preview_message = None
                rs.save(
                    update_fields=[
                        'thread_list_preview_body',
                        'thread_list_preview_at',
                        'thread_list_preview_sender_id',
                        'thread_list_preview_message',
                        'updated_at',
                    ],
                )
        message = StaffChatMessage.objects.prefetch_related(_STAFF_CHAT_MSG_REACTIONS_PREFETCH).get(pk=message.pk)
        data = StaffChatMessageSerializer(message, context={'request': request}).data
        broadcast_staff_chat_payload(
            {'type': 'staff_chat.message_updated', 'conversation_id': conversation.pk, 'message': data},
            [conversation.user_a_id, conversation.user_b_id],
        )
        return Response(data)


class StaffChatMessageUnhideView(APIView):
    permission_classes = [IsRegistrarOrStaff]

    def post(self, request, pk, msg_pk):
        conversation = get_object_or_404(StaffChatConversation, pk=pk)
        if not _user_in_staff_conversation(conversation, request.user):
            return Response(status=status.HTTP_403_FORBIDDEN)
        message = get_object_or_404(StaffChatMessage, pk=msg_pk, conversation=conversation)
        row = StaffChatMessageHidden.objects.filter(message=message, user=request.user).first()
        if not row:
            return Response({'detail': 'Message is not hidden for you.'}, status=status.HTTP_400_BAD_REQUEST)
        if not row.list_in_hidden_ui:
            return Response(
                {'detail': 'That message was removed from your view and cannot be restored here.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        row.delete()
        rs = StaffChatReadState.objects.filter(conversation=conversation, user=request.user).first()
        if rs and rs.thread_list_preview_message_id == message.id:
            rs.thread_list_preview_body = ''
            rs.thread_list_preview_at = None
            rs.thread_list_preview_sender_id = None
            rs.thread_list_preview_message = None
            rs.save()
        sync_staff_chat_read_state(conversation, request.user)
        message = StaffChatMessage.objects.prefetch_related(_STAFF_CHAT_MSG_REACTIONS_PREFETCH).get(pk=message.pk)
        data = StaffChatMessageSerializer(message, context={'request': request}).data
        broadcast_staff_chat_payload(
            {'type': 'staff_chat.message_unhidden', 'conversation_id': conversation.pk, 'message': data},
            [request.user.id],
        )
        return Response(data)


class StaffChatMarkReadView(APIView):
    permission_classes = [IsRegistrarOrStaff]

    def post(self, request, pk):
        conversation = get_object_or_404(StaffChatConversation, pk=pk)
        if not _user_in_staff_conversation(conversation, request.user):
            return Response(status=status.HTTP_403_FORBIDDEN)
        sync_staff_chat_read_state(conversation, request.user)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        return Response(MeSerializer(profile, context={'request': request}).data, status=status.HTTP_200_OK)

    def patch(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        serializer = MeUpdateSerializer(profile, data=request.data, partial=True, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(MeSerializer(profile, context={'request': request}).data, status=status.HTTP_200_OK)


class MeStaffActivityTouchView(APIView):
    """
    Record real UI activity for staff presence (online / away / offline).
    Not called by session polling — only explicit user interaction (see frontend AppShell).
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.is_staff or request.user.is_superuser:
            from .staff_presence import touch_staff_activity

            touch_staff_activity(request.user, min_interval_seconds=20)
        return Response(status=status.HTTP_204_NO_CONTENT)


class StaffChatOfflineSelfView(APIView):
    """
    Mark this staff user's chat presence offline (clear last activity / broadcast).
    Used for sidebar Logout and best-effort browser/tab close (keepalive POST).
    """

    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not (request.user.is_staff or request.user.is_superuser):
            return Response(status=status.HTTP_204_NO_CONTENT)
        from .staff_presence import mark_staff_presence_offline

        mark_staff_presence_offline(request.user.pk, reset_ws_counter=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeProfilePhotoView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        upload = request.FILES.get('photo')
        if not upload:
            return Response({'detail': 'photo file is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not upload.content_type or not upload.content_type.startswith('image/'):
            return Response({'detail': 'photo must be an image.'}, status=status.HTTP_400_BAD_REQUEST)

        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.photo:
            profile.photo.delete(save=False)
        profile.photo = upload
        profile.save(update_fields=['photo', 'updated_at'])
        return Response(UserProfileSerializer(profile, context={'request': request}).data, status=status.HTTP_200_OK)

    def delete(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        if profile.photo:
            profile.photo.delete(save=False)
            profile.photo = None
            profile.save(update_fields=['photo', 'updated_at'])
        return Response(UserProfileSerializer(profile, context={'request': request}).data, status=status.HTTP_200_OK)


class LogoutAllView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        profile, _ = UserProfile.objects.get_or_create(user=request.user)
        profile.token_invalid_before = timezone.now()
        profile.save(update_fields=['token_invalid_before', 'updated_at'])
        from .staff_presence import mark_staff_presence_offline

        mark_staff_presence_offline(request.user.pk, reset_ws_counter=True)
        return Response(status=status.HTTP_204_NO_CONTENT)


class RegistrarAccountCreateView(APIView):
    permission_classes = [IsRegistrarOrStaff]

    def post(self, request):
        serializer = RegistrarAccountCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        AuditLog.objects.create(
            actor=request.user,
            action='create',
            entity='User',
            entity_id=str(user.pk),
            payload={
                'username': user.username,
                'email': user.email,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'is_staff': user.is_staff,
                'is_superuser': user.is_superuser,
                'is_active': user.is_active,
            },
        )

        return Response(
            {
                'id': user.pk,
                'username': user.username,
                'email': user.email,
                'first_name': user.first_name,
                'last_name': user.last_name,
                'is_staff': user.is_staff,
                'is_superuser': user.is_superuser,
                'is_active': user.is_active,
            },
            status=status.HTTP_201_CREATED,
        )


class BaseRegistrarViewSet(ModelViewSet):
    permission_classes = [IsRegistrarOrStaff]

    def _write_audit_log(self, action_name, instance, payload):
        if not getattr(self.request, 'user', None) or not self.request.user.is_authenticated:
            return
        AuditLog.objects.create(
            actor=self.request.user,
            action=action_name,
            entity=instance.__class__.__name__,
            entity_id=str(instance.pk),
            payload=payload or {},
        )

    def perform_create(self, serializer):
        instance = serializer.save()
        self._write_audit_log('create', instance, self.request.data)

    def perform_update(self, serializer):
        instance = serializer.save()
        self._write_audit_log('update', instance, self.request.data)

    def perform_destroy(self, instance):
        instance.delete()
        self._write_audit_log('delete', instance, {})


class DepartmentViewSet(BaseRegistrarViewSet):
    queryset = Department.objects.all().order_by('name')
    serializer_class = DepartmentSerializer


class ProgramViewSet(BaseRegistrarViewSet):
    queryset = Program.objects.select_related('department').all().order_by('name', 'id')
    serializer_class = ProgramSerializer


class AcademicTermViewSet(BaseRegistrarViewSet):
    queryset = AcademicTerm.objects.all().order_by('-year_label', 'semester')
    serializer_class = AcademicTermSerializer


class ProgramOfferingViewSet(BaseRegistrarViewSet):
    queryset = ProgramOffering.objects.select_related('program__department').all().order_by(
        'program__name', 'year_level', 'semester'
    )
    serializer_class = ProgramOfferingSerializer


class SectionViewSet(BaseRegistrarViewSet):
    queryset = Section.objects.select_related('program_offering__program').all().order_by(
        'program_offering__program__name', 'program_offering__year_level', 'program_offering__semester', 'name', 'id'
    )
    serializer_class = SectionSerializer


class SubjectViewSet(BaseRegistrarViewSet):
    queryset = Subject.objects.all().order_by('code')
    serializer_class = SubjectSerializer


class ProspectusViewSet(BaseRegistrarViewSet):
    queryset = ProspectusEntry.objects.select_related('program', 'subject', 'prerequisite').all()
    serializer_class = ProspectusEntrySerializer

    @action(detail=False, methods=['post'], url_path='copy-section')
    def copy_section(self, request):
        required_fields = ['program', 'year_level', 'semester', 'academic_year', 'source_section', 'target_section']
        missing = [field for field in required_fields if request.data.get(field) in [None, '']]
        if missing:
            return Response(
                {'detail': f"Missing required fields: {', '.join(missing)}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            program_id = int(request.data['program'])
            year_level = int(request.data['year_level'])
            semester = int(request.data['semester'])
            source_section_id = int(request.data['source_section'])
            target_section_id = int(request.data['target_section'])
        except (TypeError, ValueError):
            return Response({'detail': 'Invalid numeric value in request payload.'}, status=status.HTTP_400_BAD_REQUEST)

        source_academic_year = str(request.data['academic_year']).strip()
        if not source_academic_year:
            return Response({'detail': 'academic_year cannot be empty.'}, status=status.HTTP_400_BAD_REQUEST)

        raw_target_year = request.data.get('target_academic_year', None)
        if raw_target_year is None or (isinstance(raw_target_year, str) and not str(raw_target_year).strip()):
            target_academic_year = source_academic_year
        else:
            target_academic_year = str(raw_target_year).strip()

        if source_section_id == target_section_id and source_academic_year == target_academic_year:
            return Response(
                {'detail': 'Source and target sections must differ when copying within the same school year.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        source_entries = ProspectusEntry.objects.filter(
            program_id=program_id,
            year_level=year_level,
            semester=semester,
            academic_year=source_academic_year,
            section_id=source_section_id,
        ).values('subject_id', 'prerequisite_id', 'time', 'room')

        if not source_entries.exists():
            return Response({'detail': 'No source prospectus entries found for the provided filters.'}, status=status.HTTP_400_BAD_REQUEST)

        created = 0
        updated = 0
        with transaction.atomic():
            for entry in source_entries:
                _, was_created = ProspectusEntry.objects.update_or_create(
                    program_id=program_id,
                    subject_id=entry['subject_id'],
                    year_level=year_level,
                    semester=semester,
                    academic_year=target_academic_year,
                    section_id=target_section_id,
                    defaults={
                        'prerequisite_id': entry['prerequisite_id'],
                        'time': entry.get('time', '') or '',
                        'room': entry.get('room', '') or '',
                    },
                )
                if was_created:
                    created += 1
                else:
                    updated += 1

        if getattr(request, 'user', None) and request.user.is_authenticated:
            AuditLog.objects.create(
                actor=request.user,
                action='copy_section',
                entity='ProspectusEntry',
                entity_id='bulk-copy',
                payload={
                    'program': program_id,
                    'year_level': year_level,
                    'semester': semester,
                    'source_academic_year': source_academic_year,
                    'target_academic_year': target_academic_year,
                    'source_section': source_section_id,
                    'target_section': target_section_id,
                    'created': created,
                    'updated': updated,
                },
            )
        return Response(
            {'detail': 'Section prospectus copy completed.', 'created': created, 'updated': updated},
            status=status.HTTP_200_OK,
        )


class StudentViewSet(BaseRegistrarViewSet):
    queryset = Student.objects.select_related('program', 'section').prefetch_related('loads').filter(is_active=True)
    serializer_class = StudentSerializer
    lookup_field = 'student_id'

    def get_serializer_class(self):
        if self.action == 'retrieve':
            return StudentDetailSerializer
        return StudentSerializer

    def perform_create(self, serializer):
        instance = serializer.save()
        sync_student_current_academic_history(instance)
        self._write_audit_log('create', instance, self.request.data)

    def perform_update(self, serializer):
        instance = serializer.save()
        sync_student_current_academic_history(instance)
        self._write_audit_log('update', instance, self.request.data)

    def perform_destroy(self, instance):
        today = date.today()
        history_qs = AcademicHistory.objects.filter(student=instance)
        if instance.academic_year and instance.semester:
            history_qs = history_qs.filter(
                academic_year=instance.academic_year,
                semester=instance.semester,
            )
        else:
            history_qs = history_qs.filter(status='ongoing')

        updated_rows = history_qs.update(status='dropped', end_date=today)
        instance.is_active = False
        instance.save(update_fields=['is_active', 'updated_at'])
        self._write_audit_log(
            'soft_delete',
            instance,
            {'is_active': False, 'academic_history_marked_dropped': updated_rows},
        )

    @action(detail=True, methods=['get'], url_path='auto-load-preview')
    def auto_load_preview(self, request, student_id=None):
        term_id = request.query_params.get('term_id')
        if not term_id:
            return Response({'detail': 'term_id query parameter is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            term = AcademicTerm.objects.get(pk=term_id)
        except AcademicTerm.DoesNotExist:
            return Response({'detail': 'Specified term does not exist.'}, status=status.HTTP_400_BAD_REQUEST)

        student = self.get_object()
        subjects = get_eligible_subjects(student, term)
        return Response({'subjects': SubjectSerializer(subjects, many=True).data}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='auto-load')
    def auto_load(self, request, student_id=None):
        term_id = request.data.get('term_id')
        if not term_id:
            return Response({'detail': 'term_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

        student = self.get_object()
        result = auto_load_students([student.student_id], term_id)
        self._write_audit_log('auto_load', student, {'term_id': term_id, 'result': result})
        return Response(result, status=status.HTTP_200_OK)

    @action(detail=True, methods=['get'], url_path='tor-subjects')
    def tor_subjects(self, request, student_id=None):
        student = self.get_object()
        histories = (
            AcademicHistory.objects.filter(student=student)
            .select_related('program', 'section')
            .prefetch_related('subjects__subject')
            .order_by('academic_year', 'year_level', 'semester', 'id')
        )
        subjects_by_code = {
            subject.code: subject
            for subject in Subject.objects.all().only('code', 'title', 'units').order_by('-code')
        }

        results = []
        next_id = 1

        for history in histories:
            history_subjects = list(history.subjects.select_related('subject').all())
            parsed_rows = []
            if history_subjects:
                for academic_subject in history_subjects:
                    parsed_rows.append(
                        {
                            'subject_code': academic_subject.subject.code,
                            'descriptive_title': academic_subject.subject.title,
                            'credits': float(academic_subject.credits),
                            'schedule_parts': [],
                        }
                    )
            else:
                parsed_rows = _parse_tor_schedule_rows(history.subject_load_schedule, subjects_by_code)

            for row in parsed_rows:
                results.append(
                    {
                        'id': next_id,
                        'subject_code': row['subject_code'],
                        'descriptive_title': row['descriptive_title'],
                        'grade_final': '',
                        'completion': '',
                        'credits': row['credits'],
                        'semester': history.semester,
                        'year_level': history.year_level,
                        'academic_year': history.academic_year,
                        'schedule': ', '.join(row['schedule_parts']) if row['schedule_parts'] else '-',
                    }
                )
                next_id += 1

        return Response(results, status=status.HTTP_200_OK)


class StudentLoadViewSet(BaseRegistrarViewSet):
    queryset = StudentLoad.objects.select_related('student', 'term', 'subject').all()
    serializer_class = StudentLoadSerializer


class AcademicHistoryViewSet(BaseRegistrarViewSet):
    queryset = AcademicHistory.objects.select_related('student', 'program', 'section').all()
    serializer_class = AcademicHistorySerializer

    @action(detail=False, methods=['get'], url_path='duplicate-students-report')
    def duplicate_students_report(self, request):
        limit_value = request.query_params.get('limit')
        limit = None
        if limit_value:
            try:
                limit = max(int(limit_value), 1)
            except ValueError:
                return Response({'detail': 'limit must be a positive integer.'}, status=status.HTTP_400_BAD_REQUEST)

        students = get_students_with_multiple_academic_history(limit=limit)
        return Response(
            {
                'duplicate_student_count': len(students),
                'students': students,
            },
            status=status.HTTP_200_OK,
        )


class ContinuingViewSet(BaseRegistrarViewSet):
    queryset = Student.objects.none()
    serializer_class = StudentSerializer

    @action(detail=False, methods=['get', 'post'], url_path='folder-statuses')
    def folder_statuses(self, request):
        if request.method == 'GET':
            queryset = ContinuingFolderStatus.objects.select_related('program', 'section', 'updated_by').order_by(
                'program__name', '-academic_year', 'year_level', 'section__name', 'semester'
            )
            serializer = ContinuingFolderStatusSerializer(queryset, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)

        serializer = ContinuingFolderStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data
        status_value = validated['status']
        completed_at = timezone.now() if status_value == ContinuingFolderStatus.STATUS_DONE else None

        folder_status, created = ContinuingFolderStatus.objects.update_or_create(
            program=validated['program'],
            academic_year=validated['academic_year'],
            year_level=validated['year_level'],
            semester=validated.get('semester'),
            section=validated.get('section'),
            defaults={
                'status': status_value,
                'updated_by': request.user,
                'completed_at': completed_at,
            },
        )

        action_name = 'create' if created else 'update'
        self._write_audit_log(
            f'folder_status_{action_name}',
            folder_status,
            {
                'program': folder_status.program_id,
                'academic_year': folder_status.academic_year,
                'year_level': folder_status.year_level,
                'semester': folder_status.semester,
                'section': folder_status.section_id,
                'status': folder_status.status,
            },
        )
        return Response(ContinuingFolderStatusSerializer(folder_status).data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='promote')
    def promote(self, request):
        student_ids = request.data.get('student_ids', [])
        target_year_level = request.data.get('target_year_level')
        target_academic_year = request.data.get('target_academic_year')
        target_semester = request.data.get('target_semester')
        target_program = request.data.get('target_program')
        target_section = request.data.get('target_section', None)
        admission_date_raw = (request.data.get('admission_date') or '').strip()
        adviser_approval_date_raw = (request.data.get('adviser_approval_date') or '').strip()
        dean_approval_date_raw = (request.data.get('dean_approval_date') or '').strip()
        subject_load_schedule = (request.data.get('subject_load_schedule', '') or '').strip()
        adviser_name = request.data.get('adviser_name', '')
        dean_name = request.data.get('dean_name', '')
        term_id = request.data.get('term_id')

        if not student_ids:
            return Response({'detail': 'student_ids are required.'}, status=status.HTTP_400_BAD_REQUEST)

        required_fields = [target_year_level, target_academic_year, target_semester, target_program]
        if any(field in [None, ''] for field in required_fields):
            return Response(
                {'detail': 'target_year_level, target_academic_year, target_semester, and target_program are required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        target_academic_year = normalize_academic_year_label(str(target_academic_year))

        term = None
        if term_id:
            try:
                term = AcademicTerm.objects.get(pk=term_id)
            except AcademicTerm.DoesNotExist:
                return Response({'detail': 'Specified term does not exist.'}, status=status.HTTP_400_BAD_REQUEST)

            if not term.is_active:
                return Response({'detail': 'Promotion is only allowed for the active term.'}, status=status.HTTP_400_BAD_REQUEST)

        parsed_admission_date = None
        if admission_date_raw:
            try:
                parsed_admission_date = date.fromisoformat(admission_date_raw)
            except ValueError:
                return Response({'detail': 'Invalid admission_date format. Use YYYY-MM-DD.'}, status=status.HTTP_400_BAD_REQUEST)

        parsed_adviser_approval_date = None
        if adviser_approval_date_raw:
            try:
                parsed_adviser_approval_date = date.fromisoformat(adviser_approval_date_raw)
            except ValueError:
                return Response({'detail': 'Invalid adviser_approval_date format. Use YYYY-MM-DD.'}, status=status.HTTP_400_BAD_REQUEST)

        parsed_dean_approval_date = None
        if dean_approval_date_raw:
            try:
                parsed_dean_approval_date = date.fromisoformat(dean_approval_date_raw)
            except ValueError:
                return Response({'detail': 'Invalid dean_approval_date format. Use YYYY-MM-DD.'}, status=status.HTTP_400_BAD_REQUEST)

        students = Student.objects.select_related('program', 'section').filter(student_id__in=student_ids, is_active=True)
        if not students.exists():
            return Response({'detail': 'No active students found for the provided student_ids.'}, status=status.HTTP_400_BAD_REQUEST)

        today = date.today()
        processed_student_ids = []

        with transaction.atomic():
            for student in students.select_for_update():
                consolidate_student_academic_histories(student)
                current_semester = student.semester or 1
                current_academic_year = normalize_academic_year_label(student.academic_year or target_academic_year)
                resolved_subject_load_schedule = subject_load_schedule or student.subject_load_schedule
                resolved_adviser_name = adviser_name.strip() or student.adviser_name
                resolved_dean_name = dean_name.strip() or student.dean_name
                resolved_adviser_approval_date = parsed_adviser_approval_date or student.adviser_approval_date
                resolved_dean_approval_date = parsed_dean_approval_date or student.dean_approval_date

                AcademicHistory.objects.update_or_create(
                    student=student,
                    academic_year=current_academic_year,
                    semester=current_semester,
                    defaults={
                        'academic_year': current_academic_year,
                        'year_level': student.year_level,
                        'program': student.program,
                        'section': student.section,
                        'first_name': student.first_name,
                        'last_name': student.last_name,
                        'middle_name': student.middle_name,
                        'extension_name': student.extension_name,
                        'gender': student.gender,
                        'sex': student.sex,
                        'date_of_birth': student.date_of_birth,
                        'age': student.age,
                        'civil_status': student.civil_status,
                        'nationality': student.nationality,
                        'admission_date': student.admission_date,
                        'scholarship': student.scholarship,
                        'course': student.course,
                        'home_address': student.home_address,
                        'postal_code': student.postal_code,
                        'email_address': student.email_address,
                        'contact_number': student.contact_number,
                        'mother_maiden_name': student.mother_maiden_name,
                        'mother_contact_number': student.mother_contact_number,
                        'father_name': student.father_name,
                        'father_contact_number': student.father_contact_number,
                        'elementary_school': student.elementary_school,
                        'junior_high_school': student.junior_high_school,
                        'senior_high_school': student.senior_high_school,
                        'senior_high_track': student.senior_high_track,
                        'senior_high_strand': student.senior_high_strand,
                        'senior_high_track_strand': student.senior_high_track_strand,
                        'subject_load_schedule': student.subject_load_schedule,
                        'adviser_name': student.adviser_name,
                        'adviser_approval_status': student.adviser_approval_status,
                        'adviser_approval_date': student.adviser_approval_date,
                        'dean_name': student.dean_name,
                        'dean_approval_status': student.dean_approval_status,
                        'dean_approval_date': student.dean_approval_date,
                        'status': 'completed',
                        'start_date': student.admission_date or today,
                        'end_date': today,
                    },
                )

                student.program_id = int(target_program)
                student.year_level = int(target_year_level)
                student.academic_year = normalize_academic_year_label(target_academic_year)
                student.semester = int(target_semester)
                if target_section not in [None, '']:
                    student.section_id = int(target_section)
                if parsed_admission_date and not student.admission_date:
                    student.admission_date = parsed_admission_date
                student.subject_load_schedule = resolved_subject_load_schedule
                student.adviser_name = resolved_adviser_name
                student.adviser_approval_status = 'pending'
                student.adviser_approval_date = resolved_adviser_approval_date
                student.dean_name = resolved_dean_name
                student.dean_approval_status = 'pending'
                student.dean_approval_date = resolved_dean_approval_date
                student.save()

                next_year_key = normalize_academic_year_label(student.academic_year)
                AcademicHistory.objects.update_or_create(
                    student=student,
                    academic_year=next_year_key,
                    semester=student.semester,
                    defaults={
                        'academic_year': next_year_key,
                        'year_level': student.year_level,
                        'program': student.program,
                        'section': student.section,
                        'first_name': student.first_name,
                        'last_name': student.last_name,
                        'middle_name': student.middle_name,
                        'extension_name': student.extension_name,
                        'gender': student.gender,
                        'sex': student.sex,
                        'date_of_birth': student.date_of_birth,
                        'age': student.age,
                        'civil_status': student.civil_status,
                        'nationality': student.nationality,
                        'admission_date': student.admission_date,
                        'scholarship': student.scholarship,
                        'course': student.course,
                        'home_address': student.home_address,
                        'postal_code': student.postal_code,
                        'email_address': student.email_address,
                        'contact_number': student.contact_number,
                        'mother_maiden_name': student.mother_maiden_name,
                        'mother_contact_number': student.mother_contact_number,
                        'father_name': student.father_name,
                        'father_contact_number': student.father_contact_number,
                        'elementary_school': student.elementary_school,
                        'junior_high_school': student.junior_high_school,
                        'senior_high_school': student.senior_high_school,
                        'senior_high_track': student.senior_high_track,
                        'senior_high_strand': student.senior_high_strand,
                        'senior_high_track_strand': student.senior_high_track_strand,
                        'subject_load_schedule': resolved_subject_load_schedule,
                        'adviser_name': student.adviser_name,
                        'adviser_approval_status': student.adviser_approval_status,
                        'adviser_approval_date': student.adviser_approval_date,
                        'dean_name': student.dean_name,
                        'dean_approval_status': student.dean_approval_status,
                        'dean_approval_date': student.dean_approval_date,
                        'status': 'ongoing',
                        'start_date': today,
                        'end_date': None,
                    },
                )

                self._write_audit_log(
                    'promote',
                    student,
                    {
                        'target_year_level': target_year_level,
                        'target_academic_year': target_academic_year,
                        'target_semester': target_semester,
                        'target_program': target_program,
                        'target_section': target_section,
                        'term_id': term_id,
                    },
                )
                processed_student_ids.append(student.student_id)

        job_result = None
        mode = 'skipped'
        if term:
            try:
                auto_load_students_task.delay(processed_student_ids, term.id)
                mode = 'queued'
            except Exception:
                job_result = auto_load_students(processed_student_ids, term.id)
                mode = 'sync_fallback'

        return Response(
            {
                'detail': f'Processed {len(processed_student_ids)} students with academic history tracking.',
                'auto_load_mode': mode,
                'auto_load_result': job_result,
                'processed_student_ids': processed_student_ids,
            },
            status=status.HTTP_200_OK,
        )


class AuditLogPagination(PageNumberPagination):
    """Dashboard and clients can page through the full audit history."""

    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100


class AuditLogViewSet(ReadOnlyModelViewSet):
    permission_classes = [IsRegistrarOrStaff]
    queryset = AuditLog.objects.select_related('actor').all().order_by('-created_at')
    serializer_class = AuditLogSerializer
    pagination_class = AuditLogPagination
