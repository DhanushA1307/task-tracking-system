import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { tasksApi, projectsApi, teamApi } from '../api/client';
import { 
  X, Calendar, Flag, CheckCircle, AlertCircle, Building, 
  FolderPlus, Plus, Check, Users, Clock, Sparkles, ChevronDown 
} from 'lucide-react';

export const TaskModal = ({ isOpen, onClose, onTaskCreated }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('Medium');
  const [status, setStatus] = useState('In Progress');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]); // From Date (Required)
  const [dueDate, setDueDate] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('8.0');

  // 1st: Project State
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [projectsLoading, setProjectsLoading] = useState(false);

  // 2nd: Inline New Project Creation State
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDept, setNewProjectDept] = useState('Edutech');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [projectCreating, setProjectCreating] = useState(false);
  const [projectSuccessMsg, setProjectSuccessMsg] = useState('');

  const { user } = useAuth();
  const userRoleNorm = (user?.role || '').toLowerCase().replace(' ', '_');
  const isHR = userRoleNorm === 'hr' || userRoleNorm === 'human_resource_manager' || (user?.email || '').toLowerCase() === 'hr@ingage.com';

  // 3rd: Successor Designation Persons State with Tick Selection
  const [assigneesData, setAssigneesData] = useState({
    successors: [],
    peers_and_self: [],
    all_assignable: [],
    user_role: ''
  });
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [assigneesLoading, setAssigneesLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Fetch Projects and Successor Assignees when modal opens
  useEffect(() => {
    if (isOpen) {
      loadProjects();
      loadAssignees();
    }
  }, [isOpen]);

  const loadProjects = async () => {
    try {
      setProjectsLoading(true);
      const res = await projectsApi.getAll();
      setProjects(res.data || []);
      if (res.data && res.data.length > 0 && !selectedProjectId) {
        setSelectedProjectId(res.data[0].id);
      }
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setProjectsLoading(false);
    }
  };

  const loadAssignees = async () => {
    try {
      setAssigneesLoading(true);
      const res = await teamApi.getAssignees();
      let rawData = res.data || { successors: [], peers_and_self: [], all_assignable: [] };

      // Rule: Existing interns should never be in the assign flow of HR
      if (isHR) {
        rawData = {
          ...rawData,
          successors: (rawData.successors || []).filter(p => (p.role || '').toLowerCase() !== 'intern'),
          peers_and_self: (rawData.peers_and_self || []).filter(p => (p.role || '').toLowerCase() !== 'intern'),
          all_assignable: (rawData.all_assignable || []).filter(p => (p.role || '').toLowerCase() !== 'intern'),
        };
      }
      // Sort assignees in ascending alphabetical order
      if (rawData.all_assignable) {
        rawData.all_assignable.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
      }
      if (rawData.successors) {
        rawData.successors.sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
      }

      setAssigneesData(rawData);
      
      // By default, if successors exist, pre-select the first successor, else self
      if (rawData?.successors?.length > 0) {
        setSelectedUserIds([rawData.successors[0].id]);
      } else if (rawData?.all_assignable?.length > 0) {
        setSelectedUserIds([rawData.all_assignable[0].id]);
      } else if (user?.id) {
        setSelectedUserIds([user.id]);
      }
    } catch (err) {
      console.error('Failed to load assignees:', err);
    } finally {
      setAssigneesLoading(false);
    }
  };

  // Toggle tick allocation for a person
  const handleToggleAssignee = (userId) => {
    const targetPerson = (assigneesData.all_assignable || []).find(p => p.id === userId);
    if (isHR && targetPerson && (targetPerson.role || '').toLowerCase() === 'intern') {
      setError('Existing interns cannot be allocated in HR assign flow. Interns report under Team Lead.');
      return;
    }
    setSelectedUserIds((prev) => {
      if (prev.includes(userId)) {
        return prev.filter((id) => id !== userId);
      } else {
        return [...prev, userId];
      }
    });
  };

  // 2nd requirement: Create a new project inline
  const handleCreateNewProject = async (e) => {
    e.preventDefault();
    if (!newProjectName.trim()) {
      setError('Please provide a name for the new project.');
      return;
    }
    setProjectCreating(true);
    setError('');
    try {
      const res = await projectsApi.create({
        name: newProjectName.trim(),
        department: newProjectDept,
        description: newProjectDesc.trim(),
      });
      const createdProj = res.data;
      setProjects((prev) => [...prev, createdProj]);
      setSelectedProjectId(createdProj.id);
      setIsCreatingProject(false);
      setNewProjectName('');
      setNewProjectDesc('');
      setProjectSuccessMsg(`Project "${createdProj.name}" created and allocated successfully!`);
      setTimeout(() => setProjectSuccessMsg(''), 3500);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create project');
    } finally {
      setProjectCreating(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!startDate) {
      setError('Please provide a From Date.');
      return;
    }

    if (selectedUserIds.length === 0) {
      setError('Please allocate this task to at least one successor designation person using the tick button.');
      return;
    }

    setLoading(true);
    try {
      await tasksApi.create({
        title,
        description,
        priority,
        status,
        project_id: selectedProjectId ? parseInt(selectedProjectId) : null,
        assigned_to_ids: selectedUserIds,
        start_date: startDate,
        due_date: dueDate || null,
        estimated_hours: parseFloat(estimatedHours) || 0,
        progress: status === 'Completed' ? 100 : 0,
      });

      if (onTaskCreated) onTaskCreated();
      onClose();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to create and assign task');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const getRoleBadge = (role) => {
    switch (role?.toLowerCase()) {
      case 'super_admin': return 'bg-purple-100 text-purple-800 border-purple-200';
      case 'admin': return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'team_lead': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'employee': return 'bg-sky-100 text-sky-800 border-sky-200';
      case 'intern':
      default: return 'bg-brand-100 text-brand-800 border-brand-200';
    }
  };

  const selectedProjectObj = projects.find((p) => p.id === parseInt(selectedProjectId));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50 shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 bg-brand-100 text-brand-700 rounded-xl">
              <Sparkles className="w-4 h-4 text-brand-600" />
            </div>
            <div>
              <h3 className="font-bold text-base text-slate-900">Create & Assign New Task</h3>
              <p className="text-xs text-slate-500">Allocate task under designated project and hierarchy successors</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto flex-1 text-xs">
          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {projectSuccessMsg && (
            <div className="p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex items-center space-x-2">
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{projectSuccessMsg}</span>
            </div>
          )}

          {/* ================= 1st & 2nd REQUIREMENT: PROJECT SELECTION & INLINE CREATION ================= */}
          <div className="p-4 bg-slate-50/80 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-1.5">
                <Building className="w-3.5 h-3.5 text-brand-600" />
                <span>1. Select Allocated Project *</span>
              </label>

              {/* 2nd requirement: Toggle Create New Project button */}
              <button
                type="button"
                onClick={() => setIsCreatingProject(!isCreatingProject)}
                className="text-[11px] font-bold text-brand-700 hover:text-brand-800 bg-brand-100/80 hover:bg-brand-200/80 px-2.5 py-1 rounded-lg transition-colors flex items-center space-x-1 cursor-pointer"
              >
                {isCreatingProject ? <X className="w-3 h-3" /> : <FolderPlus className="w-3 h-3" />}
                <span>{isCreatingProject ? 'Cancel Project' : '+ Create New Project'}</span>
              </button>
            </div>

            {/* Existing Project Selector */}
            {!isCreatingProject ? (
              <div>
                <div className="relative">
                  <select
                    value={selectedProjectId}
                    onChange={(e) => setSelectedProjectId(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500 appearance-none cursor-pointer"
                  >
                    {projects.map((proj) => (
                      <option key={proj.id} value={proj.id}>
                        {proj.name} — [{proj.department}] ({proj.status})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-3 pointer-events-none" />
                </div>
                {selectedProjectObj && (
                  <div className="mt-2 text-[11px] text-slate-500 flex items-center justify-between px-1">
                    <span className="truncate">
                      Department: <strong className="text-slate-700">{selectedProjectObj.department}</strong>
                    </span>
                    <span className="text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-mono">
                      ID #{selectedProjectObj.id}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              /* Inline Create Project Sub-form */
              <div className="p-3.5 bg-white rounded-xl border-2 border-dashed border-brand-300 space-y-3 animate-in fade-in duration-150">
                <div className="flex items-center space-x-1.5 text-xs font-bold text-brand-800">
                  <FolderPlus className="w-4 h-4 text-brand-600" />
                  <span>2. Create & Allocate New Project</span>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 mb-1">Project Name *</label>
                  <input
                    type="text"
                    value={newProjectName}
                    onChange={(e) => setNewProjectName(e.target.value)}
                    placeholder="e.g. AI Assessment System, Mobile App Phase 2"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Department</label>
                    <select
                      value={newProjectDept}
                      onChange={(e) => setNewProjectDept(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      <option value="Edutech">Edutech</option>
                      <option value="Ingage">Ingage</option>
                      <option value="Rezov">Rezov</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">Description (Optional)</label>
                    <input
                      type="text"
                      value={newProjectDesc}
                      onChange={(e) => setNewProjectDesc(e.target.value)}
                      placeholder="Brief project summary..."
                      className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    disabled={projectCreating}
                    onClick={handleCreateNewProject}
                    className="px-3.5 py-1.5 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-lg transition-all shadow-xs flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{projectCreating ? 'Creating Project...' : 'Save & Select Project'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Task Basic Details */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Task Title *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Implement Responsive Sidecar Component"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                Description / Actionable Steps
              </label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Specify requirements, deliverables, or checklist..."
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white resize-none"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500"
                >
                  <option value="Backlog">Backlog</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Under Review">Under Review</option>
                  <option value="Completed">Completed</option>
                  <option value="Overdue">Overdue</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-brand-700 mb-1">
                  From Date *
                </label>
                <input
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-2.5 py-2 bg-slate-50 border border-brand-300 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Due Date
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1">
                  Est. Hours
                </label>
                <input
                  type="number"
                  step="0.5"
                  value={estimatedHours}
                  onChange={(e) => setEstimatedHours(e.target.value)}
                  placeholder="8.0"
                  className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
            </div>
          </div>

          {/* ================= 3rd REQUIREMENT: SUCCESSOR DESIGNATION PERSONS WITH TICK BUTTON ================= */}
          <div className="pt-2 border-t border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center space-x-1.5">
                  <Users className="w-3.5 h-3.5 text-brand-600" />
                  <span>3. Allocate to Successor Designation Persons *</span>
                </label>
                <p className="text-[11px] text-slate-500">
                  Select whose person(s) should be allocated using the <strong>Tick Button (✓)</strong>.
                </p>
              </div>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-brand-100 text-brand-800">
                {selectedUserIds.length} Person(s) Allocated
              </span>
            </div>

            {isHR && (
              <div className="p-2.5 bg-purple-50 rounded-xl border border-purple-200 text-[11px] text-purple-900 flex items-start space-x-2">
                <Users className="w-3.5 h-3.5 text-purple-600 shrink-0 mt-0.5" />
                <span>
                  <strong>HR Task Assignment:</strong> Existing interns report under Team Lead and are excluded from the HR task allocation flow.
                </span>
              </div>
            )}

            {/* List of Successor Persons */}
            <div className="space-y-2.5 max-h-56 overflow-y-auto pr-1">
              {assigneesLoading ? (
                <div className="py-6 text-center text-xs text-slate-400">Loading assignable successors...</div>
              ) : assigneesData.all_assignable?.length === 0 ? (
                <div className="py-6 text-center text-xs text-slate-400">No team members available</div>
              ) : (
                assigneesData.all_assignable?.map((person) => {
                  const isTicked = selectedUserIds.includes(person.id);
                  const badge = getRoleBadge(person.role);
                  const isSuccessor = person.is_successor;

                  return (
                    <div
                      key={person.id}
                      onClick={() => handleToggleAssignee(person.id)}
                      className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between group ${
                        isTicked
                          ? 'bg-brand-50/70 border-brand-500 ring-2 ring-brand-500/20 shadow-xs'
                          : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                      }`}
                    >
                      {/* Left: Avatar & Info */}
                      <div className="flex items-center space-x-3 min-w-0 pr-2">
                        {person.photo ? (
                          <img
                            src={person.photo}
                            alt={person.full_name}
                            className="w-10 h-10 rounded-xl object-cover ring-1 ring-slate-200 shrink-0"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-xl bg-brand-100 text-brand-700 font-bold flex items-center justify-center text-xs shrink-0">
                            {person.full_name?.charAt(0) || 'U'}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center space-x-2">
                            <h4 className="text-xs font-bold text-slate-900 truncate">{person.full_name}</h4>
                            <span className={`text-[10px] font-semibold px-2 py-0.2 rounded-full border ${badge}`}>
                              {person.role?.replace('_', ' ').toUpperCase()}
                            </span>
                            {isSuccessor && (
                              <span className="text-[9px] font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.2 rounded-full">
                                Successor
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-brand-700 font-medium truncate">{person.designation_name}</p>
                          <p className="text-[10px] text-slate-400 font-mono">{person.designation_number} • {person.email}</p>
                        </div>
                      </div>

                      {/* Right: THE TICK BUTTON (Requested explicitly in prompt) */}
                      <div className="shrink-0 flex items-center space-x-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleAssignee(person.id);
                          }}
                          className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center space-x-1.5 shadow-2xs cursor-pointer ${
                            isTicked
                              ? 'bg-brand-600 text-white hover:bg-brand-700 ring-2 ring-brand-600/30'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-300'
                          }`}
                        >
                          <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                            isTicked ? 'bg-white text-brand-700' : 'border border-slate-400 bg-white'
                          }`}>
                            {isTicked && <Check className="w-3 h-3 stroke-3 text-brand-700" />}
                          </div>
                          <span>{isTicked ? 'Allocated' : 'Tick to Allocate'}</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Footer Submit */}
          <div className="pt-4 flex items-center justify-between border-t border-slate-200 shrink-0">
            <span className="text-xs text-slate-500 font-medium">
              Allocated to <strong className="text-slate-800">{selectedUserIds.length}</strong> successor(s) in{' '}
              <strong className="text-brand-700">{selectedProjectObj?.name || 'Selected Project'}</strong>
            </span>

            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-bold text-xs rounded-xl shadow-xs hover:shadow-md transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
              >
                <Check className="w-4 h-4 stroke-3" />
                <span>{loading ? 'Submitting...' : 'Submit & Assign Task'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TaskModal;
