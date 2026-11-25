import React, { useState, useMemo } from 'react';
import { 
  X, Users, FolderKanban, CheckCircle2, AlertCircle, 
  ChevronLeft, ChevronRight, BarChart2, ShieldAlert, Award
} from 'lucide-react';

export const ProjectAnalysisModal = ({ project, isOpen, onClose, userRole }) => {
  if (!isOpen || !project) return null;

  const roleNorm = (userRole || '').toLowerCase().replace(' ', '_');
  const isSuperAdmin = roleNorm === 'super_admin' || roleNorm === 'superadmin';

  // For Superadmin: show only 1st successor on team members (Admin)
  const displayedTeamMembers = useMemo(() => {
    const list = project.team_members || [];
    if (isSuperAdmin) {
      const admins = list.filter(m => (m.role || '').toLowerCase().replace(' ', '_') === 'admin');
      if (admins.length > 0) return [admins[0]];
      return list.slice(0, 1);
    }
    return list;
  }, [project.team_members, isSuperAdmin]);

  // Inner pagination for Employee Breakdown table
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 5;

  // Ensure employees are sorted in Ascending order (A -> Z)
  const sortedEmployees = useMemo(() => {
    const list = [...(project.employee_breakdown || [])];
    return list.sort((a, b) => 
      (a.employee_name || '').localeCompare(b.employee_name || '', undefined, { sensitivity: 'base' })
    );
  }, [project.employee_breakdown]);

  const totalPages = Math.max(1, Math.ceil(sortedEmployees.length / pageSize));
  const paginatedEmployees = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sortedEmployees.slice(start, start + pageSize);
  }, [sortedEmployees, currentPage, pageSize]);

  const isOverdue = project.has_overdue || (project.overdue_task_count > 0);

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="analysis-modal-title"
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/80">
          <div className="space-y-1">
            <div className="flex items-center space-x-2.5">
              <span className="px-2.5 py-0.5 text-xs font-mono font-bold rounded-md bg-brand-50 text-brand-700 border border-brand-200">
                {project.project_code || `PRJ-${project.id}`}
              </span>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                {project.department || 'Edutech'}
              </span>
              <span className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${
                project.status === 'Completed'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-blue-50 text-blue-700 border-blue-200'
              }`}>
                {project.status || 'In Progress'}
              </span>
              {isOverdue && (
                <span className="flex items-center space-x-1 text-xs px-2 py-0.5 rounded-full font-semibold bg-rose-50 text-rose-700 border border-rose-200 animate-pulse">
                  <ShieldAlert className="w-3 h-3 text-rose-600" />
                  <span>Has Overdue Tasks</span>
                </span>
              )}
            </div>

            {/* 1. Project Name */}
            <h2 id="analysis-modal-title" className="text-xl font-bold text-slate-900 flex items-center gap-2 pt-1">
              <FolderKanban className="w-5 h-5 text-brand-600" />
              <span>{project.name}</span>
            </h2>

            {project.description && (
              <p className="text-xs text-slate-500 max-w-2xl line-clamp-2">
                {project.description}
              </p>
            )}
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Close Analysis Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Total Tasks</span>
              <p className="text-xl font-bold text-slate-900 mt-1">{project.total_task_count || 0}</p>
            </div>
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Completed Tasks</span>
              <p className="text-xl font-bold text-emerald-600 mt-1">{project.completed_task_count || 0}</p>
            </div>
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100">
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">Overdue Tasks</span>
              <p className={`text-xl font-bold mt-1 ${isOverdue ? 'text-rose-600' : 'text-slate-400'}`}>
                {project.overdue_task_count || 0}
              </p>
            </div>
            <div className={`p-3.5 rounded-xl border ${
              isOverdue 
                ? 'bg-rose-50/70 border-rose-200' 
                : 'bg-emerald-50/70 border-emerald-200'
            }`}>
              <span className={`text-[11px] font-medium uppercase tracking-wider ${
                isOverdue ? 'text-rose-600 font-semibold' : 'text-emerald-700 font-semibold'
              }`}>
                Overall Completion
              </span>
              <p className={`text-xl font-black mt-1 ${
                isOverdue ? 'text-rose-600' : 'text-emerald-700'
              }`}>
                {project.completion_percentage}%
              </p>
            </div>
          </div>

          {/* 2. Team Members Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Users className="w-4 h-4 text-brand-600" />
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                  {isSuperAdmin
                    ? `1st Successor on Team Members: Admin (${displayedTeamMembers.length})`
                    : `Team Members (${displayedTeamMembers.length})`}
                </h3>
              </div>
              <span className="text-xs text-slate-400">
                {isSuperAdmin ? 'Direct 1st successor in hierarchy' : 'Assigned across tasks'}
              </span>
            </div>

            {(!displayedTeamMembers || displayedTeamMembers.length === 0) ? (
              <div className="p-4 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs text-slate-500 text-center">
                {isSuperAdmin ? 'No 1st successor (Admin) found for this project.' : 'No team members currently assigned to tasks in this project.'}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                {displayedTeamMembers.map((member) => (
                  <div 
                    key={member.id} 
                    className="flex items-center space-x-3 p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100/80 border border-slate-200/80 transition-colors"
                  >
                    {member.avatar ? (
                      <img 
                        src={member.avatar} 
                        alt={member.name} 
                        className="w-9 h-9 rounded-lg object-cover border border-slate-200 shadow-2xs shrink-0" 
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-brand-100 text-brand-700 font-bold text-xs flex items-center justify-center shrink-0 border border-brand-200">
                        {member.name ? member.name.charAt(0).toUpperCase() : 'U'}
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center space-x-1.5">
                        <p className="text-xs font-bold text-slate-800 truncate">{member.name}</p>
                        {isSuperAdmin && (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-blue-100 text-blue-800 border border-blue-200 shrink-0">
                            ★ 1st Successor
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 truncate">{member.designation || member.role || 'Admin'}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 3. Tabular Format with Pagination: Employee Breakdown */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <BarChart2 className="w-4 h-4 text-brand-600" />
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                  Employee Priority & Completion Breakdown
                </h3>
              </div>
              <span className="text-xs text-slate-500 font-medium">
                Sorted by Employee Name (Ascending)
              </span>
            </div>

            {/* Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-xl shadow-2xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-600 border-b border-slate-200">
                    <th scope="col" className="py-3 px-4">1. Employee Name (A → Z)</th>
                    <th scope="col" className="py-3 px-3 text-center">2. Low Priority</th>
                    <th scope="col" className="py-3 px-3 text-center">3. Medium Priority</th>
                    <th scope="col" className="py-3 px-3 text-center">4. High Priority</th>
                    <th scope="col" className="py-3 px-4 text-right">5. Completion Percentage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {paginatedEmployees.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        No employee assignment data available for this project.
                      </td>
                    </tr>
                  ) : (
                    paginatedEmployees.map((emp) => (
                      <tr key={emp.employee_id} className="hover:bg-slate-50/80 transition-colors">
                        {/* 1st Employee Name in Ascending Order */}
                        <td className="py-3 px-4">
                          <div className="flex items-center space-x-2.5">
                            {emp.avatar ? (
                              <img 
                                src={emp.avatar} 
                                alt={emp.employee_name} 
                                className="w-7 h-7 rounded-md object-cover border border-slate-200 shrink-0" 
                              />
                            ) : (
                              <div className="w-7 h-7 rounded-md bg-brand-100 text-brand-700 font-bold text-[11px] flex items-center justify-center shrink-0 border border-brand-200">
                                {emp.employee_name ? emp.employee_name.charAt(0).toUpperCase() : 'E'}
                              </div>
                            )}
                            <div className="min-w-0">
                              <span className="font-bold text-slate-900 block truncate">
                                {emp.employee_name}
                              </span>
                              <span className="text-[10px] text-slate-400 block truncate">
                                {emp.designation || emp.role}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* 2nd Low-level Priority Count */}
                        <td className="py-3 px-3 text-center">
                          <span className="inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                            {emp.low_priority_count}
                          </span>
                        </td>

                        {/* 3rd Medium-level Priority Count */}
                        <td className="py-3 px-3 text-center">
                          <span className="inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            {emp.medium_priority_count}
                          </span>
                        </td>

                        {/* 4th High-level Priority Count */}
                        <td className="py-3 px-3 text-center">
                          <span className="inline-flex items-center justify-center min-w-[28px] px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                            {emp.high_priority_count}
                          </span>
                        </td>

                        {/* 5th Completion Percentage [completed on priority / total priority count] */}
                        <td className="py-3 px-4 text-right">
                          <div className="flex flex-col items-end">
                            <div className="flex items-center space-x-1.5 font-bold">
                              <span className={`text-xs ${
                                emp.completion_percentage === 100 
                                  ? 'text-emerald-600' 
                                  : emp.completion_percentage > 0 
                                  ? 'text-brand-700' 
                                  : 'text-slate-500'
                              }`}>
                                {emp.completion_percentage}%
                              </span>
                              <span className="text-[11px] text-slate-400 font-normal">
                                ({emp.completed_count}/{emp.total_priority_count})
                              </span>
                            </div>
                            <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1 border border-slate-200/50">
                              <div 
                                className={`h-full rounded-full transition-all duration-300 ${
                                  emp.completion_percentage === 100 
                                    ? 'bg-emerald-500' 
                                    : 'bg-brand-600'
                                }`} 
                                style={{ width: `${Math.min(100, Math.max(0, emp.completion_percentage))}%` }}
                              />
                            </div>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Inner Pagination */}
            {sortedEmployees.length > pageSize && (
              <div className="flex items-center justify-between pt-2 px-1 text-xs">
                <span className="text-slate-500">
                  Showing {Math.min(sortedEmployees.length, (currentPage - 1) * pageSize + 1)} to {Math.min(sortedEmployees.length, currentPage * pageSize)} of {sortedEmployees.length} employees
                </span>

                <div className="flex items-center space-x-1.5">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    title="Previous Page"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>

                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                    <button
                      key={pageNum}
                      type="button"
                      onClick={() => setCurrentPage(pageNum)}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                        currentPage === pageNum
                          ? 'bg-brand-600 text-white'
                          : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {pageNum}
                    </button>
                  ))}

                  <button
                    type="button"
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    title="Next Page"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end px-6 py-4 bg-slate-50 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProjectAnalysisModal;

