import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { tasksApi, projectsApi, teamApi } from '../api/client';
import TaskModal from '../components/TaskModal';
import TaskDetailModal from '../components/TaskDetailModal';
import ProjectAnalysisModal from '../components/ProjectAnalysisModal';
import { 
  Kanban, Table as TableIcon, Plus, Search, Filter, 
  ChevronLeft, ChevronRight, ChevronDown, Clock, AlertCircle, CheckCircle2, 
  Calendar, User, ArrowRight, RefreshCw, Eye, Building,
  ArrowUp, ArrowDown, ArrowUpDown, Check, X, RotateCcw,
  Sparkles, BarChart3, Users
} from 'lucide-react';

export const TasksPage = () => {
  const { user } = useAuth();
  
  // View mode: 'tabular', 'board', or 'project_analysis' (Default: 'tabular')
  const [viewMode, setViewMode] = useState('tabular');
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStatus, setSelectedStatus] = useState(() => {
    try {
      const savedFilter = sessionStorage.getItem('tasks_filter_status');
      if (savedFilter) {
        sessionStorage.removeItem('tasks_filter_status');
        return savedFilter;
      }
    } catch {
      // ignore
    }
    return 'All';
  });
  const [selectedPriority, setSelectedPriority] = useState('All');
  const [selectedProjectFilter, setSelectedProjectFilter] = useState('All');
  const [projectsList, setProjectsList] = useState([]);

  // Sorting state for Tabular Mode (mode 2) - Task ID Column defaults to Descending order
  const [sortBy, setSortBy] = useState('id'); // 'id', 'title', 'project', 'assignee', 'status', 'priority', 'due_date', 'assigned_by'
  const [sortOrder, setSortOrder] = useState('desc'); // 'desc' by default for Task ID column
  
  // Filter pop-up state outside the table
  const [activeOutsideFilter, setActiveOutsideFilter] = useState(null); // 'status', 'priority', 'project', 'department', 'analysis_status', or null
  const outsideFilterRef = useRef(null);
  
  // Tabular Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [tabularData, setTabularData] = useState({
    items: [],
    total: 0,
    page: 1,
    page_size: 5,
    total_pages: 1,
  });

  // Board Data State
  const [boardData, setBoardData] = useState({ columns: [] });

  // Hierarchy Role Permissions:
  // Except Admin and Super Admin, rest of the users should present only their project and follows with successors users
  const userRole = (user?.role || '').toLowerCase();
  const userRoleNorm = userRole.replace(' ', '_');
  const userDesignation = (user?.designation || '').toLowerCase();
  const isHRRole = userRole === 'hr' || userRole === 'human_resource_manager' || userDesignation.includes('human resource') || (user?.email || '').toLowerCase() === 'hr@ingage.com';
  const isSuperAdminUser = userRoleNorm === 'super_admin' || userRoleNorm === 'superadmin';
  const isAdminUser = userRoleNorm === 'admin';
  const isTeamLeadUser = userRoleNorm === 'team_lead';
  const isAdminOrSuperAdmin = isAdminUser || isSuperAdminUser;
  const isIntern = userRole === 'intern' || userDesignation.includes('intern');

  // Tabular Task Scope:
  // For non-interns: 'allocated' (Tasks I Allocated, expanded per assignee, Assigned By column hidden)
  // or 'successors' (All Successor Tasks, distinct Task IDs, Assigned By column visible)
  // or 'received' (Tasks Assigned to Current User)
  // For Intern role or designation: Successor Tasks disappears, intern sees their assigned tasks with Assigned By column visible
  const [tabularTaskScope, setTabularTaskScope] = useState(isIntern ? 'received' : 'allocated');
  const showAssignedByColumn = isIntern || tabularTaskScope === 'successors' || tabularTaskScope === 'received';

  useEffect(() => {
    if (isIntern && tabularTaskScope === 'allocated') {
      setTabularTaskScope('received');
    }
  }, [isIntern]);

  // Successors list for hierarchy filtering
  const [successors, setSuccessors] = useState([]);
  const successorsCount = successors.length;

  useEffect(() => {
    if (isAdminOrSuperAdmin) {
      setSuccessors([]);
      return;
    }
    teamApi.getAssignees()
      .then(res => {
        let succ = res.data?.successors || [];
        if (isHRRole) {
          // Rule: HR's successors align ONLY with (super_admin -> hr) or (super_admin -> hr -> hr_intern) or (super_admin -> any_roles_relate_with_hr)
          // It does NOT align with all tasks or general engineering interns
          succ = succ.filter(s => {
            const role = (s.role || '').toLowerCase();
            const desig = (s.designation || s.designation_name || '').toLowerCase();
            const dept = (s.department || '').toLowerCase();
            return role === 'hr_intern' || role === 'human_resource_intern' || desig.includes('hr intern') || (dept.includes('hr') && role === 'intern');
          });
        }
        setSuccessors(succ);
      })
      .catch(err => console.error('Failed to load assignees/successors:', err));
  }, [user?.id, userRole, isAdminOrSuperAdmin, isHRRole]);

  // Allowed User IDs: self + successors (null for Admin/Super Admin; [user.id, ...hrSuccessors] for HR)
  const allowedUserIds = useMemo(() => {
    if (isAdminOrSuperAdmin) return null;
    const succIds = successors.map(s => s.id);
    return [user?.id, ...succIds].filter(Boolean);
  }, [isAdminOrSuperAdmin, user?.id, successors]);

  // All accessible user tasks list for accurate Assigned / Received / Total counts across all roles
  const [allUserTasks, setAllUserTasks] = useState([]);

  const fetchAllUserTasks = async () => {
    try {
      const res = await tasksApi.getTabular({ page: 1, page_size: 100 });
      let items = res.data?.items || [];
      if (!isAdminOrSuperAdmin && allowedUserIds) {
        items = items.filter(t => {
          if (isHRRole) {
            const hasIntern = t.assignees?.some(a => (a.role || '').toLowerCase() === 'intern');
            if (hasIntern) return false;
            return t.assignees?.some(a => a.id === user?.id) || t.assigned_by_id === user?.id;
          }
          return t.assignees?.some(a => allowedUserIds.includes(a.id)) || allowedUserIds.includes(t.assigned_by_id);
        });
      }
      setAllUserTasks(items);
    } catch (err) {
      console.error('Failed to load all user tasks for counts:', err);
    }
  };

  useEffect(() => {
    fetchAllUserTasks();
  }, [user?.id, userRole, isAdminOrSuperAdmin, allowedUserIds]);

  const taskCounts = useMemo(() => {
    let items = allUserTasks.length > 0 ? allUserTasks : (tabularData.items || []);
    if (items.length === 0 && boardData.columns?.length > 0) {
      items = boardData.columns.flatMap(c => c.tasks || []);
    }
    const myId = user?.id;
    const assigned = items.filter(t => t.assigned_by_id === myId).length;
    const received = items.filter(t => t.assignees?.some(a => a.id === myId)).length;
    const total = items.filter(t => t.assigned_by_id === myId || t.assignees?.some(a => a.id === myId)).length;
    return { assigned, received, total };
  }, [allUserTasks, tabularData.items, boardData.columns, user?.id]);

  // Project Analysis State (Mode 3)
  const [analysisData, setAnalysisData] = useState([]);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [selectedAnalysisProject, setSelectedAnalysisProject] = useState(null);
  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
  const [analysisCurrentPage, setAnalysisCurrentPage] = useState(1);
  const [analysisPageSize, setAnalysisPageSize] = useState(5);

  // Project Analysis Filter & Sorting State
  const [analysisSortBy, setAnalysisSortBy] = useState('id'); // 'id', 'name', 'department', 'total_task_count', 'completion_percentage'
  const [analysisSortOrder, setAnalysisSortOrder] = useState('asc'); // 'asc' or 'desc'
  const [analysisDepartmentFilter, setAnalysisDepartmentFilter] = useState('All');
  const [analysisStatusFilter, setAnalysisStatusFilter] = useState('All'); // 'All', 'overdue', 'on_schedule'
  const analysisOutsideFilterRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Task Members Modal State (Triggered when pressing the task title)
  const [selectedMembersTask, setSelectedMembersTask] = useState(null);
  const [isMembersModalOpen, setIsMembersModalOpen] = useState(false);

  // Hierarchy Data for Team Members & 1st Following Successor Popups:
  // Superadmin -> show only Admin [If I Press Admin, It should popup and showing 1st following successor]
  // Admin -> show only Team Lead [If I Press Team Lead, It should popup and showing 1st following successor]
  // Team Lead -> show only Intern [Exclude the Intern]
  const [hierarchyData, setHierarchyData] = useState(null);
  const [isSuccessorPopupOpen, setIsSuccessorPopupOpen] = useState(false);
  const [successorPopupData, setSuccessorPopupData] = useState(null);

  // Group Task Allocated Members Modal State
  const [groupPopupTask, setGroupPopupTask] = useState(null);
  const [groupPopupMembers, setGroupPopupMembers] = useState([]);
  const [isGroupPopupOpen, setIsGroupPopupOpen] = useState(false);

  const handleOpenGroupPopup = (task, members) => {
    const sorted = [...(members || [])].sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''));
    setGroupPopupTask(task);
    setGroupPopupMembers(sorted);
    setIsGroupPopupOpen(true);
  };

  useEffect(() => {
    teamApi.getHierarchy()
      .then(res => setHierarchyData(res.data))
      .catch(err => console.error('Failed to load team hierarchy in TasksPage:', err));
  }, [user?.id, userRole]);

  // Close Members Modal, Successor Popup & Group Popup on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (isGroupPopupOpen) {
          setIsGroupPopupOpen(false);
          setGroupPopupTask(null);
          setGroupPopupMembers([]);
        } else if (isSuccessorPopupOpen) {
          setIsSuccessorPopupOpen(false);
          setSuccessorPopupData(null);
        } else if (isMembersModalOpen) {
          setIsMembersModalOpen(false);
          setSelectedMembersTask(null);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isGroupPopupOpen, isSuccessorPopupOpen, isMembersModalOpen]);

  // Determine target single role for Team Members according to hierarchy rules:
  // Superadmin -> show only Admin
  // Admin -> show only Team Lead
  // Team Lead -> show only Intern [Exclude the Intern]
  const getTargetTeamMemberRole = () => {
    if (isSuperAdminUser) return 'admin';
    if (isAdminUser) return 'team_lead';
    if (isTeamLeadUser) return 'intern';
    if (isIntern) return 'intern';
    return 'admin';
  };

  const getRoleFilteredTaskMembers = (task) => {
    if (!task) return [];
    const targetRole = getTargetTeamMemberRole();

    // 1. Direct matches in task.assignees
    const directMatches = (task.assignees || []).filter(a => {
      const r = (a.role || '').toLowerCase().replace(' ', '_');
      const d = (a.designation || '').toLowerCase();
      if (targetRole === 'admin') return r === 'admin' || d.includes('admin');
      if (targetRole === 'team_lead') return r === 'team_lead' || d.includes('team lead') || d.includes('technical lead');
      if (targetRole === 'intern') return r === 'intern' || d.includes('intern');
      return r === targetRole;
    });

    if (directMatches.length > 0) {
      return directMatches;
    }

    // 2. Superadmin view -> Show only 1st successor (Admin)
    if (targetRole === 'admin') {
      if (directMatches.length > 0) {
        return [{
          ...directMatches[0],
          successor_level: '1st Successor'
        }];
      }

      const assignedByRole = (task.assigned_by_role || '').toLowerCase().replace(' ', '_');
      if (assignedByRole === 'admin') {
        return [{
          id: task.assigned_by_id || 4,
          full_name: task.assigned_by_name || 'Alex Morgan',
          role: 'admin',
          designation_name: task.assigned_by_designation || 'Engineering Director',
          designation: task.assigned_by_designation || 'Engineering Director',
          avatar: task.assigned_by_avatar,
          email: 'alex@ingage.com',
          department: 'Edutech',
          current_status: 'On Duty',
          is_available: true,
          successor_level: '1st Successor'
        }];
      }
      const allAdmins = [
        ...(hierarchyData?.successors || []),
        ...(hierarchyData?.peers || [])
      ].filter(m => (m.role || '').toLowerCase().replace(' ', '_') === 'admin');

      if (allAdmins.length > 0) {
        const found = allAdmins.find(a => a.id === task.assigned_by_id) || allAdmins[0];
        return [{
          ...found,
          successor_level: '1st Successor'
        }];
      }
      return [{
        id: 4,
        full_name: 'Alex Morgan',
        role: 'admin',
        designation_name: 'Engineering Director',
        designation: 'Engineering Director',
        email: 'alex@ingage.com',
        department: 'Edutech',
        current_status: 'On Duty',
        is_available: true,
        successor_level: '1st Successor'
      }];
    }

    // 3. Admin view -> Show only Team Lead (strictly scoped to this Admin's flow)
    if (targetRole === 'team_lead') {
      const allTLs = (hierarchyData?.successors || []).filter(m => 
        (m.role || '').toLowerCase().replace(' ', '_') === 'team_lead'
      );
      if (allTLs.length > 0) {
        const found = allTLs.find(tl => tl.id === task.assigned_by_id) || allTLs[0];
        return [found];
      }
      return [];
    }

    // 4. Team Lead view -> Show only Intern
    if (targetRole === 'intern') {
      const allInterns = (hierarchyData?.successors || []).filter(m => 
        (m.role || '').toLowerCase().replace(' ', '_') === 'intern'
      );
      if (allInterns.length > 0) {
        return allInterns.slice(0, 3);
      }
      return [];
    }

    return task.assignees || [];
  };

  const handleOpenSuccessorPopup = (member, task) => {
    if (!member) return;
    const memberRoleNorm = (member.role || '').toLowerCase().replace(' ', '_');

    // Superadmin: Pressed Admin -> popup 1st following successor (Team Lead)
    // Strictly scoped: only Team Leads who report directly to THIS Admin (reporting_manager_id === member.id)
    if (memberRoleNorm === 'admin') {
      const allMembers = [
        ...(hierarchyData?.successors || []),
        ...(hierarchyData?.peers || [])
      ];
      const teamLeadSuccessors = allMembers.filter(m => {
        const isTL = (m.role || '').toLowerCase().replace(' ', '_') === 'team_lead';
        return isTL && m.reporting_manager_id === member.id;
      });

      setSuccessorPopupData({
        parentMember: member,
        successorRoleTitle: '1st Following Successor: Team Lead',
        successorRoleBadge: 'Team Lead',
        successors: teamLeadSuccessors,
        task: task
      });
      setIsSuccessorPopupOpen(true);
      return;
    }

    // Admin: Pressed Team Lead -> popup 1st following successor (Intern)
    // Strictly scoped: only Interns who report directly to THIS Team Lead (reporting_manager_id === member.id)
    if (memberRoleNorm === 'team_lead') {
      const allMembers = [
        ...(hierarchyData?.successors || []),
        ...(hierarchyData?.peers || [])
      ];
      let interns = allMembers.filter(m => {
        const isIntern = (m.role || '').toLowerCase().replace(' ', '_') === 'intern';
        return isIntern && m.reporting_manager_id === member.id;
      });
      if (interns.length === 0 && task?.assignees) {
        interns = task.assignees.filter(a => {
          const isIntern = (a.role || '').toLowerCase().replace(' ', '_') === 'intern';
          return isIntern && a.reporting_manager_id === member.id;
        });
      }

      setSuccessorPopupData({
        parentMember: member,
        successorRoleTitle: '1st Following Successor: Intern',
        successorRoleBadge: 'Intern',
        successors: interns,
        task: task
      });
      setIsSuccessorPopupOpen(true);
      return;
    }

    // Team Lead -> show only Intern [Exclude the Intern: Leaf node, no further successor popup]
    if (memberRoleNorm === 'intern') {
      return;
    }
  };

  // Load projects list for filtering (filtered to user & successors if not Admin / Super Admin)
  useEffect(() => {
    projectsApi.getAll()
      .then(res => {
        const projs = res.data || [];
        setProjectsList(projs);
      })
      .catch(err => console.error(err));
  }, [user?.id, userRole]);

  // Reset selectedProjectFilter to 'All' if current filter is not in allowed projects list
  useEffect(() => {
    if (selectedProjectFilter !== 'All') {
      const exists = projectsList.some(p => String(p.id) === String(selectedProjectFilter));
      if (!exists) {
        setSelectedProjectFilter('All');
      }
    }
  }, [projectsList, selectedProjectFilter]);

  // Close filter popovers on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (outsideFilterRef.current && !outsideFilterRef.current.contains(e.target)) {
        setActiveOutsideFilter((curr) => ['status', 'priority', 'project'].includes(curr) ? null : curr);
      }
      if (analysisOutsideFilterRef.current && !analysisOutsideFilterRef.current.contains(e.target)) {
        setActiveOutsideFilter((curr) => ['department', 'analysis_status'].includes(curr) ? null : curr);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchTabularTasks = async () => {
    try {
      setLoading(true);
      const params = {
        page: 1,
        page_size: 100,
        search: searchTerm || undefined,
        status: selectedStatus !== 'All' ? selectedStatus : undefined,
        priority: selectedPriority !== 'All' ? selectedPriority : undefined,
        sort_by: sortBy,
        sort_order: sortOrder,
      };
      const res = await tasksApi.getTabular(params);
      let items = res.data.items || [];

      // Hierarchy constraint: Except Admin & Super Admin, present only their project and follows with successors users
      if (!isAdminOrSuperAdmin && allowedUserIds) {
        items = items.filter(t => {
          if (isHRRole) {
            // Rule: from credentials of hr@ingage.com, existing intern should not be in assign flow of hr
            const hasIntern = t.assignees?.some(a => (a.role || '').toLowerCase() === 'intern');
            if (hasIntern) return false;
            return t.assignees?.some(a => a.id === user?.id) || t.assigned_by_id === user?.id;
          }
          const hasSelfOrSuccessor = t.assignees?.some(a => allowedUserIds.includes(a.id)) ||
                                     allowedUserIds.includes(t.assigned_by_id);
          return hasSelfOrSuccessor;
        });
      }

      if (selectedProjectFilter !== 'All') {
        items = items.filter(t => t.project_id === parseInt(selectedProjectFilter));
      }
      setTabularData({
        ...res.data,
        items,
        total: items.length
      });
    } catch (err) {
      console.error('Failed to load tabular tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchBoardTasks = async () => {
    try {
      setLoading(true);
      const params = {
        search: searchTerm || undefined,
      };
      const res = await tasksApi.getBoard(params);
      let cols = res.data.columns || [];

      // Hierarchy constraint: Except Admin & Super Admin, present only their project and follows with successors users
      if (!isAdminOrSuperAdmin && allowedUserIds) {
        cols = cols.map(c => {
          const filteredTasks = c.tasks.filter(t => {
            if (isHRRole) {
              // Rule: from credentials of hr@ingage.com, existing intern should not be in assign flow of hr
              const hasIntern = t.assignees?.some(a => (a.role || '').toLowerCase() === 'intern');
              if (hasIntern) return false;
              return t.assignees?.some(a => a.id === user?.id) || t.assigned_by_id === user?.id;
            }
            const hasSelfOrSuccessor = t.assignees?.some(a => allowedUserIds.includes(a.id)) ||
                                       allowedUserIds.includes(t.assigned_by_id);
            return hasSelfOrSuccessor;
          });
          return {
            ...c,
            count: filteredTasks.length,
            tasks: filteredTasks
          };
        });
      }

      if (selectedProjectFilter !== 'All') {
        cols = cols.map(c => {
          const filteredTasks = c.tasks.filter(t => t.project_id === parseInt(selectedProjectFilter));
          return {
            ...c,
            count: filteredTasks.length,
            tasks: filteredTasks
          };
        });
      }
      if (selectedPriority !== 'All') {
        cols = cols.map(c => {
          const filteredTasks = c.tasks.filter(t => (t.priority || '').toLowerCase() === selectedPriority.toLowerCase());
          return {
            ...c,
            count: filteredTasks.length,
            tasks: filteredTasks
          };
        });
      }
      setBoardData({ columns: cols });
    } catch (err) {
      console.error('Failed to load board tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  // If intern has project_analysis viewMode, revert to tabular mode
  useEffect(() => {
    if (isIntern && viewMode === 'project_analysis') {
      setViewMode('tabular');
    }
  }, [isIntern, viewMode]);

  const fetchAnalysisData = async () => {
    if (isIntern) return;
    try {
      setAnalysisLoading(true);
      const res = await projectsApi.getAnalysis();
      let projects = res.data || [];

      // Hierarchy constraint: Except Admin & Super Admin, present only their project and follows with successors users
      if (!isAdminOrSuperAdmin && allowedUserIds) {
        projects = projects.filter(p => {
          const hasSelfOrSuccessor = p.team_members?.some(m => allowedUserIds.includes(m.id)) ||
                                     p.employee_breakdown?.some(e => allowedUserIds.includes(e.employee_id));
          return hasSelfOrSuccessor;
        });
      }

      setAnalysisData(projects);
    } catch (err) {
      console.error('Failed to load project analysis data:', err);
    } finally {
      setAnalysisLoading(false);
    }
  };

  useEffect(() => {
    if (viewMode === 'board') {
      fetchBoardTasks();
    } else if (viewMode === 'tabular') {
      fetchTabularTasks();
    } else if (viewMode === 'project_analysis' && !isIntern) {
      fetchAnalysisData();
    }
  }, [viewMode, selectedStatus, selectedPriority, selectedProjectFilter, sortBy, sortOrder, isIntern, isAdminOrSuperAdmin, allowedUserIds]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (viewMode === 'board') {
      fetchBoardTasks();
    } else if (viewMode === 'tabular') {
      setCurrentPage(1);
      fetchTabularTasks();
    } else if (viewMode === 'project_analysis') {
      setAnalysisCurrentPage(1);
    }
  };

  // Unique Departments list for Project Analysis Mode filtering
  const analysisDepartments = useMemo(() => {
    const deps = new Set();
    analysisData.forEach(p => {
      if (p.department) deps.add(p.department);
    });
    return Array.from(deps).sort();
  }, [analysisData]);

  // Filtered & Sorted items for Project Analysis Mode
  const processedAnalysisProjects = useMemo(() => {
    let list = [...analysisData];

    // Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(p => 
        (p.name && p.name.toLowerCase().includes(term)) ||
        (p.project_code && p.project_code.toLowerCase().includes(term)) ||
        (p.department && p.department.toLowerCase().includes(term)) ||
        String(p.id).includes(term)
      );
    }

    // Department filter
    if (analysisDepartmentFilter !== 'All') {
      list = list.filter(p => (p.department || 'General') === analysisDepartmentFilter);
    }

    // Completion / Overdue status filter
    if (analysisStatusFilter === 'overdue') {
      list = list.filter(p => p.has_overdue || (p.overdue_task_count > 0));
    } else if (analysisStatusFilter === 'on_schedule') {
      list = list.filter(p => !p.has_overdue && (!p.overdue_task_count || p.overdue_task_count === 0));
    }

    // Sorting
    list.sort((a, b) => {
      const multiplier = analysisSortOrder === 'asc' ? 1 : -1;
      switch (analysisSortBy) {
        case 'id':
          return ((a.id || 0) - (b.id || 0)) * multiplier;
        case 'name':
          return (a.name || '').localeCompare(b.name || '') * multiplier;
        case 'department':
          return (a.department || '').localeCompare(b.department || '') * multiplier;
        case 'total_task_count':
          return ((a.total_task_count || 0) - (b.total_task_count || 0)) * multiplier;
        case 'completion_percentage':
          return ((a.completion_percentage || 0) - (b.completion_percentage || 0)) * multiplier;
        default:
          return 0;
      }
    });

    return list;
  }, [analysisData, searchTerm, analysisDepartmentFilter, analysisStatusFilter, analysisSortBy, analysisSortOrder]);

  const analysisTotalPages = Math.max(1, Math.ceil(processedAnalysisProjects.length / analysisPageSize));
  const paginatedAnalysisProjects = useMemo(() => {
    const start = (analysisCurrentPage - 1) * analysisPageSize;
    return processedAnalysisProjects.slice(start, start + analysisPageSize);
  }, [processedAnalysisProjects, analysisCurrentPage, analysisPageSize]);

  // Handler for Project Analysis Table Header Sorting
  const handleAnalysisSort = (columnKey) => {
    if (analysisSortBy === columnKey) {
      setAnalysisSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setAnalysisSortBy(columnKey);
      setAnalysisSortOrder('asc');
    }
    setAnalysisCurrentPage(1);
  };

  // Header click sort handler: flips ascending / descending on the pressed column header
  const handleSort = (columnKey) => {
    if (sortBy === columnKey) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(columnKey);
      // For Task ID column, default order is descending; for rest of the columns, default is ascending
      setSortOrder(columnKey === 'id' ? 'desc' : 'asc');
    }
  };

  // Processed and expanded rows for Tabular Mode
  const processedTabularRows = useMemo(() => {
    let list = [...(tabularData.items || [])];

    // Local search filter if searchTerm exists
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter(t => 
        (t.title && t.title.toLowerCase().includes(term)) ||
        (t.description && t.description.toLowerCase().includes(term)) ||
        (t.project_name && t.project_name.toLowerCase().includes(term)) ||
        String(t.id).includes(term) ||
        (t.assignees && t.assignees.some(a => (a.full_name || '').toLowerCase().includes(term))) ||
        (t.assigned_by_name && t.assigned_by_name.toLowerCase().includes(term))
      );
    }

    // Task scoping: For non-interns, filter by tabularTaskScope ('allocated' vs 'successors')
    // For Intern role or designation, "Successor Task" disappears and intern sees all their assigned tasks
    let scopedList = list;
    if (isHRRole) {
      // Rule: Existing interns should not be in assign flow of HR
      scopedList = scopedList.filter(t => !t.assignees?.some(a => (a.role || '').toLowerCase() === 'intern'));
    }
    if (!isIntern) {
      if (tabularTaskScope === 'allocated') {
        // Feature 1: Present only tasks allocated by the current user
        scopedList = list.filter(t => t.assigned_by_id === user?.id);
      } else if (tabularTaskScope === 'received') {
        // Tasks assigned to the current user
        scopedList = list.filter(t => t.assignees?.some(a => a.id === user?.id));
      } else {
        // Feature 2: Present all successor / accessible tasks
        // For HR: Successor count aligns strictly with (super_admin -> hr) or (super_admin -> hr -> hr_intern) or (super_admin -> any_roles_relate_with_hr)
        if (isHRRole) {
          const hrSuccessorIds = successors.map(s => s.id);
          if (hrSuccessorIds.length > 0) {
            scopedList = list.filter(t => t.assignees?.some(a => hrSuccessorIds.includes(a.id)));
          } else {
            scopedList = [];
          }
        } else {
          scopedList = list;
        }
      }
    } else {
      // For Intern: default / received scope shows tasks assigned to the intern
      if (tabularTaskScope === 'received') {
        scopedList = list.filter(t => t.assignees?.some(a => a.id === user?.id));
      }
    }

    // Present rows:
    // When "All Tasks" is unpressed (tabularTaskScope === 'allocated'):
    // "it should show the single person,which I assigned the task that should show whose the person either single or group, If group means, it should show single record of the employee whose assgined on it eventhough the Task ID number will repeatative is fine"
    // When "All Tasks" is pressed (tabularTaskScope === 'successors'):
    // "It should the distinct task and it should present in descending in the 'task ID'"
    const rows = [];
    if (!isIntern && tabularTaskScope === 'allocated') {
      scopedList.forEach(task => {
        // Actual assignees allocated to the task, irrespective of all roles:
        const actualAssignees = (task.assignees && task.assignees.length > 0)
          ? [...task.assignees].sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
          : [];

        if (actualAssignees.length === 0) {
          rows.push({
            ...task,
            single_assignee: null,
            task_assignees: [],
            display_row_key: `task-${task.id}-unassigned`,
            assignee_sort_name: '',
          });
        } else {
          // If group or single, show single record of the employee assigned on it (repeating Task ID)
          actualAssignees.forEach((assignee, idx) => {
            rows.push({
              ...task,
              single_assignee: assignee,
              task_assignees: actualAssignees,
              display_row_key: `task-${task.id}-assignee-${assignee.id || idx}`,
              assignee_sort_name: assignee.full_name || '',
            });
          });
        }
      });
    } else {
      // Pressed "All Tasks" button mode (distinct tasks):
      scopedList.forEach(task => {
        const actualAssignees = (task.assignees && task.assignees.length > 0)
          ? [...task.assignees].sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
          : [];

        rows.push({
          ...task,
          single_assignee: actualAssignees[0] || null,
          task_assignees: actualAssignees,
          display_row_key: `task-${task.id}`,
          assignee_sort_name: actualAssignees[0]?.full_name || '',
        });
      });
    }

    // Multi-factor Sorting
    rows.sort((a, b) => {
      let multiplier = sortOrder === 'asc' ? 1 : -1;
      switch (sortBy) {
        case 'id': {
          const idDiff = (a.id - b.id) * multiplier;
          if (idDiff !== 0) return idDiff;
          // For rows belonging to the same task (expanded assignees),
          // "the allocated assignees should in ascending order":
          return (a.assignee_sort_name || '').localeCompare(b.assignee_sort_name || '');
        }
        case 'title': {
          const diff = (a.title || '').localeCompare(b.title || '') * multiplier;
          if (diff !== 0) return diff;
          return (a.assignee_sort_name || '').localeCompare(b.assignee_sort_name || '');
        }
        case 'project': {
          const diff = (a.project_name || '').localeCompare(b.project_name || '') * multiplier;
          if (diff !== 0) return diff;
          return (a.assignee_sort_name || '').localeCompare(b.assignee_sort_name || '');
        }
        case 'assignee': {
          return (a.assignee_sort_name || '').localeCompare(b.assignee_sort_name || '') * multiplier;
        }
        case 'status': {
          const diff = (a.status || '').localeCompare(b.status || '') * multiplier;
          if (diff !== 0) return diff;
          return (a.id - b.id) * multiplier;
        }
        case 'priority': {
          const priorityWeight = { critical: 4, high: 3, medium: 2, low: 1 };
          const weightA = priorityWeight[(a.priority || '').toLowerCase()] || 0;
          const weightB = priorityWeight[(b.priority || '').toLowerCase()] || 0;
          const diff = (weightA - weightB) * multiplier;
          if (diff !== 0) return diff;
          return (a.id - b.id) * multiplier;
        }
        case 'due_date': {
          const timeA = a.due_date ? new Date(a.due_date).getTime() : 0;
          const timeB = b.due_date ? new Date(b.due_date).getTime() : 0;
          const diff = (timeA - timeB) * multiplier;
          if (diff !== 0) return diff;
          return (a.id - b.id) * multiplier;
        }
        case 'assigned_by': {
          const byA = a.assigned_by_name || '';
          const byB = b.assigned_by_name || '';
          const diff = byA.localeCompare(byB) * multiplier;
          if (diff !== 0) return diff;
          return (a.id - b.id) * multiplier;
        }
        case 'progress': {
          const diff = ((a.progress || 0) - (b.progress || 0)) * multiplier;
          if (diff !== 0) return diff;
          return (a.id - b.id) * multiplier;
        }
        default: {
          const idDiff = (a.id - b.id) * multiplier;
          if (idDiff !== 0) return idDiff;
          return (a.assignee_sort_name || '').localeCompare(b.assignee_sort_name || '');
        }
      }
    });

    return rows;
  }, [tabularData.items, searchTerm, isIntern, tabularTaskScope, user?.id, sortBy, sortOrder]);

  const totalTabularRows = processedTabularRows.length;
  const totalTabularPages = Math.max(1, Math.ceil(totalTabularRows / pageSize));

  // Immediate client-side sorting & paginating for responsive UX across loaded items
  const sortedTabularItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return processedTabularRows.slice(start, start + pageSize);
  }, [processedTabularRows, currentPage, pageSize]);

  // Processed and filtered Board columns respecting task scope ('allocated' vs 'successors')
  const processedBoardColumns = useMemo(() => {
    if (!boardData.columns) return [];
    return boardData.columns.map(col => {
      let tasks = col.tasks || [];
      if (!isIntern) {
        if (tabularTaskScope === 'allocated') {
          tasks = tasks.filter(t => t.assigned_by_id === user?.id);
        } else if (tabularTaskScope === 'received') {
          tasks = tasks.filter(t => t.assignees?.some(a => a.id === user?.id));
        } else if (isHRRole) {
          const hrSuccessorIds = successors.map(s => s.id);
          if (hrSuccessorIds.length > 0) {
            tasks = tasks.filter(t => t.assignees?.some(a => hrSuccessorIds.includes(a.id)));
          } else {
            tasks = [];
          }
        }
      } else {
        if (tabularTaskScope === 'received') {
          tasks = tasks.filter(t => t.assignees?.some(a => a.id === user?.id));
        }
      }
      return {
        ...col,
        count: tasks.length,
        tasks
      };
    });
  }, [boardData.columns, isIntern, tabularTaskScope, user?.id, isHRRole, successors]);

  // Keep currentPage valid when row counts change
  useEffect(() => {
    if (currentPage > totalTabularPages) {
      setCurrentPage(1);
    }
  }, [currentPage, totalTabularPages]);

  const handleQuickStatusMove = async (taskId, newStatus, e) => {
    e.stopPropagation();
    try {
      await tasksApi.updateStatus(taskId, {
        status: newStatus,
        progress: newStatus === 'Completed' ? 100 : undefined,
      });
      if (viewMode === 'board') fetchBoardTasks();
      else fetchTabularTasks();
    } catch (err) {
      console.error('Failed to update status:', err);
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

  const getStatusBadge = (s) => {
    switch (s?.toLowerCase()) {
      case 'completed': return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'in progress': return 'bg-brand-100 text-brand-800 border-brand-200';
      case 'overdue': return 'bg-rose-100 text-rose-800 border-rose-200 font-bold';
      case 'under review': return 'bg-purple-100 text-purple-800 border-purple-200';
      default: return 'bg-slate-100 text-slate-800 border-slate-200';
    }
  };

  const getRoleBadge = (role) => {
    switch (role?.toLowerCase().replace(' ', '_')) {
      case 'super_admin':
      case 'superadmin':
        return { label: 'Super Admin', color: 'bg-purple-100 text-purple-800 border-purple-200' };
      case 'admin':
        return { label: 'Admin', color: 'bg-blue-100 text-blue-800 border-blue-200' };
      case 'hr':
      case 'human_resource_manager':
        return { label: 'Human Resource', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
      case 'team_lead':
        return { label: 'Team Lead', color: 'bg-amber-100 text-amber-800 border-amber-200' };
      case 'employee':
        return { label: 'Employee', color: 'bg-sky-100 text-sky-800 border-sky-200' };
      case 'intern':
      default:
        return { label: 'Intern', color: 'bg-brand-50 text-brand-700 border-brand-200' };
    }
  };

  const formatSortName = (key) => {
    switch (key) {
      case 'id': return 'Task ID';
      case 'title': return 'Task Title';
      case 'project': return 'Allocated Project';
      case 'assignee': return 'Allocated Assignees';
      case 'status': return 'Status';
      case 'priority': return 'Priority';
      case 'due_date': return 'Due Date';
      case 'assigned_by': return 'Assigned By';
      case 'progress': return 'Progress %';
      default: return key;
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header & Controls */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-2xl font-bold text-slate-900">My Tasks</h1>
              <span className="text-xs bg-brand-100 text-brand-800 font-semibold px-2.5 py-0.5 rounded-full">
                {user?.role?.replace('_', ' ').toUpperCase()} VIEW
              </span>
              {isHRRole && (
                <span className="text-xs bg-emerald-100 text-emerald-800 font-bold px-2.5 py-0.5 rounded-full border border-emerald-200">
                  Successors &amp; Reporting Subordinate: {successorsCount}
                </span>
              )}
            </div>
            {/* <p className="text-xs text-slate-500 mt-1">
              Track, organize, and allocate task status under designated projects in <strong>Board Mode</strong> or <strong>Tabular Mode with Pagination & Header Sort/Filter</strong>.
            </p> */}
          </div>

          {/* Mode Switcher & Create Task Button */}
          <div className="flex items-center space-x-3">
            {/* Toggle Board vs Tabular vs Project Analysis */}
            <div className="bg-slate-100 p-1 rounded-xl flex items-center border border-slate-200">
              <button
                type="button"
                onClick={() => setViewMode('tabular')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  viewMode === 'tabular'
                    ? 'bg-white text-brand-700 shadow-xs border border-slate-200/60'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <TableIcon className="w-3.5 h-3.5" />
                <span>Tabular Mode</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('board')}
                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  viewMode === 'board'
                    ? 'bg-white text-brand-700 shadow-xs border border-slate-200/60'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Kanban className="w-3.5 h-3.5" />
                <span>Board Mode</span>
              </button>
              {/* Project Analysis Mode - Restricted: Except the 'Intern' Designation Role, rest should be present it */}
              {!isIntern && (
                <button
                  type="button"
                  onClick={() => setViewMode('project_analysis')}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    viewMode === 'project_analysis'
                      ? 'bg-white text-brand-700 shadow-xs border border-slate-200/60'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  <span>Project Analysis Mode</span>
                </button>
              )}
            </div>

            {/* Create Task Button (Hidden / Disappears for Interns) */}
            {!isIntern && (
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(true)}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs rounded-xl transition-all shadow-xs flex items-center space-x-1.5 cursor-pointer animate-in fade-in duration-150"
              >
                <Plus className="w-4 h-4" />
                <span>Create Task</span>
              </button>
            )}
          </div>
        </div>

        {/* Successors & Reporting Subordinate Banner (Dedicated for HR & Hierarchy Roles) */}
        {isHRRole && (
          <div className="mt-4 p-4 bg-gradient-to-r from-purple-50 via-slate-50 to-emerald-50 rounded-xl border border-purple-200/80 shadow-2xs space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                  <Users className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  Successors &amp; Reporting Subordinate
                </h3>
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold">
                  {successorsCount}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
                <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700">
                  Predecessor: <strong className="text-slate-900">Super Admin (Elizabeth Reed)</strong>
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-purple-100 text-purple-800 border border-purple-200 font-mono">
                  {successorsCount > 0 ? 'super_admin → hr → hr_intern' : 'super_admin → hr'}
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Successors &amp; Reporting Subordinate: {successorsCount}
                </span>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              While logged in on credentials <strong>hr@ingage.com</strong>, the count for <strong>Successors &amp; Reporting Subordinate is {successorsCount}</strong>. The successor count does <strong>not align with all tasks</strong>; it aligns strictly with <strong>(super_admin → hr)</strong>, <strong>(super_admin → hr → hr_intern)</strong>, or <strong>(super_admin → any_roles_relate_with_hr)</strong>. Zero correlation with engineering interns, team leads, or admins.
            </p>
          </div>
        )}

        {/* Global Filter Bar */}
        <div className="mt-5 pt-4 border-t border-slate-100 flex flex-col lg:flex-row items-center justify-between gap-3">
          <form onSubmit={handleSearch} className="w-full lg:w-72 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={viewMode === 'project_analysis' ? "Search projects by name or code..." : "Search tasks..."}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white"
            />
          </form>

          {viewMode === 'project_analysis' ? (
            <div className="w-full lg:w-auto flex items-center justify-between lg:justify-end gap-3 text-xs">
              <span className="text-slate-500">
                Total Projects: <strong className="text-slate-800">{processedAnalysisProjects.length}</strong>
              </span>
              <button
                type="button"
                onClick={fetchAnalysisData}
                disabled={analysisLoading}
                className="p-1.5 px-2.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-50 cursor-pointer flex items-center space-x-1.5 font-medium transition-colors"
                title="Refresh Analysis Data"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${analysisLoading ? 'animate-spin text-brand-600' : 'text-slate-500'}`} />
                <span>Refresh</span>
              </button>
            </div>
          ) : (
            <div className="w-full lg:w-auto flex flex-wrap items-center gap-3 text-xs" ref={outsideFilterRef}>
              {/* Feature: Total which I assigned or received (Presented for all roles, left side of 'All Tasks' button) */}
              <div className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50/90 p-0.5 shadow-2xs text-xs">
                {/* Total */}
                {/* Assigned */}
                {/* <button
                  type="button"
                  onClick={() => {
                    setTabularTaskScope('successors');
                    setSortBy('id');
                    setSortOrder('desc');
                    setCurrentPage(1);
                  }}
                  className={`px-2.5 py-1.5 rounded-lg font-medium transition-all flex items-center space-x-1.5 cursor-pointer ${
                    tabularTaskScope === 'successors'
                      ? 'bg-brand-600 text-white font-semibold shadow-xs'
                      : 'text-slate-700 hover:text-slate-900 hover:bg-white'
                  }`}
                  title="Total tasks you assigned or received (Click to view all tasks)"
                >
                  <span className={tabularTaskScope === 'successors' ? 'text-brand-100 font-normal' : 'text-slate-500 font-normal'}>
                    Total:
                  </span>
                  <span className="font-bold">
                    {taskCounts.total}
                  </span>
                </button>

                <div className="h-3.5 w-px bg-slate-200 mx-0.5" />

                <button
                  type="button"
                  onClick={() => {
                    if (!isIntern) {
                      setTabularTaskScope('allocated');
                      setCurrentPage(1);
                    }
                  }}
                  disabled={isIntern}
                  className={`px-2.5 py-1.5 rounded-lg font-medium transition-all flex items-center space-x-1.5 ${
                    isIntern ? 'cursor-default opacity-60' : 'cursor-pointer'
                  } ${
                    tabularTaskScope === 'allocated' && !isIntern
                      ? 'bg-blue-600 text-white font-semibold shadow-xs'
                      : 'text-slate-700 hover:text-blue-700 hover:bg-white'
                  }`}
                  title={isIntern ? "Tasks allocated by you (Interns do not assign tasks)" : "Tasks allocated by you (Click to view tasks you assigned)"}
                >
                  <span className={tabularTaskScope === 'allocated' && !isIntern ? 'text-blue-100 font-normal' : 'text-slate-500 font-normal'}>
                    Assigned:
                  </span>
                  <span className={`font-bold ${tabularTaskScope === 'allocated' && !isIntern ? 'text-white' : 'text-blue-700'}`}>
                    {taskCounts.assigned}
                  </span>
                </button>

                <div className="h-3.5 w-px bg-slate-200 mx-0.5" />

                <button
                  type="button"
                  onClick={() => {
                    setTabularTaskScope('received');
                    setCurrentPage(1);
                  }}
                  className={`px-2.5 py-1.5 rounded-lg font-medium transition-all flex items-center space-x-1.5 cursor-pointer ${
                    tabularTaskScope === 'received'
                      ? 'bg-emerald-600 text-white font-semibold shadow-xs'
                      : 'text-slate-700 hover:text-emerald-700 hover:bg-white'
                  }`}
                  title="Tasks assigned to you (Click to view tasks you received)"
                >
                  <span className={tabularTaskScope === 'received' ? 'text-emerald-100 font-normal' : 'text-slate-500 font-normal'}>
                    Received:
                  </span>
                  <span className={`font-bold ${tabularTaskScope === 'received' ? 'text-white' : 'text-emerald-700'}`}>
                    {taskCounts.received}
                  </span>
                </button> */}
                    {/* Received */}
              </div>

              {/* Feature 2: All Tasks Toggle Button (Presented in both Tabular and Board Modes, disappears for Intern role/designation) */}
              {!isIntern && (viewMode === 'tabular' || viewMode === 'board') && (
                <button
                  type="button"
                  onClick={() => {
                    const nextScope = tabularTaskScope === 'successors' ? 'allocated' : 'successors';
                    setTabularTaskScope(nextScope);
                    if (nextScope === 'successors') {
                      // If I press "All Tasks" Button: distinct tasks and present in descending in task ID
                      setSortBy('id');
                      setSortOrder('desc');
                    }
                    setCurrentPage(1);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center space-x-1.5 transition-all cursor-pointer shadow-2xs ${
                    tabularTaskScope === 'successors'
                      ? 'bg-brand-600 text-white border-brand-600 shadow-xs ring-1 ring-brand-500'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-brand-700 hover:border-slate-300'
                  }`}
                  title={
                    tabularTaskScope === 'successors'
                      ? "Currently viewing All Tasks (Distinct tasks in descending Task ID). Click to switch to Tasks I Allocated."
                      : "Click to present All Tasks in descending order of Task ID."
                  }
                >
                  <Users className={`w-3.5 h-3.5 ${tabularTaskScope === 'successors' ? 'text-white' : 'text-slate-500'}`} />
                  <span>All Tasks</span>
                  {tabularTaskScope === 'successors' && (
                    <Check className="w-3.5 h-3.5 text-white stroke-[2.5]" />
                  )}
                </button>
              )}

              {/* 1. Status Filter Pop-up Button (Disappears only in Board Mode, Appears in Tabular Mode) */}
              {viewMode !== 'board' && (
                <div className="relative inline-flex items-center">
                  <button
                    type="button"
                    onClick={() => setActiveOutsideFilter(activeOutsideFilter === 'status' ? null : 'status')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center space-x-1.5 transition-colors cursor-pointer ${
                      selectedStatus !== 'All'
                        ? 'bg-brand-600 text-white border-brand-600 shadow-2xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                    title="Filter tasks by status"
                  >
                    <Filter className={`w-3 h-3 ${selectedStatus !== 'All' ? 'text-white' : 'text-slate-400'}`} />
                    <span>Status: <strong className="font-bold">{selectedStatus === 'All' ? 'All' : selectedStatus}</strong></span>
                    <ChevronDown className={`w-3 h-3 transition-transform ${activeOutsideFilter === 'status' ? 'rotate-180' : ''}`} />
                  </button>

                  {/* Status Pop-up Window (Outside of Table) */}
                  {activeOutsideFilter === 'status' && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute left-0 top-10 w-48 bg-white rounded-xl shadow-xl border border-slate-200 p-2 z-50 font-normal text-xs normal-case animate-in fade-in zoom-in-95 duration-100"
                    >
                      <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-100 font-bold text-slate-800 text-[11px]">
                        <span className="flex items-center gap-1.5">
                          <Filter className="w-3 h-3 text-brand-600" />
                          Filter by Status
                        </span>
                        <button
                          type="button"
                          onClick={() => setActiveOutsideFilter(null)}
                          className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="space-y-1">
                        {['All', 'Backlog', 'In Progress', 'Under Review', 'Completed', 'Overdue'].map((st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => {
                              setSelectedStatus(st);
                              setCurrentPage(1);
                              setActiveOutsideFilter(null);
                            }}
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between text-xs cursor-pointer transition-colors ${
                              selectedStatus === st ? 'bg-brand-50 text-brand-800 font-bold' : 'hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            <span>{st === 'All' ? 'All Statuses' : st}</span>
                            {selectedStatus === st && <Check className="w-3.5 h-3.5 text-brand-600 shrink-0" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 2. Priority Filter Pop-up Button */}
              <div className="relative inline-flex items-center">
                <button
                  type="button"
                  onClick={() => setActiveOutsideFilter(activeOutsideFilter === 'priority' ? null : 'priority')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center space-x-1.5 transition-colors cursor-pointer ${
                    selectedPriority !== 'All'
                      ? 'bg-brand-600 text-white border-brand-600 shadow-2xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                  title="Filter tasks by priority"
                >
                  <Filter className={`w-3 h-3 ${selectedPriority !== 'All' ? 'text-white' : 'text-slate-400'}`} />
                  <span>Priority: <strong className="font-bold">{selectedPriority === 'All' ? 'All' : selectedPriority}</strong></span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${activeOutsideFilter === 'priority' ? 'rotate-180' : ''}`} />
                </button>

                {/* Priority Pop-up Window (Outside of Table) */}
                {activeOutsideFilter === 'priority' && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute left-0 top-10 w-44 bg-white rounded-xl shadow-xl border border-slate-200 p-2 z-50 font-normal text-xs normal-case animate-in fade-in zoom-in-95 duration-100"
                  >
                    <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-100 font-bold text-slate-800 text-[11px]">
                      <span className="flex items-center gap-1.5">
                        <Filter className="w-3 h-3 text-brand-600" />
                        Filter by Priority
                      </span>
                      <button
                        type="button"
                        onClick={() => setActiveOutsideFilter(null)}
                        className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="space-y-1">
                      {['All', 'Critical', 'High', 'Medium', 'Low'].map((pr) => (
                        <button
                          key={pr}
                          type="button"
                          onClick={() => {
                            setSelectedPriority(pr);
                            setCurrentPage(1);
                            setActiveOutsideFilter(null);
                          }}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between text-xs cursor-pointer transition-colors ${
                            selectedPriority === pr ? 'bg-brand-50 text-brand-800 font-bold' : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <span>{pr === 'All' ? 'All Priorities' : pr}</span>
                          {selectedPriority === pr && <Check className="w-3.5 h-3.5 text-brand-600 shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Project Filter Pop-up Button */}
              <div className="relative inline-flex items-center">
                <button
                  type="button"
                  onClick={() => setActiveOutsideFilter(activeOutsideFilter === 'project' ? null : 'project')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center space-x-1.5 transition-colors cursor-pointer max-w-56 ${
                    selectedProjectFilter !== 'All'
                      ? 'bg-brand-600 text-white border-brand-600 shadow-2xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                  title="Filter tasks by project"
                >
                  <Filter className={`w-3 h-3 shrink-0 ${selectedProjectFilter !== 'All' ? 'text-white' : 'text-slate-400'}`} />
                  <span className="truncate">
                    Project: <strong className="font-bold">{selectedProjectFilter === 'All' ? 'All' : (projectsList.find(p => String(p.id) === String(selectedProjectFilter))?.name || selectedProjectFilter)}</strong>
                  </span>
                  <ChevronDown className={`w-3 h-3 shrink-0 transition-transform ${activeOutsideFilter === 'project' ? 'rotate-180' : ''}`} />
                </button>

                {/* Project Pop-up Window (Outside of Table) */}
                {activeOutsideFilter === 'project' && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-10 w-56 bg-white rounded-xl shadow-xl border border-slate-200 p-2 z-50 font-normal text-xs normal-case animate-in fade-in zoom-in-95 duration-100"
                  >
                    <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-100 font-bold text-slate-800 text-[11px]">
                      <span className="flex items-center gap-1.5">
                        <Filter className="w-3 h-3 text-brand-600" />
                        Filter by Project
                      </span>
                      <button
                        type="button"
                        onClick={() => setActiveOutsideFilter(null)}
                        className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedProjectFilter('All');
                          setCurrentPage(1);
                          setActiveOutsideFilter(null);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between text-xs cursor-pointer transition-colors ${
                          selectedProjectFilter === 'All' ? 'bg-brand-50 text-brand-800 font-bold' : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <span>All Projects</span>
                        {selectedProjectFilter === 'All' && <Check className="w-3.5 h-3.5 text-brand-600 shrink-0" />}
                      </button>
                      {projectsList.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setSelectedProjectFilter(String(p.id));
                            setCurrentPage(1);
                            setActiveOutsideFilter(null);
                          }}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between text-xs cursor-pointer transition-colors truncate ${
                            selectedProjectFilter === String(p.id) ? 'bg-brand-50 text-brand-800 font-bold' : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <span className="truncate">{p.name}</span>
                          {selectedProjectFilter === String(p.id) && <Check className="w-3.5 h-3.5 text-brand-600 shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ================= MODE 1: BOARD MODE (Kanban columns) ================= */}
      {viewMode === 'board' && (
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4 items-start">
          {processedBoardColumns?.map((col) => {
            const isOverdueCol = col.id === 'Overdue';
            const isCompletedCol = col.id === 'Completed';
            return (
              <div
                key={col.id}
                className={`rounded-2xl border p-4 shadow-2xs flex flex-col min-h-[520px] ${
                  isOverdueCol 
                    ? 'bg-rose-50/40 border-rose-200' 
                    : isCompletedCol 
                    ? 'bg-emerald-50/30 border-emerald-200' 
                    : 'bg-white border-slate-200'
                }`}
              >
                {/* Column Header */}
                <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-100">
                  <div className="flex items-center space-x-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${
                      col.id === 'Completed' ? 'bg-emerald-500' :
                      col.id === 'In Progress' ? 'bg-brand-600' :
                      col.id === 'Overdue' ? 'bg-rose-500 animate-pulse' :
                      col.id === 'Under Review' ? 'bg-purple-500' : 'bg-slate-400'
                    }`} />
                    <h3 className="font-bold text-xs uppercase tracking-wider text-slate-800">
                      {col.name}
                    </h3>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    isOverdueCol ? 'bg-rose-100 text-rose-700' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {col.count}
                  </span>
                </div>

                {/* Task Cards in Column */}
                <div className="space-y-3 flex-1 overflow-y-auto">
                  {col.tasks.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                      No tasks
                    </div>
                  ) : (
                    col.tasks.map((task) => (
                      <div
                        key={task.id}
                        onClick={() => {
                          setSelectedTask(task);
                          setIsDetailModalOpen(true);
                        }}
                        className="bg-white rounded-xl p-4 border border-slate-200 hover:border-brand-500 shadow-2xs hover:shadow-md transition-all cursor-pointer group"
                      >
                        {/* Project Badge & ID */}
                        <div className="flex items-center justify-between mb-2">
                          <span className="inline-flex items-center space-x-1 text-[10px] font-bold text-brand-800 bg-brand-50 px-2 py-0.5 rounded-md border border-brand-200 truncate max-w-[150px]">
                            <Building className="w-3 h-3 text-brand-600 shrink-0" />
                            <span className="truncate">{task.project_name || 'Edutech LMS'}</span>
                          </span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full border ${getPriorityBadge(task.priority)}`}>
                            {task.priority}
                          </span>
                        </div>

                        {/* Title & Description */}
                        <div className="flex items-center justify-between gap-1 mb-1">
                          <span
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTask(task);
                              setIsDetailModalOpen(true);
                            }}
                            className="text-xs font-bold text-slate-900 hover:text-brand-700 hover:underline transition-colors line-clamp-2 leading-snug cursor-pointer flex-1"
                            title={task.title}
                          >
                            {task.title}
                          </span>
                          {/* If the task is assigned more than 1 person, show number button */}
                          {task.assignees && task.assignees.length > 1 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenGroupPopup(task, task.assignees);
                              }}
                              className="shrink-0 inline-flex items-center space-x-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 hover:bg-purple-200 text-purple-800 border border-purple-300 transition-colors cursor-pointer shadow-2xs"
                              title={`Assigned to ${task.assignees.length} persons. Click to view assigned members.`}
                            >
                              <Users className="w-2.5 h-2.5 text-purple-600 mr-0.5" />
                              <span>{task.assignees.length}</span>
                            </button>
                          )}
                        </div>
                        {task.description && (
                          <p className="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                            {task.description}
                          </p>
                        )}

                        {/* Allocated Assignees:
                            Presents actual allocated persons irrespective of role */}
                        {(() => {
                          const sortedMembers = (task.assignees && task.assignees.length > 0)
                            ? [...task.assignees].sort((a, b) => (a.full_name || '').localeCompare(b.full_name || ''))
                            : [];

                          if (!sortedMembers || sortedMembers.length === 0) {
                            return (
                              <div className="mt-2.5 text-[10px] text-slate-400 italic">
                                Unassigned
                              </div>
                            );
                          }

                          const firstPerson = sortedMembers[0];
                          const restOfPersons = sortedMembers.slice(1);
                          const isGroupTask = restOfPersons.length > 0;
                          const memberRole = (firstPerson.role || '').toLowerCase();
                          const canHaveSuccessor = !isIntern && (
                            (isSuperAdminUser && memberRole === 'admin') ||
                            (isAdminUser && memberRole === 'team_lead')
                          );
                          const successorLabel = memberRole === 'admin' ? 'Team Lead' : 'Intern';

                          return (
                            <div className="mt-2.5 flex items-center justify-between gap-1.5 flex-wrap">
                              <div className="flex items-center space-x-1.5 min-w-0">
                                {firstPerson.avatar || firstPerson.photo ? (
                                  <img
                                    src={firstPerson.avatar || firstPerson.photo}
                                    alt={firstPerson.full_name}
                                    title={firstPerson.full_name}
                                    className="w-5 h-5 rounded-full object-cover ring-1 ring-slate-200 shrink-0"
                                  />
                                ) : (
                                  <div
                                    title={firstPerson.full_name}
                                    className="w-5 h-5 rounded-full bg-brand-100 text-brand-800 text-[9px] font-bold flex items-center justify-center ring-1 ring-slate-200 shrink-0"
                                  >
                                    {firstPerson.full_name?.charAt(0) || 'U'}
                                  </div>
                                )}
                                <span
                                  className="text-[10px] font-semibold text-slate-800 truncate max-w-[85px]"
                                  title={firstPerson.full_name}
                                >
                                  {firstPerson.full_name}
                                </span>

                                {!isIntern && isGroupTask && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenGroupPopup(task, sortedMembers);
                                    }}
                                    className="inline-flex items-center space-x-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 transition-colors cursor-pointer shadow-2xs shrink-0"
                                    title={`Group Task: ${sortedMembers.length} members in ascending order. Click to view list.`}
                                  >
                                    <Users className="w-2.5 h-2.5" />
                                    <span>+{restOfPersons.length} more</span>
                                  </button>
                                )}
                              </div>

                              {/* Board Mode Successor Task Button */}
                              {canHaveSuccessor && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenSuccessorPopup(firstPerson, task);
                                  }}
                                  className="text-[9px] font-bold text-brand-700 bg-brand-50 hover:bg-brand-100 px-1.5 py-0.5 rounded border border-brand-200 shrink-0 cursor-pointer transition-colors shadow-2xs flex items-center space-x-0.5"
                                  title={`View 1st Following Successor (${successorLabel})`}
                                >
                                  <span>+{successorLabel}</span>
                                </button>
                              )}
                            </div>
                          );
                        })()}

                        {/* Progress Bar */}
                        <div className="mt-3">
                          <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                            <span>Progress</span>
                            <span className="font-semibold text-slate-700">{task.progress}%</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-1.5 rounded-full transition-all ${
                                task.status === 'Completed' ? 'bg-emerald-500' :
                                task.status === 'Overdue' ? 'bg-rose-500' : 'bg-brand-500'
                              }`}
                              style={{ width: `${task.progress}%` }}
                            />
                          </div>
                        </div>

                        {/* Due Date & Assignee Footer */}
                        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                          <span className={`flex items-center space-x-1 ${
                            task.status === 'Overdue' ? 'text-rose-600 font-bold' : ''
                          }`}>
                            <Calendar className="w-3 h-3" />
                            <span>{task.due_date ? new Date(task.due_date).toLocaleDateString([], { month: 'short', day: 'numeric' }) : 'No due date'}</span>
                          </span>

                          {/* Quick Shift Button */}
                          {task.status !== 'Completed' && (
                            <button
                              onClick={(e) => handleQuickStatusMove(task.id, 'Completed', e)}
                              className="text-[10px] font-semibold text-brand-600 hover:text-brand-800 hover:underline flex items-center space-x-0.5 cursor-pointer"
                              title="Mark as Completed"
                            >
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Done</span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ================= MODE 2: TABULAR MODE (With Pagination & Header Filter/Sort) ================= */}
      {viewMode === 'tabular' && (
        <div className="space-y-3">
          {/* Active Sort & Filter Indicator Strip */}
          <div className="bg-white rounded-xl px-4 py-2.5 border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center flex-wrap gap-2 text-slate-600">
              <span className="font-semibold text-slate-800 flex items-center space-x-1">
                <Sparkles className="w-3.5 h-3.5 text-brand-600" />
                <span>Active Table Ordering:</span>
              </span>
              <span className="inline-flex items-center space-x-1 bg-brand-50 text-brand-800 border border-brand-200 px-2.5 py-0.5 rounded-lg font-bold">
                <span>{formatSortName(sortBy)}</span>
                <span className="text-[10px] bg-brand-600 text-white px-1.5 py-0.2 rounded uppercase">
                  {sortOrder === 'asc' ? '▲ Ascending' : '▼ Descending'}
                </span>
              </span>
              {isHRRole && (
                <span className="inline-flex items-center space-x-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 rounded-lg font-bold text-[11px]">
                  <Users className="w-3 h-3 text-emerald-600" />
                  <span>Successors &amp; Reporting Subordinate: {successorsCount}</span>
                </span>
              )}
              {(selectedStatus !== 'All' || selectedPriority !== 'All' || selectedProjectFilter !== 'All' || searchTerm) && (
                <span className="text-slate-400">
                  • Filtered by:{' '}
                  {[
                    selectedStatus !== 'All' && `Status: ${selectedStatus}`,
                    selectedPriority !== 'All' && `Priority: ${selectedPriority}`,
                    selectedProjectFilter !== 'All' && `Project: ${projectsList.find(p => p.id === parseInt(selectedProjectFilter))?.name || selectedProjectFilter}`,
                    searchTerm && `Search: "${searchTerm}"`
                  ].filter(Boolean).join(', ')}
                </span>
              )}
            </div>

            <div className="flex items-center space-x-2">
              {/* <span className="text-[11px] text-slate-400">
                Tip: Click any consecutive table header to toggle <strong>Ascending (▲)</strong> or <strong>Descending (▼)</strong>
              </span> */}
              <button
                type="button"
                onClick={() => {
                  setSortBy('id');
                  setSortOrder('desc');
                  setSelectedStatus('All');
                  setSelectedPriority('All');
                  setSelectedProjectFilter('All');
                  setSearchTerm('');
                  setTabularTaskScope('allocated');
                  setCurrentPage(1);
                }}
                className="text-[11px] font-semibold text-slate-500 hover:text-brand-700 bg-slate-100 hover:bg-slate-200 px-2 py-1 rounded-md transition-colors flex items-center space-x-1 cursor-pointer"
                title="Reset sort & filters"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            </div>
          </div>

          {/* Table Container */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600">
                    
                    {/* 1. Task ID (Sortable Header) */}
                    <th
                      onClick={() => handleSort('id')}
                      className={`py-3.5 px-4 select-none cursor-pointer group transition-colors ${
                        sortBy === 'id'
                          ? 'bg-brand-50/90 text-brand-900 border-b-2 border-brand-600 font-extrabold'
                          : 'hover:bg-slate-100/90 hover:text-slate-900'
                      }`}
                      title={`Click to sort Task ID ${sortBy === 'id' && sortOrder === 'desc' ? 'Ascending' : 'Descending'}`}
                    >
                      <div className="flex items-center space-x-1.5">
                        <span>Task ID</span>
                        <span className="inline-flex items-center shrink-0">
                          {sortBy === 'id' ? (
                            sortOrder === 'desc' ? (
                              <ArrowDown className="w-3.5 h-3.5 text-brand-700 stroke-[2.5]" />
                            ) : (
                              <ArrowUp className="w-3.5 h-3.5 text-brand-700 stroke-[2.5]" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-600 transition-colors opacity-70" />
                          )}
                        </span>
                      </div>
                    </th>

                    {/* 2. Task Title & Details (Sortable Header) */}
                    <th
                      onClick={() => handleSort('title')}
                      className={`py-3.5 px-4 select-none cursor-pointer group transition-colors min-w-[200px] ${
                        sortBy === 'title'
                          ? 'bg-brand-50/90 text-brand-900 border-b-2 border-brand-600 font-extrabold'
                          : 'hover:bg-slate-100/90 hover:text-slate-900'
                      }`}
                      title={`Click to sort Title ${sortBy === 'title' && sortOrder === 'asc' ? 'Descending' : 'Ascending'}`}
                    >
                      <div className="flex items-center space-x-1.5">
                        <span>Task Title & Details</span>
                        <span className="inline-flex items-center shrink-0">
                          {sortBy === 'title' ? (
                            sortOrder === 'asc' ? (
                              <ArrowUp className="w-3.5 h-3.5 text-brand-700 stroke-[2.5]" />
                            ) : (
                              <ArrowDown className="w-3.5 h-3.5 text-brand-700 stroke-[2.5]" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-600 transition-colors opacity-70" />
                          )}
                        </span>
                      </div>
                    </th>

                    {/* 3. Allocated Project (Sortable Header) */}
                    <th
                      onClick={() => handleSort('project')}
                      className={`py-3.5 px-4 select-none cursor-pointer group transition-colors min-w-[160px] ${
                        sortBy === 'project'
                          ? 'bg-brand-50/90 text-brand-900 border-b-2 border-brand-600 font-extrabold'
                          : 'hover:bg-slate-100/90 hover:text-slate-900'
                      }`}
                      title={`Click to sort Project ${sortBy === 'project' && sortOrder === 'asc' ? 'Descending' : 'Ascending'}`}
                    >
                      <div className="flex items-center space-x-1.5">
                        <span>Allocated Project</span>
                        <span className="inline-flex items-center shrink-0">
                          {sortBy === 'project' ? (
                            sortOrder === 'asc' ? (
                              <ArrowUp className="w-3.5 h-3.5 text-brand-700 stroke-[2.5]" />
                            ) : (
                              <ArrowDown className="w-3.5 h-3.5 text-brand-700 stroke-[2.5]" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-600 transition-colors opacity-70" />
                          )}
                        </span>
                      </div>
                    </th>

                    {/* 4. Allocated Assignees (Sortable Header) */}
                    <th
                      onClick={() => handleSort('assignee')}
                      className={`py-3.5 px-4 select-none cursor-pointer group transition-colors min-w-[160px] ${
                        sortBy === 'assignee'
                          ? 'bg-brand-50/90 text-brand-900 border-b-2 border-brand-600 font-extrabold'
                          : 'hover:bg-slate-100/90 hover:text-slate-900'
                      }`}
                      title={`Click to sort Assignees ${sortBy === 'assignee' && sortOrder === 'asc' ? 'Descending' : 'Ascending'}`}
                    >
                      <div className="flex items-center space-x-1.5">
                        <span>Allocated Assignees</span>
                        <span className="inline-flex items-center shrink-0">
                          {sortBy === 'assignee' ? (
                            sortOrder === 'asc' ? (
                              <ArrowUp className="w-3.5 h-3.5 text-brand-700 stroke-[2.5]" />
                            ) : (
                              <ArrowDown className="w-3.5 h-3.5 text-brand-700 stroke-[2.5]" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-600 transition-colors opacity-70" />
                          )}
                        </span>
                      </div>
                    </th>

                    {/* 5. Status (Sortable Header) */}
                    <th
                      onClick={() => handleSort('status')}
                      className={`py-3.5 px-4 select-none cursor-pointer group transition-colors w-32 ${
                        sortBy === 'status'
                          ? 'bg-brand-50/90 text-brand-900 border-b-2 border-brand-600 font-extrabold'
                          : 'hover:bg-slate-100/90 hover:text-slate-900'
                      }`}
                      title={`Click to sort Status ${sortBy === 'status' && sortOrder === 'asc' ? 'Descending' : 'Ascending'}`}
                    >
                      <div className="flex items-center space-x-1.5">
                        <span>Status</span>
                        <span className="inline-flex items-center shrink-0">
                          {sortBy === 'status' ? (
                            sortOrder === 'asc' ? (
                              <ArrowUp className="w-3.5 h-3.5 text-brand-700 stroke-[2.5]" />
                            ) : (
                              <ArrowDown className="w-3.5 h-3.5 text-brand-700 stroke-[2.5]" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-600 transition-colors opacity-70" />
                          )}
                        </span>
                      </div>
                    </th>

                    {/* 6. Priority (Sortable Header) */}
                    <th
                      onClick={() => handleSort('priority')}
                      className={`py-3.5 px-4 select-none cursor-pointer group transition-colors w-28 ${
                        sortBy === 'priority'
                          ? 'bg-brand-50/90 text-brand-900 border-b-2 border-brand-600 font-extrabold'
                          : 'hover:bg-slate-100/90 hover:text-slate-900'
                      }`}
                      title={`Click to sort Priority ${sortBy === 'priority' && sortOrder === 'asc' ? 'Descending' : 'Ascending'}`}
                    >
                      <div className="flex items-center space-x-1.5">
                        <span>Priority</span>
                        <span className="inline-flex items-center shrink-0">
                          {sortBy === 'priority' ? (
                            sortOrder === 'asc' ? (
                              <ArrowUp className="w-3.5 h-3.5 text-brand-700 stroke-[2.5]" />
                            ) : (
                              <ArrowDown className="w-3.5 h-3.5 text-brand-700 stroke-[2.5]" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-600 transition-colors opacity-70" />
                          )}
                        </span>
                      </div>
                    </th>

                    {/* 7. Due Date (Sortable Header) */}
                    <th
                      onClick={() => handleSort('due_date')}
                      className={`py-3.5 px-4 select-none cursor-pointer group transition-colors w-28 ${
                        sortBy === 'due_date'
                          ? 'bg-brand-50/90 text-brand-900 border-b-2 border-brand-600 font-extrabold'
                          : 'hover:bg-slate-100/90 hover:text-slate-900'
                      }`}
                      title={`Click to sort Due Date ${sortBy === 'due_date' && sortOrder === 'asc' ? 'Descending' : 'Ascending'}`}
                    >
                      <div className="flex items-center space-x-1.5">
                        <span>Due Date</span>
                        <span className="inline-flex items-center shrink-0">
                          {sortBy === 'due_date' ? (
                            sortOrder === 'asc' ? (
                              <ArrowUp className="w-3.5 h-3.5 text-brand-700 stroke-[2.5]" />
                            ) : (
                              <ArrowDown className="w-3.5 h-3.5 text-brand-700 stroke-[2.5]" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-600 transition-colors opacity-70" />
                          )}
                        </span>
                      </div>
                    </th>

                    {/* 8. Assigned By (Sortable Header) - Disappears in 'allocated' scope for non-intern */}
                    {showAssignedByColumn && (
                      <th
                        onClick={() => handleSort('assigned_by')}
                        className={`py-3.5 px-4 select-none cursor-pointer group transition-colors min-w-[150px] ${
                          sortBy === 'assigned_by'
                            ? 'bg-brand-50/90 text-brand-900 border-b-2 border-brand-600 font-extrabold'
                            : 'hover:bg-slate-100/90 hover:text-slate-900'
                        }`}
                        title={`Click to sort Assigned By ${sortBy === 'assigned_by' && sortOrder === 'asc' ? 'Descending' : 'Ascending'}`}
                      >
                        <div className="flex items-center space-x-1.5">
                          <span>Assigned By</span>
                          <span className="inline-flex items-center shrink-0">
                            {sortBy === 'assigned_by' ? (
                              sortOrder === 'asc' ? (
                                <ArrowUp className="w-3.5 h-3.5 text-brand-700 stroke-[2.5]" />
                              ) : (
                                <ArrowDown className="w-3.5 h-3.5 text-brand-700 stroke-[2.5]" />
                              )
                            ) : (
                              <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-600 transition-colors opacity-70" />
                            )}
                          </span>
                        </div>
                      </th>
                    )}

                    {/* 9. Action (NOT Sortable - "except the Action") */}
                    <th className="py-3.5 px-4 text-right text-slate-500 font-bold uppercase tracking-wider select-none">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 text-xs">
                  {sortedTabularItems.length === 0 ? (
                    <tr>
                      <td colSpan={showAssignedByColumn ? 9 : 8} className="py-12 text-center text-slate-400">
                        {isHRRole && tabularTaskScope === 'successors' ? (
                          <div className="space-y-1.5 py-4">
                            <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto border border-purple-100">
                              <Users className="w-4 h-4" />
                            </div>
                            <p className="font-bold text-slate-700">Successors &amp; Reporting Subordinate: {successorsCount}</p>
                            <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                              While logged in on credentials <strong>hr@ingage.com</strong>, the successor count does not align with all tasks. It aligns strictly with <strong>(super_admin → hr)</strong> or <strong>(super_admin → hr → hr_intern)</strong>. {successorsCount === 0 ? 'No successor tasks exist.' : 'Displaying tasks assigned to HR successors.'}
                            </p>
                          </div>
                        ) : (
                          'No tasks found matching current filters.'
                        )}
                      </td>
                    </tr>
                  ) : (
                    sortedTabularItems.map((task) => (
                      <tr
                        key={task.display_row_key || task.id}
                        onClick={() => {
                          setSelectedTask(task);
                          setIsDetailModalOpen(true);
                        }}
                        className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                      >
                        {/* Task ID Column */}
                        <td className={`py-3.5 px-4 ${
                          sortBy === 'id' ? 'bg-brand-50/40 text-brand-900 font-bold' : 'text-slate-600'
                        }`}>
                          <span className="font-mono font-semibold">#{task.id}</span>
                        </td>

                        {/* Title & Description - Clicking title presents task details, clicking number button shows who the task has been assigned to */}
                        <td className={`py-3.5 px-4 max-w-xs ${sortBy === 'title' ? 'bg-brand-50/30' : ''}`}>
                          <div className="flex items-center space-x-1.5 flex-wrap">
                            <span
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTask(task);
                                setIsDetailModalOpen(true);
                              }}
                              className="font-bold text-slate-900 hover:text-brand-700 hover:underline transition-colors truncate cursor-pointer max-w-[200px]"
                              title={task.title}
                            >
                              {task.title}
                            </span>

                            {/* If the task is assigned to more than 1 person, show the number button.
                                Clicking the button shows who the task has been assigned to. */}
                            {task.task_assignees && task.task_assignees.length > 1 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenGroupPopup(task, task.task_assignees);
                                }}
                                className="shrink-0 inline-flex items-center space-x-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 hover:bg-purple-200 text-purple-800 border border-purple-300 transition-colors cursor-pointer shadow-2xs"
                                title={`Assigned to ${task.task_assignees.length} persons. Click to view assigned members.`}
                              >
                                <Users className="w-2.5 h-2.5 mr-0.5 text-purple-600" />
                                <span>{task.task_assignees.length}</span>
                              </button>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">
                            {task.description || 'No description provided'}
                          </p>
                        </td>

                        {/* Allocated Project */}
                        <td className={`py-3.5 px-4 ${sortBy === 'project' ? 'bg-brand-50/30' : ''}`}>
                          <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-50 border border-slate-200 text-slate-800">
                            <Building className="w-3.5 h-3.5 text-brand-600 shrink-0" />
                            <span className="truncate max-w-[140px]">{task.project_name || 'Edutech LMS'}</span>
                          </span>
                        </td>

                        {/* Allocated Assignees / Team Members */}
                        <td className={`py-3.5 px-4 ${sortBy === 'assignee' ? 'bg-brand-50/30' : ''}`}>
                          {(() => {
                            // Present the person who was actually allocated, irrespective of all roles
                            const activeMember = task.single_assignee || (task.task_assignees && task.task_assignees[0]);
                            const isAllTasksPressed = tabularTaskScope === 'successors';
                            const hasMultiple = task.task_assignees && task.task_assignees.length > 1;

                            if (!activeMember) {
                              return <span className="text-slate-400 italic text-[11px]">Unassigned</span>;
                            }

                            const memberRole = (activeMember.role || '').toLowerCase();
                            const canHaveSuccessor = !isIntern && (
                              (isSuperAdminUser && memberRole === 'admin') ||
                              (isAdminUser && memberRole === 'team_lead')
                            );
                            const successorLabel = memberRole === 'admin' ? 'Team Lead' : 'Intern';

                            return (
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center space-x-2 min-w-0">
                                  {activeMember.avatar || activeMember.photo ? (
                                    <img
                                      src={activeMember.avatar || activeMember.photo}
                                      alt={activeMember.full_name}
                                      className="w-6 h-6 rounded-full object-cover ring-1 ring-slate-200 shrink-0"
                                    />
                                  ) : (
                                    <div className="w-6 h-6 rounded-full bg-brand-100 text-brand-800 text-[10px] font-bold flex items-center justify-center shrink-0">
                                      {activeMember.full_name?.charAt(0) || 'U'}
                                    </div>
                                  )}
                                  <div className="min-w-0">
                                    <div className="flex items-center space-x-1.5">
                                      <span className="font-semibold text-slate-800 text-xs truncate block max-w-[120px]" title={activeMember.full_name}>
                                        {activeMember.full_name}
                                      </span>
                                      {/* In pressed mode ("All Tasks"), if group, also show +N more pill */}
                                      {isAllTasksPressed && hasMultiple && (
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleOpenGroupPopup(task, task.task_assignees);
                                          }}
                                          className="inline-flex items-center space-x-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 transition-colors cursor-pointer shadow-2xs shrink-0"
                                          title={`Group Task: ${task.task_assignees.length} members. Click to view all.`}
                                        >
                                          <Users className="w-2.5 h-2.5" />
                                          <span>+{task.task_assignees.length - 1} more</span>
                                        </button>
                                      )}
                                    </div>
                                    <span className="text-[10px] text-slate-400 truncate block max-w-[130px]">
                                      {activeMember.designation_name || activeMember.designation || (activeMember.role ? activeMember.role.replace('_', ' ').toUpperCase() : 'Member')}
                                    </span>
                                  </div>
                                </div>

                                {canHaveSuccessor && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleOpenSuccessorPopup(activeMember, task);
                                    }}
                                    className="shrink-0 text-[10px] font-bold text-brand-700 bg-brand-50 hover:bg-brand-100 px-2 py-0.5 rounded-lg border border-brand-200 transition-colors cursor-pointer flex items-center space-x-1 shadow-2xs"
                                    title={`View 1st Following Successor (${successorLabel})`}
                                  >
                                    <span>+{successorLabel}</span>
                                  </button>
                                )}
                              </div>
                            );
                          })()}
                        </td>

                        {/* Status */}
                        <td className={`py-3.5 px-4 ${sortBy === 'status' ? 'bg-brand-50/30' : ''}`}>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${getStatusBadge(task.status)}`}>
                            {task.status}
                          </span>
                        </td>

                        {/* Priority */}
                        <td className={`py-3.5 px-4 ${sortBy === 'priority' ? 'bg-brand-50/30' : ''}`}>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${getPriorityBadge(task.priority)}`}>
                            {task.priority}
                          </span>
                        </td>

                        {/* Due Date */}
                        <td className={`py-3.5 px-4 text-slate-600 ${sortBy === 'due_date' ? 'bg-brand-50/30' : ''}`}>
                          <span className={task.status === 'Overdue' ? 'text-rose-600 font-bold' : ''}>
                            {task.due_date ? new Date(task.due_date).toLocaleDateString() : 'N/A'}
                          </span>
                        </td>

                        {/* Assigned By */}
                        {showAssignedByColumn && (
                          <td className={`py-3.5 px-4 ${sortBy === 'assigned_by' ? 'bg-brand-50/30' : ''}`}>
                            <div className="flex items-center space-x-2">
                              {task.assigned_by_avatar ? (
                                <img
                                  src={task.assigned_by_avatar}
                                  alt={task.assigned_by_name || 'Assigner'}
                                  className="w-6 h-6 rounded-full object-cover ring-1 ring-slate-200 shrink-0"
                                />
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold flex items-center justify-center shrink-0">
                                  {(task.assigned_by_name || 'M').charAt(0)}
                                </div>
                              )}
                              <div className="min-w-0">
                                <span className="font-semibold text-slate-800 text-xs truncate block max-w-[140px]">
                                  {task.assigned_by_name || 'Designated Manager'}
                                </span>
                                {task.assigned_by_designation && (
                                  <span className="text-[10px] text-slate-400 truncate block max-w-[140px]">
                                    {task.assigned_by_designation}
                                  </span>
                                )}
                              </div>
                            </div>
                          </td>
                        )}

                        {/* Action Column (Plain view button) */}
                        <td className="py-3.5 px-4 text-right">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTask(task);
                              setIsDetailModalOpen(true);
                            }}
                            className="px-2.5 py-1 text-xs font-semibold text-brand-600 hover:text-brand-800 hover:bg-brand-50 rounded-lg transition-colors border border-brand-200 inline-flex items-center space-x-1 cursor-pointer"
                          >
                            <Eye className="w-3 h-3" />
                            <span>View</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* ================= PAGINATION FORMAT ================= */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs">
              {/* Left: Showing count */}
              <div className="text-slate-500">
                Showing{' '}
                <span className="font-semibold text-slate-800">
                  {totalTabularRows === 0 ? 0 : (currentPage - 1) * pageSize + 1}
                </span>{' '}
                to{' '}
                <span className="font-semibold text-slate-800">
                  {Math.min(currentPage * pageSize, totalTabularRows)}
                </span>{' '}
                of <span className="font-semibold text-slate-800">{totalTabularRows}</span> {totalTabularRows === 1 ? 'task' : 'tasks'}
              </div>

              {/* Right: Controls & Page buttons */}
              <div className="flex items-center space-x-4">
                {/* Page Size Selector */}
                <div className="flex items-center space-x-1.5">
                  <span className="text-slate-500">Rows per page:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(parseInt(e.target.value));
                      setCurrentPage(1);
                    }}
                    className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-1 focus:ring-brand-500 cursor-pointer"
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={20}>20</option>
                  </select>
                </div>

                {/* Page Navigation */}
                <div className="flex items-center space-x-1">
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    title="Previous Page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>

                  {/* Page Numbers */}
                  {Array.from({ length: totalTabularPages }, (_, i) => i + 1).map((pageNum) => (
                    <button
                      key={pageNum}
                      onClick={() => setCurrentPage(pageNum)}
                      className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
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
                    disabled={currentPage >= totalTabularPages}
                    onClick={() => setCurrentPage(prev => Math.min(totalTabularPages, prev + 1))}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    title="Next Page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= MODE 3: PROJECT ANALYSIS MODE (Tabular with Pagination) ================= */}
      {viewMode === 'project_analysis' && !isIntern && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden animate-in fade-in duration-150">
          {/* Table Header Banner with Filter and Sorting Controls outside the table */}
          <div className="px-6 py-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/50" ref={analysisOutsideFilterRef}>
            <div className="flex items-center space-x-2">
              <BarChart3 className="w-4 h-4 text-brand-600" />
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wide">
                Project Analysis Summary
              </h2>
              <span className="text-xs text-slate-400">|</span>
              <span className="text-xs text-slate-500">
                {processedAnalysisProjects.length} of {analysisData.length} projects shown
              </span>
            </div>

            {/* Table Header Controls (Outside of table): Department Filter & Completion Filter Pop-up Buttons */}
            <div className="flex flex-wrap items-center gap-2.5 text-xs">
              {/* Department Pop-up Filter Button */}
              <div className="relative inline-flex items-center">
                <button
                  type="button"
                  onClick={() => setActiveOutsideFilter(activeOutsideFilter === 'department' ? null : 'department')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center space-x-1.5 transition-colors cursor-pointer ${
                    analysisDepartmentFilter !== 'All'
                      ? 'bg-brand-600 text-white border-brand-600 shadow-2xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                  title="Filter projects by Department"
                >
                  <Filter className={`w-3 h-3 ${analysisDepartmentFilter !== 'All' ? 'text-white' : 'text-slate-400'}`} />
                  <span>Department: <strong className="font-bold">{analysisDepartmentFilter === 'All' ? 'All' : analysisDepartmentFilter}</strong></span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${activeOutsideFilter === 'department' ? 'rotate-180' : ''}`} />
                </button>

                {/* Department Pop-up Window (Outside of Table) */}
                {activeOutsideFilter === 'department' && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute left-0 top-10 w-48 bg-white rounded-xl shadow-xl border border-slate-200 p-2 z-50 font-normal text-xs normal-case animate-in fade-in zoom-in-95 duration-100"
                  >
                    <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-100 font-bold text-slate-800 text-[11px]">
                      <span className="flex items-center gap-1.5">
                        <Filter className="w-3 h-3 text-brand-600" />
                        Filter Department
                      </span>
                      <button
                        type="button"
                        onClick={() => setActiveOutsideFilter(null)}
                        className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      <button
                        type="button"
                        onClick={() => {
                          setAnalysisDepartmentFilter('All');
                          setAnalysisCurrentPage(1);
                          setActiveOutsideFilter(null);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between text-xs cursor-pointer transition-colors ${
                          analysisDepartmentFilter === 'All' ? 'bg-brand-50 text-brand-800 font-bold' : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <span>All Departments</span>
                        {analysisDepartmentFilter === 'All' && <Check className="w-3.5 h-3.5 text-brand-600" />}
                      </button>
                      {analysisDepartments.map((dept) => (
                        <button
                          key={dept}
                          type="button"
                          onClick={() => {
                            setAnalysisDepartmentFilter(dept);
                            setAnalysisCurrentPage(1);
                            setActiveOutsideFilter(null);
                          }}
                          className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between text-xs cursor-pointer transition-colors ${
                            analysisDepartmentFilter === dept ? 'bg-brand-50 text-brand-800 font-bold' : 'hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <span>{dept}</span>
                          {analysisDepartmentFilter === dept && <Check className="w-3.5 h-3.5 text-brand-600 shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Status / Completion Pop-up Filter Button */}
              <div className="relative inline-flex items-center">
                <button
                  type="button"
                  onClick={() => setActiveOutsideFilter(activeOutsideFilter === 'analysis_status' ? null : 'analysis_status')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center space-x-1.5 transition-colors cursor-pointer ${
                    analysisStatusFilter !== 'All'
                      ? 'bg-brand-600 text-white border-brand-600 shadow-2xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                  title="Filter projects by Completion Status"
                >
                  <Filter className={`w-3 h-3 ${analysisStatusFilter !== 'All' ? 'text-white' : 'text-slate-400'}`} />
                  <span>Status: <strong className="font-bold">{analysisStatusFilter === 'All' ? 'All' : (analysisStatusFilter === 'overdue' ? 'Has Overdue' : 'On Schedule')}</strong></span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${activeOutsideFilter === 'analysis_status' ? 'rotate-180' : ''}`} />
                </button>

                {/* Status Pop-up Window (Outside of Table) */}
                {activeOutsideFilter === 'analysis_status' && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-0 top-10 w-48 bg-white rounded-xl shadow-xl border border-slate-200 p-2 z-50 font-normal text-xs normal-case text-left animate-in fade-in zoom-in-95 duration-100"
                  >
                    <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-100 font-bold text-slate-800 text-[11px]">
                      <span className="flex items-center gap-1.5">
                        <Filter className="w-3 h-3 text-brand-600" />
                        Completion Status
                      </span>
                      <button
                        type="button"
                        onClick={() => setActiveOutsideFilter(null)}
                        className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="space-y-1">
                      <button
                        type="button"
                        onClick={() => {
                          setAnalysisStatusFilter('All');
                          setAnalysisCurrentPage(1);
                          setActiveOutsideFilter(null);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between text-xs cursor-pointer transition-colors ${
                          analysisStatusFilter === 'All' ? 'bg-brand-50 text-brand-800 font-bold' : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <span>All Statuses</span>
                        {analysisStatusFilter === 'All' && <Check className="w-3.5 h-3.5 text-brand-600" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAnalysisStatusFilter('overdue');
                          setAnalysisCurrentPage(1);
                          setActiveOutsideFilter(null);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between text-xs cursor-pointer transition-colors ${
                          analysisStatusFilter === 'overdue' ? 'bg-rose-50 text-rose-700 font-bold' : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <span className="flex items-center gap-1.5 text-rose-600">
                          <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                          Has Overdue (Red)
                        </span>
                        {analysisStatusFilter === 'overdue' && <Check className="w-3.5 h-3.5 text-rose-600" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setAnalysisStatusFilter('on_schedule');
                          setAnalysisCurrentPage(1);
                          setActiveOutsideFilter(null);
                        }}
                        className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center justify-between text-xs cursor-pointer transition-colors ${
                          analysisStatusFilter === 'on_schedule' ? 'bg-emerald-50 text-emerald-800 font-bold' : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <span className="flex items-center gap-1.5 text-emerald-700">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          On Schedule
                        </span>
                        {analysisStatusFilter === 'on_schedule' && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Reset / Clear Active Filters Button */}
              {(analysisDepartmentFilter !== 'All' || analysisStatusFilter !== 'All' || searchTerm.trim()) && (
                <button
                  type="button"
                  onClick={() => {
                    setAnalysisDepartmentFilter('All');
                    setAnalysisStatusFilter('All');
                    setSearchTerm('');
                    setAnalysisCurrentPage(1);
                  }}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 flex items-center space-x-1 transition-colors cursor-pointer"
                  title="Clear all active filters"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset</span>
                </button>
              )}
            </div>
          </div>

          {/* Tabular Content */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-600 border-b border-slate-200">
                  {/* 1. Project ID no (Sortable) */}
                  <th scope="col" className="py-3.5 px-4 select-none">
                    <button
                      type="button"
                      onClick={() => handleAnalysisSort('id')}
                      className="flex items-center space-x-1.5 hover:text-brand-700 transition-colors group cursor-pointer"
                      title="Click to sort by Project ID"
                    >
                      <span>1. Project ID no</span>
                      <span className="inline-flex items-center shrink-0">
                        {analysisSortBy === 'id' ? (
                          analysisSortOrder === 'asc' ? (
                            <ArrowUp className="w-3.5 h-3.5 text-brand-700 stroke-[2.5]" />
                          ) : (
                            <ArrowDown className="w-3.5 h-3.5 text-brand-700 stroke-[2.5]" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-600 transition-colors opacity-70" />
                        )}
                      </span>
                    </button>
                  </th>

                  {/* 2. Project Name (Sortable) */}
                  <th scope="col" className="py-3.5 px-4 select-none">
                    <button
                      type="button"
                      onClick={() => handleAnalysisSort('name')}
                      className="flex items-center space-x-1.5 hover:text-brand-700 transition-colors group cursor-pointer"
                      title="Click to sort by Project Name"
                    >
                      <span>2. Project Name</span>
                      <span className="inline-flex items-center shrink-0">
                        {analysisSortBy === 'name' ? (
                          analysisSortOrder === 'asc' ? (
                            <ArrowUp className="w-3.5 h-3.5 text-brand-700 stroke-[2.5]" />
                          ) : (
                            <ArrowDown className="w-3.5 h-3.5 text-brand-700 stroke-[2.5]" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-600 transition-colors opacity-70" />
                        )}
                      </span>
                    </button>
                  </th>

                  {/* 3. Department (Beside Project Name - Sortable) */}
                  <th scope="col" className="py-3.5 px-4 select-none">
                    <button
                      type="button"
                      onClick={() => handleAnalysisSort('department')}
                      className="flex items-center space-x-1.5 hover:text-brand-700 transition-colors group cursor-pointer"
                      title="Click to sort by Department"
                    >
                      <span>3. Department</span>
                      <span className="inline-flex items-center shrink-0">
                        {analysisSortBy === 'department' ? (
                          analysisSortOrder === 'asc' ? (
                            <ArrowUp className="w-3.5 h-3.5 text-brand-700 stroke-[2.5]" />
                          ) : (
                            <ArrowDown className="w-3.5 h-3.5 text-brand-700 stroke-[2.5]" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-600 transition-colors opacity-70" />
                        )}
                      </span>
                    </button>
                  </th>

                  {/* 4. Total Task Count (Sortable) */}
                  <th scope="col" className="py-3.5 px-4 text-center select-none">
                    <button
                      type="button"
                      onClick={() => handleAnalysisSort('total_task_count')}
                      className="inline-flex items-center space-x-1.5 hover:text-brand-700 transition-colors group cursor-pointer"
                      title="Click to sort by Total Task Count"
                    >
                      <span>4. Total Task Count</span>
                      <span className="inline-flex items-center shrink-0">
                        {analysisSortBy === 'total_task_count' ? (
                          analysisSortOrder === 'asc' ? (
                            <ArrowUp className="w-3.5 h-3.5 text-brand-700 stroke-[2.5]" />
                          ) : (
                            <ArrowDown className="w-3.5 h-3.5 text-brand-700 stroke-[2.5]" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-600 transition-colors opacity-70" />
                        )}
                      </span>
                    </button>
                  </th>

                  {/* 5. Completion Count (Sortable) */}
                  <th scope="col" className="py-3.5 px-4 text-center select-none">
                    <button
                      type="button"
                      onClick={() => handleAnalysisSort('completion_percentage')}
                      className="inline-flex items-center space-x-1.5 hover:text-brand-700 transition-colors group cursor-pointer"
                      title="Click to sort by Completion Percentage"
                    >
                      <span>5. Completion Count</span>
                      <span className="inline-flex items-center shrink-0">
                        {analysisSortBy === 'completion_percentage' ? (
                          analysisSortOrder === 'asc' ? (
                            <ArrowUp className="w-3.5 h-3.5 text-brand-700 stroke-[2.5]" />
                          ) : (
                            <ArrowDown className="w-3.5 h-3.5 text-brand-700 stroke-[2.5]" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-300 group-hover:text-slate-600 transition-colors opacity-70" />
                        )}
                      </span>
                    </button>
                  </th>

                  {/* 6. Action */}
                  <th scope="col" className="py-3.5 px-4 text-center select-none">
                    6. Action
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {analysisLoading ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-500">
                      <div className="flex items-center justify-center space-x-2">
                        <RefreshCw className="w-4 h-4 animate-spin text-brand-600" />
                        <span>Loading project analysis data...</span>
                      </div>
                    </td>
                  </tr>
                ) : paginatedAnalysisProjects.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      No project analysis records found matching your filters.
                    </td>
                  </tr>
                ) : (
                  paginatedAnalysisProjects.map((proj) => {
                    const isProjOverdue = proj.has_overdue || (proj.overdue_task_count > 0);
                    return (
                      <tr 
                        key={proj.id} 
                        className="hover:bg-slate-50/80 transition-colors group"
                      >
                        {/* 1. Project ID no */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center space-x-2">
                            <span className="font-mono font-bold text-xs px-2.5 py-1 rounded-md bg-slate-100 text-slate-800 border border-slate-200 group-hover:border-brand-300 transition-colors">
                              {proj.project_code || `PRJ-${String(proj.id).padStart(2, '0')}`}
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono">
                              #{proj.id}
                            </span>
                          </div>
                        </td>

                        {/* 2. Project Name */}
                        <td className="py-3.5 px-4">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-900 text-xs hover:text-brand-700 transition-colors">
                              {proj.name}
                            </span>
                            <span className="text-[11px] text-slate-400 mt-0.5">
                              Client: {proj.client_name || 'Internal'} • {proj.team_members?.length || 0} team members
                            </span>
                          </div>
                        </td>

                        {/* 3. Department (Beside Project Name) */}
                        <td className="py-3.5 px-4">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                            {proj.department || 'General'}
                          </span>
                        </td>

                        {/* 4. Total Task Count on the corresponding Project */}
                        <td className="py-3.5 px-4 text-center">
                          <span className="inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-800 border border-slate-200">
                            {proj.total_task_count} {proj.total_task_count === 1 ? 'Task' : 'Tasks'}
                          </span>
                        </td>

                        {/* 5. Completion Count on the Corresponding Project */}
                        {/* [The calculation should be "completed task count" divide by total count of the project multiple by 100, if any one of the task is overdue, it should present in red colour] */}
                        <td className="py-3.5 px-4 text-center">
                          <div className="inline-flex flex-col items-center">
                            <span 
                              className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold border transition-colors ${
                                isProjOverdue
                                  ? 'bg-rose-50 text-rose-600 border-rose-200 shadow-2xs'
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              }`}
                              title={isProjOverdue ? `Overdue Alert: ${proj.overdue_task_count} task(s) overdue` : 'All tasks on schedule'}
                            >
                              {isProjOverdue ? (
                                <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                              ) : (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              )}
                              <span>{proj.completion_percentage}%</span>
                              <span className="font-normal text-[11px] opacity-80">
                                ({proj.completed_task_count}/{proj.total_task_count})
                              </span>
                            </span>

                            {isProjOverdue && (
                              <span className="text-[10px] font-bold text-rose-600 mt-1 flex items-center space-x-0.5">
                                <span>{proj.overdue_task_count} overdue task</span>
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 6. Action */}
                        <td className="py-3.5 px-4 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedAnalysisProject(proj);
                              setIsAnalysisModalOpen(true);
                            }}
                            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 font-semibold text-xs shadow-2xs transition-all cursor-pointer hover:scale-102"
                            title="Open Project Analysis Pop-up"
                          >
                            <BarChart3 className="w-3.5 h-3.5 text-brand-600" />
                            <span>Action</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="p-4 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50/50">
            <div className="text-xs text-slate-500">
              Showing{' '}
              <span className="font-bold text-slate-700">
                {processedAnalysisProjects.length === 0 ? 0 : (analysisCurrentPage - 1) * analysisPageSize + 1}
              </span>{' '}
              to{' '}
              <span className="font-bold text-slate-700">
                {Math.min(processedAnalysisProjects.length, analysisCurrentPage * analysisPageSize)}
              </span>{' '}
              of{' '}
              <span className="font-bold text-slate-700">{processedAnalysisProjects.length}</span> projects
            </div>

            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <span className="text-xs text-slate-500">Per page:</span>
                <select
                  value={analysisPageSize}
                  onChange={(e) => {
                    setAnalysisPageSize(Number(e.target.value));
                    setAnalysisCurrentPage(1);
                  }}
                  className="px-2 py-1 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-1 focus:ring-brand-500 cursor-pointer"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                </select>
              </div>

              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  disabled={analysisCurrentPage <= 1}
                  onClick={() => setAnalysisCurrentPage(prev => Math.max(1, prev - 1))}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  title="Previous Page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                {Array.from({ length: analysisTotalPages }, (_, i) => i + 1).map((pageNum) => (
                  <button
                    key={pageNum}
                    onClick={() => setAnalysisCurrentPage(pageNum)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      analysisCurrentPage === pageNum
                        ? 'bg-brand-600 text-white'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {pageNum}
                  </button>
                ))}

                <button
                  type="button"
                  disabled={analysisCurrentPage >= analysisTotalPages}
                  onClick={() => setAnalysisCurrentPage(prev => Math.min(analysisTotalPages, prev + 1))}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  title="Next Page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Task Creation Modal */}
      <TaskModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onTaskCreated={() => {
          if (viewMode === 'board') fetchBoardTasks();
          else if (viewMode === 'tabular') fetchTabularTasks();
          else fetchAnalysisData();
        }}
      />

      {/* Task Details / Status Update Modal */}
      <TaskDetailModal
        task={selectedTask}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        onTaskUpdated={() => {
          if (viewMode === 'board') fetchBoardTasks();
          else if (viewMode === 'tabular') fetchTabularTasks();
          else fetchAnalysisData();
        }}
      />

      {/* Project Analysis Pop-up Modal (Action) */}
      <ProjectAnalysisModal
        project={selectedAnalysisProject}
        isOpen={isAnalysisModalOpen}
        onClose={() => setIsAnalysisModalOpen(false)}
        userRole={userRole}
      />

      {/* Corresponding Team Members Modal */}
      {isMembersModalOpen && selectedMembersTask && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          onClick={() => {
            setIsMembersModalOpen(false);
            setSelectedMembersTask(null);
          }}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
              <div className="flex items-center space-x-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center shrink-0 border border-brand-200 shadow-2xs">
                  <Users className="w-4 h-4 text-brand-600" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="text-[11px] font-mono font-bold text-brand-800 bg-brand-50 px-2 py-0.5 rounded border border-brand-200">
                      #{selectedMembersTask.id}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getPriorityBadge(selectedMembersTask.priority)}`}>
                      {selectedMembersTask.priority}
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${getStatusBadge(selectedMembersTask.status)}`}>
                      {selectedMembersTask.status}
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 mt-1 truncate" title={selectedMembersTask.title}>
                    {selectedMembersTask.title}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsMembersModalOpen(false);
                  setSelectedMembersTask(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer shrink-0 ml-2"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Project & Assignee Context Strip */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs pb-3 border-b border-slate-100">
                <div className="flex items-center space-x-1.5 text-slate-600">
                  <Building className="w-3.5 h-3.5 text-brand-600 shrink-0" />
                  <span className="font-semibold text-slate-800">
                    {selectedMembersTask.project_name || 'Edutech LMS'}
                  </span>
                </div>
                <div className="flex items-center space-x-2 text-[11px] text-slate-500">
                  <span className="font-semibold text-slate-700">
                    {isSuperAdminUser ? '1st Successor:' : 'Team Members:'}
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-brand-100 text-brand-800 font-bold">
                    {getRoleFilteredTaskMembers(selectedMembersTask).length}
                  </span>
                </div>
              </div>

              {/* Task Brief Description */}
              {selectedMembersTask.description && (
                <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/70 text-xs text-slate-600 leading-relaxed">
                  <span className="font-bold text-slate-700 block mb-0.5">Task Description:</span>
                  <p>{selectedMembersTask.description}</p>
                </div>
              )}

              {/* Members List Heading */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 flex items-center justify-between">
                  <span>{isSuperAdminUser ? 'Team Members (1st Successor)' : 'Team Members'}</span>
                  <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-brand-50 text-brand-800 border border-brand-200">
                    {isSuperAdminUser
                      ? 'Showing only 1st Successor (Admin)'
                      : isAdminUser
                      ? 'Showing only Team Lead'
                      : 'Showing only Intern'}
                  </span>
                </h4>

                {/* Explanatory Banner */}
                <div className="mb-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600 flex items-center space-x-2">
                  <Sparkles className="w-4 h-4 text-brand-600 shrink-0" />
                  <span>
                    {isSuperAdminUser
                      ? 'Superadmin view: Showing only 1st Successor (Admin) on team members. Press 1st Successor below to popup following successor (Team Lead).'
                      : isAdminUser
                      ? 'Admin view: Showing only Team Lead. Press Team Lead below to popup 1st following successor (Intern).'
                      : 'Team Lead view: Showing only Intern [Exclude the Intern from successors].'}
                  </span>
                </div>

                {/* Member Cards */}
                {(() => {
                  const roleMembers = getRoleFilteredTaskMembers(selectedMembersTask);
                  return roleMembers && roleMembers.length > 0 ? (
                    <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden bg-white shadow-2xs">
                      {roleMembers.map((member, idx) => (
                        <div
                          key={member.id || idx}
                          onClick={() => {
                            if (isSuperAdminUser || isAdminUser) {
                              handleOpenSuccessorPopup(member, selectedMembersTask);
                            }
                          }}
                          className={`p-4 transition-colors ${
                            isSuperAdminUser || isAdminUser
                              ? 'hover:bg-brand-50/30 cursor-pointer group/member'
                              : 'hover:bg-slate-50/80'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center space-x-3 min-w-0">
                              {/* Member Avatar with On Duty Indicator */}
                              <div className="relative shrink-0">
                                {member.avatar || member.photo ? (
                                  <img
                                    src={member.avatar || member.photo}
                                    alt={member.full_name}
                                    className="w-10 h-10 rounded-xl object-cover border border-slate-200 shadow-2xs"
                                  />
                                ) : (
                                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-100 to-brand-200 border border-brand-300 text-brand-800 font-bold flex items-center justify-center text-sm shadow-2xs">
                                    {member.full_name?.charAt(0).toUpperCase() || 'U'}
                                  </div>
                                )}
                                <span
                                  className="absolute -bottom-1 -right-1 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full"
                                  title="On Duty"
                                />
                              </div>

                              {/* Name, Designation & Role */}
                              <div className="min-w-0">
                                <div className="flex items-center space-x-2">
                                  <h5 className="text-xs font-bold text-slate-900 truncate">
                                    {member.full_name}
                                  </h5>
                                  <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[10px] font-bold bg-brand-50 text-brand-700 border border-brand-200">
                                    {member.role ? member.role.replace('_', ' ').toUpperCase() : 'MEMBER'}
                                  </span>
                                </div>
                                <div className="flex items-center space-x-2 text-[11px] text-slate-500 mt-0.5">
                                  <span className="font-medium text-slate-600 truncate">
                                    {member.designation_name || member.designation || 'Task Member'}
                                  </span>
                                  {member.email && (
                                    <>
                                      <span className="text-slate-300">•</span>
                                      <span className="truncate text-slate-400">{member.email}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Status Badge */}
                            <div className="shrink-0 text-right">
                              {isSuperAdminUser ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 group-hover/member:bg-brand-600 group-hover/member:text-white transition-colors">
                                  ★ 1st Successor (Admin)
                                </span>
                              ) : isAdminUser ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 group-hover/member:bg-amber-600 group-hover/member:text-white transition-colors">
                                  Team Lead
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                  Intern
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Action Button for Successor Popup */}
                          {isSuperAdminUser && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenSuccessorPopup(member, selectedMembersTask);
                              }}
                              className="w-full mt-3 py-2 px-3 bg-gradient-to-r from-brand-600 to-brand-700 hover:from-brand-700 hover:to-brand-800 text-white text-xs font-semibold rounded-xl shadow-xs transition-all flex items-center justify-center space-x-1.5 cursor-pointer"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>Press 1st Successor (Admin) &rarr; Show 1st Following Successor (Team Lead)</span>
                            </button>
                          )}

                          {isAdminUser && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenSuccessorPopup(member, selectedMembersTask);
                              }}
                              className="w-full mt-3 py-2 px-3 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white text-xs font-semibold rounded-xl shadow-xs transition-all flex items-center justify-center space-x-1.5 cursor-pointer"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>Press Team Lead &rarr; Show 1st Following Successor (Intern)</span>
                            </button>
                          )}

                          {(!isSuperAdminUser && !isAdminUser) && (
                            <div className="mt-2 text-[10px] text-slate-400 italic">
                              [Exclude the Intern: Leaf Designation Level - No further successors]
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-8 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                      <User className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                      <p className="text-xs font-medium text-slate-500">
                        {isSuperAdminUser
                          ? 'No Admin members found for this task.'
                          : isAdminUser
                          ? 'No Team Lead members found for this task.'
                          : 'No Intern members found for this task.'}
                      </p>
                    </div>
                  );
                })()}
              </div>

              {/* Assignment Meta Details */}
              <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                {selectedMembersTask.assigned_by_name && (
                  <div>
                    <span>Allocated by: </span>
                    <strong className="text-slate-800 font-semibold">{selectedMembersTask.assigned_by_name}</strong>
                    {selectedMembersTask.assigned_by_designation && (
                      <span className="text-slate-400"> ({selectedMembersTask.assigned_by_designation})</span>
                    )}
                  </div>
                )}
                {selectedMembersTask.due_date && (
                  <div>
                    <span>Due: </span>
                    <strong className="text-slate-700 font-semibold">
                      {new Date(selectedMembersTask.due_date).toLocaleDateString()}
                    </strong>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  const currentTask = selectedMembersTask;
                  setIsMembersModalOpen(false);
                  setSelectedMembersTask(null);
                  setSelectedTask(currentTask);
                  setIsDetailModalOpen(true);
                }}
                className="text-xs font-semibold text-brand-600 hover:text-brand-800 hover:underline cursor-pointer flex items-center space-x-1"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>View Full Task Details</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsMembersModalOpen(false);
                  setSelectedMembersTask(null);
                }}
                className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 transition-colors cursor-pointer shadow-2xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1st Following Successor Popup Modal */}
      {isSuccessorPopupOpen && successorPopupData && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          onClick={() => {
            setIsSuccessorPopupOpen(false);
            setSuccessorPopupData(null);
          }}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Successor Popup Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-brand-50 to-slate-50">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-brand-600 text-white flex items-center justify-center font-bold shadow-xs">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    {successorPopupData.successorRoleTitle}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Direct subordinate reporting to <span className="font-semibold text-slate-800">{successorPopupData.parentMember?.full_name}</span>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsSuccessorPopupOpen(false);
                  setSuccessorPopupData(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer shrink-0 ml-2"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Successor Popup Body */}
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Parent Predecessor Context Strip */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between">
                <div className="flex items-center space-x-2.5 min-w-0">
                  {successorPopupData.parentMember?.avatar || successorPopupData.parentMember?.photo ? (
                    <img
                      src={successorPopupData.parentMember.avatar || successorPopupData.parentMember.photo}
                      alt={successorPopupData.parentMember.full_name}
                      className="w-8 h-8 rounded-lg object-cover ring-1 ring-slate-200"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-brand-100 text-brand-800 font-bold flex items-center justify-center text-xs">
                      {successorPopupData.parentMember?.full_name?.charAt(0) || 'U'}
                    </div>
                  )}
                  <div className="min-w-0">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                      Selected Member (Predecessor)
                    </span>
                    <span className="text-xs font-bold text-slate-800 truncate block">
                      {successorPopupData.parentMember?.full_name}
                    </span>
                  </div>
                </div>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-100 text-brand-800 border border-brand-200">
                  {successorPopupData.parentMember?.role?.replace('_', ' ').toUpperCase()}
                </span>
              </div>

              {/* Downward indicator */}
              <div className="flex items-center justify-center space-x-2 py-1 text-xs text-slate-400 font-medium">
                <ArrowDown className="w-4 h-4 text-brand-600 animate-bounce" />
                <span className="text-[11px] font-semibold text-brand-700 uppercase tracking-wider">
                  1st Following Successor In Hierarchy
                </span>
                <ArrowDown className="w-4 h-4 text-brand-600 animate-bounce" />
              </div>

              {/* Successor Cards List */}
              <div className="space-y-3">
                {successorPopupData.successors && successorPopupData.successors.length > 0 ? (
                  successorPopupData.successors.map((succ, sIdx) => (
                    <div
                      key={succ.id || sIdx}
                      className="p-4 rounded-xl border border-brand-200 bg-white hover:bg-brand-50/20 shadow-2xs transition-all space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3 min-w-0">
                          {succ.photo || succ.avatar ? (
                            <img
                              src={succ.photo || succ.avatar}
                              alt={succ.full_name}
                              className="w-11 h-11 rounded-xl object-cover ring-2 ring-brand-100 shadow-2xs"
                            />
                          ) : (
                            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-brand-600 to-brand-700 text-white font-bold flex items-center justify-center text-sm shadow-2xs">
                              {succ.full_name?.charAt(0) || 'U'}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center space-x-2">
                              <h4 className="text-sm font-bold text-slate-900 truncate">{succ.full_name}</h4>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                                {succ.role?.replace('_', ' ').toUpperCase()}
                              </span>
                            </div>
                            <p className="text-xs text-brand-700 font-semibold truncate mt-0.5">
                              {succ.designation_name || succ.designation || 'Successor Officer'}
                            </p>
                            <p className="text-[10px] font-mono text-slate-400 mt-0.5">
                              {succ.designation_number || `ING-000${succ.id}`}
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] font-bold bg-brand-50 text-brand-700 px-2 py-1 rounded-lg border border-brand-200 shrink-0">
                          ★ 1st Successor
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[11px] p-2.5 bg-slate-50/80 rounded-lg border border-slate-100 text-slate-600">
                        <div>
                          <span className="text-slate-400 block text-[10px]">Department</span>
                          <span className="font-semibold text-slate-800">{succ.department || 'Edutech'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Current Status</span>
                          <span className="font-semibold text-emerald-600">{succ.current_status || 'On Duty'}</span>
                        </div>
                        <div className="col-span-2 truncate">
                          <span className="text-slate-400 block text-[10px]">Email Address</span>
                          <span className="font-medium text-slate-700 truncate">{succ.email}</span>
                        </div>
                      </div>

                      {succ.role === 'intern' && (
                        <div className="text-[10px] text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200 flex items-center space-x-1">
                          <AlertCircle className="w-3 h-3 text-amber-600 shrink-0" />
                          <span>Leaf Designation Level [Exclude the Intern from further successors]</span>
                        </div>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="p-6 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    <User className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-slate-600">No direct 1st following successor found</p>
                  </div>
                )}
              </div>

              {/* Task Connection Info */}
              {successorPopupData.task && (
                <div className="p-3 bg-brand-50/50 rounded-xl border border-brand-100 text-xs text-brand-900 flex items-center justify-between">
                  <span className="font-medium truncate">
                    Task #{successorPopupData.task.id}: {successorPopupData.task.title}
                  </span>
                  <span className="font-bold text-[10px] bg-white px-2 py-0.5 rounded border border-brand-200 shrink-0 ml-2">
                    {successorPopupData.task.status}
                  </span>
                </div>
              )}
            </div>

            {/* Successor Popup Footer */}
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setIsSuccessorPopupOpen(false);
                  setSuccessorPopupData(null);
                }}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer shadow-xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= GROUP TASK ALLOCATED MEMBERS MODAL ================= */}
      {isGroupPopupOpen && groupPopupTask && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          onClick={() => {
            setIsGroupPopupOpen(false);
            setGroupPopupTask(null);
            setGroupPopupMembers([]);
          }}
        >
          <div
            className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-purple-50/70">
              <div className="flex items-center space-x-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0 border border-purple-200 shadow-2xs">
                  <Users className="w-4 h-4 text-purple-600" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="text-[11px] font-mono font-bold text-purple-900 bg-purple-100 px-2 py-0.5 rounded border border-purple-200">
                      Task #{groupPopupTask.id}
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                      Group Task ({groupPopupMembers.length} Members)
                    </span>
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 mt-1 truncate" title={groupPopupTask.title}>
                    {groupPopupTask.title}
                  </h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsGroupPopupOpen(false);
                  setGroupPopupTask(null);
                  setGroupPopupMembers([]);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer shrink-0 ml-2"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Explanatory Banner */}
              {/* <div className="p-3 bg-purple-50/60 rounded-xl border border-purple-100 text-xs text-purple-900 flex items-center justify-between">
                <div className="flex items-center space-x-2 min-w-0">
                  <Sparkles className="w-4 h-4 text-purple-600 shrink-0" />
                  <span className="font-semibold truncate">
                    Allocated persons in alphabetical ascending order (A → Z)
                  </span>
                </div>
                <span className="font-bold text-[11px] bg-purple-100 px-2 py-0.5 rounded-full text-purple-800 shrink-0 ml-2">
                  Total: {groupPopupMembers.length}
                </span>
              </div> */}

              {/* Members List */}
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden bg-white shadow-2xs">
                {groupPopupMembers.map((member, idx) => {
                  const isFirst = idx === 0;
                  const badge = getRoleBadge(member.role);
                  return (
                    <div
                      key={member.id || idx}
                      className={`p-3.5 transition-colors ${
                        isFirst ? 'bg-amber-50/30 hover:bg-amber-50/50' : 'hover:bg-slate-50/80'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center space-x-3 min-w-0">
                          {/* Order Index Badge */}
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                            isFirst ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-slate-100 text-slate-600 border border-slate-200'
                          }`}>
                            {idx + 1}
                          </div>

                          {/* Avatar */}
                          <div className="relative shrink-0">
                            {member.avatar || member.photo ? (
                              <img
                                src={member.avatar || member.photo}
                                alt={member.full_name}
                                className="w-9 h-9 rounded-xl object-cover border border-slate-200 shadow-2xs"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-xl bg-brand-100 text-brand-800 font-bold flex items-center justify-center text-xs shadow-2xs">
                                {member.full_name?.charAt(0) || 'U'}
                              </div>
                            )}
                            <span
                              className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 border-2 border-white rounded-full"
                              title="Active"
                            />
                          </div>

                          {/* Details */}
                          <div className="min-w-0">
                            <div className="flex items-center space-x-1.5 flex-wrap">
                              <h5 className="text-xs font-bold text-slate-900 truncate">
                                {member.full_name}
                              </h5>
                              {isFirst && (
                                <span className="text-[9px] font-bold bg-amber-100 text-amber-800 border border-amber-200 px-1.5 py-0.2 rounded">
                                  1st Ascending Person
                                </span>
                              )}
                              <span className={`text-[9px] font-semibold px-1.5 py-0.2 rounded border ${badge.color}`}>
                                {badge.label}
                              </span>
                            </div>
                            <div className="flex items-center space-x-2 text-[11px] text-slate-500 mt-0.5">
                              <span className="font-medium text-slate-600 truncate">
                                {member.designation_name || member.designation || 'Member'}
                              </span>
                              {member.designation_number && (
                                <>
                                  <span className="text-slate-300">•</span>
                                  <span className="font-mono text-slate-400 text-[10px]">{member.designation_number}</span>
                                </>
                              )}
                              {member.email && (
                                <>
                                  <span className="text-slate-300">•</span>
                                  <span className="truncate text-slate-400">{member.email}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Successor Drill-Down Action (for Super Admin / Admin) */}
                        {(isSuperAdminUser || isAdminUser) && (
                          <button
                            type="button"
                            onClick={() => {
                              handleOpenSuccessorPopup(member, groupPopupTask);
                            }}
                            className="text-[10px] font-bold text-brand-700 bg-brand-50 hover:bg-brand-100 px-2 py-1 rounded-lg border border-brand-200 transition-colors cursor-pointer shrink-0"
                            title={`View following successor for ${member.full_name}`}
                          >
                            <span>+{isSuperAdminUser ? 'Team Lead' : 'Intern'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Total Allocated: <strong>{groupPopupMembers.length} persons</strong>
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsGroupPopupOpen(false);
                  setGroupPopupTask(null);
                  setGroupPopupMembers([]);
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TasksPage;
