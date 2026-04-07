from django.contrib import admin
from django.template.response import TemplateResponse
from django.urls import path, reverse

from .models import (
    AcademicHistory,
    AcademicTerm,
    AuditLog,
    Department,
    Program,
    ProspectusEntry,
    Section,
    Student,
    StudentLoad,
    Subject,
)
from .services import get_students_with_multiple_academic_history


@admin.register(AcademicHistory)
class AcademicHistoryAdmin(admin.ModelAdmin):
    list_display = ('id', 'student', 'academic_year', 'semester', 'year_level', 'status', 'program', 'section')
    list_filter = ('academic_year', 'semester', 'status', 'program')
    search_fields = ('student__student_id', 'student__first_name', 'student__last_name')
    ordering = ('student__student_id', '-academic_year', '-semester', '-id')

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path(
                'duplicate-history-report/',
                self.admin_site.admin_view(self.duplicate_history_report_view),
                name='registrar_academichistory_duplicate_report',
            ),
        ]
        return custom_urls + urls

    def duplicate_history_report_view(self, request):
        context = {
            **self.admin_site.each_context(request),
            'opts': self.model._meta,
            'title': 'Students with Multiple Academic History Rows',
            'duplicate_history_report_url': reverse('admin:registrar_academichistory_duplicate_report'),
            'report_rows': get_students_with_multiple_academic_history(),
        }
        return TemplateResponse(
            request,
            'admin/registrar/academichistory/duplicate_history_report.html',
            context,
        )


admin.site.register(Department)
admin.site.register(Program)
admin.site.register(AcademicTerm)
admin.site.register(Section)
admin.site.register(Subject)
admin.site.register(ProspectusEntry)
admin.site.register(Student)
admin.site.register(StudentLoad)
admin.site.register(AuditLog)
