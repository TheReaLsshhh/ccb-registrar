from django.urls import path
from rest_framework.routers import DefaultRouter

from .views import (
    AcademicHistoryViewSet,
    AcademicTermViewSet,
    AuditLogViewSet,
    ContinuingViewSet,
    DepartmentViewSet,
    LogoutAllView,
    MeProfilePhotoView,
    MeStaffActivityTouchView,
    MeView,
    StaffChatOfflineSelfView,
    ProgramOfferingViewSet,
    ProgramViewSet,
    ProspectusViewSet,
    RegistrarAccountCreateView,
    SectionViewSet,
    StaffChatConversationsView,
    StaffChatHiddenMessagesView,
    StaffChatMarkReadView,
    StaffChatMessageDetailView,
    StaffChatMessageReactionView,
    StaffChatMessageUnhideView,
    StaffChatMessagesView,
    StaffChatPeersView,
    StudentLoadViewSet,
    StudentViewSet,
    SubjectViewSet,
)

router = DefaultRouter()
router.register('departments', DepartmentViewSet, basename='departments')
router.register('programs', ProgramViewSet, basename='programs')
router.register('program-offerings', ProgramOfferingViewSet, basename='program-offerings')
router.register('terms', AcademicTermViewSet, basename='terms')
router.register('sections', SectionViewSet, basename='sections')
router.register('subjects', SubjectViewSet, basename='subjects')
router.register('prospectus', ProspectusViewSet, basename='prospectus')
router.register('students', StudentViewSet, basename='students')
router.register('student-loads', StudentLoadViewSet, basename='student-loads')
router.register('academic-history', AcademicHistoryViewSet, basename='academic-history')
router.register('continuing', ContinuingViewSet, basename='continuing')
router.register('audit-logs', AuditLogViewSet, basename='audit-logs')

urlpatterns = [
    path('me/', MeView.as_view(), name='me'),
    path('me/staff-activity/', MeStaffActivityTouchView.as_view(), name='me_staff_activity'),
    path('me/staff-chat-offline/', StaffChatOfflineSelfView.as_view(), name='me_staff_chat_offline'),
    path('me/profile-photo/', MeProfilePhotoView.as_view(), name='me_profile_photo'),
    path('auth/registrar-accounts/', RegistrarAccountCreateView.as_view(), name='registrar_account_create'),
    path('auth/logout-all/', LogoutAllView.as_view(), name='logout_all'),
    path('staff-chat/peers/', StaffChatPeersView.as_view(), name='staff_chat_peers'),
    path('staff-chat/conversations/', StaffChatConversationsView.as_view(), name='staff_chat_conversations'),
    path('staff-chat/conversations/<int:pk>/messages/', StaffChatMessagesView.as_view(), name='staff_chat_messages'),
    path(
        'staff-chat/conversations/<int:pk>/messages/hidden/',
        StaffChatHiddenMessagesView.as_view(),
        name='staff_chat_hidden_messages',
    ),
    path(
        'staff-chat/conversations/<int:pk>/messages/<int:msg_pk>/',
        StaffChatMessageDetailView.as_view(),
        name='staff_chat_message_detail',
    ),
    path(
        'staff-chat/conversations/<int:pk>/messages/<int:msg_pk>/reaction/',
        StaffChatMessageReactionView.as_view(),
        name='staff_chat_message_reaction',
    ),
    path(
        'staff-chat/conversations/<int:pk>/messages/<int:msg_pk>/unhide/',
        StaffChatMessageUnhideView.as_view(),
        name='staff_chat_message_unhide',
    ),
    path('staff-chat/conversations/<int:pk>/read/', StaffChatMarkReadView.as_view(), name='staff_chat_mark_read'),
]
urlpatterns += router.urls
