import axios from 'axios';

// In production (Vercel services), the /api rewrite routes to the backend service.
// In development, Vite proxy handles /api -> localhost:8000.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Intercept requests to add JWT token if available
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

// Intercept responses for auth errors
api.interceptors.response.use((response) => {
  return response;
}, (error) => {
  if (error.response && error.response.status === 401) {
    // Only redirect if not already on login page
    if (!window.location.pathname.includes('/login') && window.location.pathname !== '/') {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
  }
  return Promise.reject(error);
});

export const authApi = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  ssoLogin: (role_or_email) => api.post('/auth/sso-login', { role_or_email }),
  logout: () => api.post('/auth/logout'),
  getMe: () => api.get('/auth/me'),
  changePassword: (current_password, new_password) => api.post('/auth/change-password', { current_password, new_password }),
};

export const dashboardApi = {
  getStats: () => api.get('/dashboard/stats'),
};

export const tasksApi = {
  getTabular: (params) => api.get('/tasks', { params }),
  getBoard: (params) => api.get('/tasks/board', { params }),
  getById: (id) => api.get(`/tasks/${id}`),
  create: (data) => api.post('/tasks', data),
  update: (id, data) => api.put(`/tasks/${id}`, data),
  updateStatus: (id, data) => api.patch(`/tasks/${id}/status`, data),
  delete: (id) => api.delete(`/tasks/${id}`),
};

export const teamApi = {
  getHierarchy: () => api.get('/team/hierarchy'),
  getAssignees: () => api.get('/team/assignees'),
  createUser: (data) => api.post('/team/users', data),
  resetUserPassword: (userId, new_password, must_change_password = true) =>
    api.post(`/team/users/${userId}/reset-password`, { new_password, must_change_password }),
};

export const projectsApi = {
  getAll: () => api.get('/projects'),
  getAnalysis: () => api.get('/projects/analysis'),
  create: (data) => api.post('/projects', data),
};

export const settingsApi = {
  getProfile: () => api.get('/settings/profile'),
  updateProfile: (data) => api.put('/settings/profile', data),
};

export const notificationsApi = {
  getNotifications: (limit = 20) => api.get('/notifications', { params: { limit } }),
  markRead: (id) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.post('/notifications/read-all'),
};

export const internRecordsApi = {
  getAll: (params) => api.get('/intern-records', { params }),
  getById: (id) => api.get(`/intern-records/${id}`),
  create: (data) => api.post('/intern-records', data),
  update: (id, data) => api.put(`/intern-records/${id}`, data),
  delete: (id) => api.delete(`/intern-records/${id}`),
  generateSampleData: () => api.post('/intern-records/generate-sample'),
};

export const presenceApi = {
  checkService: () => api.post('/presence/service-check'),
};

export const chatApi = {
  getUsers: () => api.get('/chat/users'),
  getConversations: (filter = 'all') => api.get('/chat/conversations', { params: { filter_type: filter } }),
  createDirect: (recipientId) => api.post('/chat/conversations/direct', { recipient_id: recipientId }),
  createGroup: (data) => api.post('/chat/conversations/group', data),
  getMessages: (conversationId) => api.get(`/chat/conversations/${conversationId}/messages`),
  sendMessage: (conversationId, messageText) => api.post(`/chat/conversations/${conversationId}/messages`, { message_text: messageText }),
  leaveGroup: (conversationId) => api.post(`/chat/conversations/${conversationId}/leave`),
  addMembers: (conversationId, userIds) => api.post(`/chat/conversations/${conversationId}/members`, { user_ids: userIds }),
};

export const attendanceApi = {
  getToday: () => api.get('/attendance/today'),
  markAttendance: (action, notes) => api.post('/attendance/mark', { action, notes }),
  getMyAttendance: (page = 1, page_size = 10) => api.get('/attendance/my', { params: { page, page_size } }),
  getTeamAttendance: (date_str) => api.get('/attendance/team', { params: { date_str: date_str || undefined } }),
  toggleSaturday: (is_working) => api.post('/attendance/saturday-toggle', { is_working }),
};

export default api;

