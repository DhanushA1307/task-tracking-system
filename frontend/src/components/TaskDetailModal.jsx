import React, { useState } from 'react';
import { tasksApi } from '../api/client';
import { X, Calendar, Clock, User, CheckCircle2, AlertCircle, FileText, Send } from 'lucide-react';

export const TaskDetailModal = ({ task, isOpen, onClose, onTaskUpdated }) => {
  if (!isOpen || !task) return null;

  const [status, setStatus] = useState(task.status);
  const [progress, setProgress] = useState(task.progress || 0);
  const [submissionNotes, setSubmissionNotes] = useState(task.submission_notes || '');
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const handleUpdate = async () => {
    setLoading(true);
    setSuccessMsg('');
    try {
      await tasksApi.updateStatus(task.id, {
        status,
        progress: parseInt(progress),
        submission_notes: submissionNotes,
      });
      setSuccessMsg('Task updated successfully!');
      if (onTaskUpdated) onTaskUpdated();
      setTimeout(() => {
        onClose();
      }, 800);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getPriorityBadge = (p) => {
    switch (p?.toLowerCase()) {
      case 'critical': return 'bg-rose-100 text-rose-700 border-rose-200';
      case 'high': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'medium': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-mono font-semibold text-slate-400">#{task.id}</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${getPriorityBadge(task.priority)}`}>
              {task.priority} Priority
            </span>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <div>
            <h2 className="text-lg font-bold text-slate-900">{task.title}</h2>
            <p className="text-xs text-slate-500 mt-1">Project: {task.project_name || 'Edutech LMS'}</p>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 text-sm text-slate-700 leading-relaxed">
            {task.description || 'No detailed description provided for this task.'}
          </div>

          {/* Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-slate-400 block mb-1">From Date</span>
              <span className="font-semibold text-slate-800 flex items-center space-x-1">
                <Calendar className="w-3.5 h-3.5 text-brand-500" />
                <span>{task.start_date ? new Date(task.start_date).toLocaleDateString() : 'None'}</span>
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-slate-400 block mb-1">Due Date</span>
              <span className="font-semibold text-slate-800 flex items-center space-x-1">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <span>{task.due_date ? new Date(task.due_date).toLocaleDateString() : 'None'}</span>
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-slate-400 block mb-1">Estimated Hours</span>
              <span className="font-semibold text-slate-800 flex items-center space-x-1">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>{task.estimated_hours} hrs</span>
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-slate-400 block mb-1">Assigned By</span>
              <span className="font-semibold text-slate-800 flex items-center space-x-1 truncate">
                <User className="w-3.5 h-3.5 text-slate-500" />
                <span className="truncate">{task.assigned_by_name || 'Manager'}</span>
              </span>
            </div>
          </div>

          {/* Interactive Status & Progress Updaters */}
          <div className="space-y-4 pt-2 border-t border-slate-100">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-600">
              Update Work Status
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1 font-medium">Task Status</label>
                <select
                  value={status}
                  onChange={(e) => {
                    const newStatus = e.target.value;
                    setStatus(newStatus);
                    if (newStatus === 'Completed') setProgress(100);
                  }}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="Backlog">Backlog / To Do</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Under Review">Under Review</option>
                  <option value="Completed">Completed</option>
                  <option value="Overdue">Overdue</option>
                </select>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-xs text-slate-500 font-medium">Progress: {progress}%</label>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={progress}
                  onChange={(e) => setProgress(e.target.value)}
                  className="w-full accent-brand-600 cursor-pointer mt-2"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1 font-medium">
                Work Submission Notes / Comments
              </label>
              <textarea
                rows={2}
                value={submissionNotes}
                onChange={(e) => setSubmissionNotes(e.target.value)}
                placeholder="Notes for lead review, PR link, or status summary..."
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500 resize-none"
              />
            </div>
          </div>

          {/* Review Comments if any */}
          {task.review_comments && (
            <div className="p-3.5 bg-purple-50 rounded-xl border border-purple-200 text-xs">
              <span className="font-bold text-purple-900 block mb-0.5">Manager Review Feedback:</span>
              <p className="text-purple-800">{task.review_comments}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-600 hover:text-slate-800"
          >
            Close
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={handleUpdate}
            className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{loading ? 'Saving...' : 'Update Status'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default TaskDetailModal;

