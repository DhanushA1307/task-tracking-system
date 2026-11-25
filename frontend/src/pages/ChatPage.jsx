import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { chatApi } from '../api/client';
import {
  MessageSquare,
  Users,
  User,
  Plus,
  Search,
  Send,
  LogOut,
  UserPlus,
  Shield,
  GraduationCap,
  Briefcase,
  CheckCircle2,
  Clock,
  ChevronDown,
  X,
  Info,
  Sparkles,
  ArrowLeft,
  Circle
} from 'lucide-react';

const formatRoleBadge = (role) => {
  const r = (role || '').toLowerCase();
  switch (r) {
    case 'super_admin':
      return { label: 'Super Admin', bg: 'bg-purple-100 text-purple-700 border-purple-200', icon: Shield };
    case 'admin':
      return { label: 'Admin', bg: 'bg-blue-100 text-blue-700 border-blue-200', icon: Shield };
    case 'team_lead':
      return { label: 'Team Lead', bg: 'bg-amber-100 text-amber-700 border-amber-200', icon: Users };
    case 'hr':
    case 'human_resource_manager':
      return { label: 'HR Manager', bg: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: Shield };
    case 'intern':
    default:
      return { label: 'Intern', bg: 'bg-brand-100 text-brand-700 border-brand-200', icon: GraduationCap };
  }
};

const formatOrdinal = (n) => {
  if (!n) return '';
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

export const ChatPage = () => {
  const { user } = useAuth();

  // Conversations and active thread state
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [activeConv, setActiveConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);

  // Filter & search
  const [filterType, setFilterType] = useState('all'); // 'all', 'direct', 'group'
  const [searchQuery, setSearchQuery] = useState('');

  // Input & sending
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);

  // Modals
  const [showDirectModal, setShowDirectModal] = useState(false);
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  // Data for modals
  const [colleagues, setColleagues] = useState([]);
  const [loadingColleagues, setLoadingColleagues] = useState(false);
  const [colleagueSearch, setColleagueSearch] = useState('');
  const [groupTitle, setGroupTitle] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [selectedMemberIds, setSelectedMemberIds] = useState([]);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [leavingGroup, setLeavingGroup] = useState(false);

  // Auto-scroll ref
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // 1. Fetch conversations list (Reverse Chronological Format)
  const fetchConversations = async (silent = false) => {
    if (!silent) setLoadingConvs(true);
    try {
      const res = await chatApi.getConversations(filterType);
      setConversations(res.data || []);
      // If active conversation is selected, update its metadata
      if (activeConvId) {
        const found = (res.data || []).find((c) => c.id === activeConvId);
        if (found) setActiveConv(found);
      }
    } catch (err) {
      console.error('Failed to load conversations', err);
    } finally {
      if (!silent) setLoadingConvs(false);
    }
  };

  // 2. Fetch messages for the active conversation
  const fetchMessages = async (convId, silent = false) => {
    if (!convId) return;
    if (!silent) setLoadingMessages(true);
    try {
      const res = await chatApi.getMessages(convId);
      setMessages(res.data || []);
    } catch (err) {
      console.error('Failed to load messages', err);
    } finally {
      if (!silent) setLoadingMessages(false);
    }
  };

  // 3. Fetch colleagues directory for Direct Message & Group modals
  const fetchColleagues = async () => {
    setLoadingColleagues(true);
    try {
      const res = await chatApi.getUsers();
      setColleagues(res.data || []);
    } catch (err) {
      console.error('Failed to load colleagues', err);
    } finally {
      setLoadingColleagues(false);
    }
  };

  // Load conversations on mount & whenever filter changes
  useEffect(() => {
    fetchConversations();
  }, [filterType]);

  // Load messages whenever active conversation changes
  useEffect(() => {
    if (activeConvId) {
      fetchMessages(activeConvId);
      // Also update activeConv object
      const found = conversations.find((c) => c.id === activeConvId);
      if (found) setActiveConv(found);
    } else {
      setActiveConv(null);
      setMessages([]);
    }
  }, [activeConvId]);

  // Scroll to bottom when messages update
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Periodic polling for live chat updates (every 2.5 seconds)
  useEffect(() => {
    const timer = setInterval(() => {
      fetchConversations(true);
      if (activeConvId) {
        fetchMessages(activeConvId, true);
      }
    }, 2500);

    return () => clearInterval(timer);
  }, [activeConvId, filterType]);

  // Handle start Direct Message
  const handleStartDirect = async (recipientId) => {
    try {
      const res = await chatApi.createDirect(recipientId);
      setShowDirectModal(false);
      await fetchConversations();
      setActiveConvId(res.data.id);
      setActiveConv(res.data);
    } catch (err) {
      console.error('Failed to start direct conversation', err);
    }
  };

  // Handle Create Group
  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!groupTitle.trim()) return;
    setCreatingGroup(true);
    try {
      const res = await chatApi.createGroup({
        title: groupTitle.trim(),
        description: groupDesc.trim() || null,
        member_ids: selectedMemberIds,
      });
      setShowGroupModal(false);
      setGroupTitle('');
      setGroupDesc('');
      setSelectedMemberIds([]);
      await fetchConversations();
      setActiveConvId(res.data.id);
      setActiveConv(res.data);
    } catch (err) {
      console.error('Failed to create group', err);
    } finally {
      setCreatingGroup(false);
    }
  };

  // Handle Send Message
  const handleSendMessage = async (e) => {
    e?.preventDefault();
    if (!messageText.trim() || !activeConvId || sending) return;

    const textToSend = messageText.trim();
    setMessageText('');
    setSending(true);

    try {
      const res = await chatApi.sendMessage(activeConvId, textToSend);
      // Append immediately
      setMessages((prev) => [...prev, res.data]);
      // Update conversations list so active conversation floats to top (Reverse Chronological)
      fetchConversations(true);
    } catch (err) {
      console.error('Failed to send message', err);
      setMessageText(textToSend); // Restore if failed
    } finally {
      setSending(false);
    }
  };

  // Handle Leave Group ("whose need to leave")
  const handleLeaveGroup = async () => {
    if (!activeConvId) return;
    setLeavingGroup(true);
    try {
      await chatApi.leaveGroup(activeConvId);
      setShowLeaveConfirm(false);
      setShowMembersModal(false);
      setActiveConvId(null);
      setActiveConv(null);
      await fetchConversations();
    } catch (err) {
      console.error('Failed to leave group', err);
    } finally {
      setLeavingGroup(false);
    }
  };

  // Toggle member selection in Group Create Modal
  const toggleMemberSelection = (id) => {
    setSelectedMemberIds((prev) =>
      prev.includes(id) ? prev.filter((mId) => mId !== id) : [...prev, id]
    );
  };

  // Filter conversations by search query
  const filteredConversations = conversations.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const titleMatch = (c.title || '').toLowerCase().includes(q);
    const lastMsgMatch = (c.last_message_preview || '').toLowerCase().includes(q);
    const roleMatch = (c.other_user?.role || '').toLowerCase().includes(q);
    const desigMatch = (c.other_user?.designation || '').toLowerCase().includes(q);
    return titleMatch || lastMsgMatch || roleMatch || desigMatch;
  });

  // Filter colleagues in modals
  const filteredColleagues = colleagues.filter((c) => {
    if (!colleagueSearch) return true;
    const q = colleagueSearch.toLowerCase();
    return (
      (c.full_name || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.role || '').toLowerCase().includes(q) ||
      (c.designation || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="h-[calc(100vh-6.5rem)] flex bg-white rounded-2xl border border-slate-200/90 shadow-sm overflow-hidden">
      {/* ============================================================== */}
      {/* LEFT PANE: Conversations List (Reverse Chronological Format)    */}
      {/* ============================================================== */}
      <div
        className={`w-full md:w-88 lg:w-96 flex flex-col border-r border-slate-200 bg-slate-50/50 shrink-0 ${
          activeConvId ? 'hidden md:flex' : 'flex'
        }`}
      >
        {/* Top Header */}
        <div className="p-4 border-b border-slate-200 bg-white space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-lg bg-brand-600 text-white flex items-center justify-center shadow-xs">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900 leading-tight">Chat</h1>
                {/* <p className="text-[11px] text-slate-500">Reverse Chronological Flow</p> */}
              </div>
            </div>

            {/* New Message Action Buttons */}
            <div className="flex items-center space-x-1.5">
              <button
                type="button"
                onClick={() => {
                  fetchColleagues();
                  setShowDirectModal(true);
                }}
                className="px-2.5 py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-700 rounded-lg text-xs font-semibold flex items-center space-x-1 border border-brand-200 transition-all cursor-pointer shadow-2xs"
                title="Start 1-on-1 Direct Message"
              >
                <User className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Direct</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  fetchColleagues();
                  setShowGroupModal(true);
                }}
                className="px-2.5 py-1.5 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-xs font-semibold flex items-center space-x-1 transition-all cursor-pointer shadow-xs"
                title="Create a Group Chat"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Group</span>
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search conversations, colleagues..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter Tabs: All, Direct, Groups */}
          <div className="flex items-center p-1 bg-slate-100 rounded-lg text-xs font-medium text-slate-600">
            <button
              onClick={() => setFilterType('all')}
              className={`flex-1 py-1 rounded-md transition-all cursor-pointer ${
                filterType === 'all'
                  ? 'bg-white text-brand-700 font-semibold shadow-2xs'
                  : 'hover:text-slate-900'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterType('direct')}
              className={`flex-1 py-1 rounded-md transition-all cursor-pointer ${
                filterType === 'direct'
                  ? 'bg-white text-brand-700 font-semibold shadow-2xs'
                  : 'hover:text-slate-900'
              }`}
            >
              Direct
            </button>
            <button
              onClick={() => setFilterType('group')}
              className={`flex-1 py-1 rounded-md transition-all cursor-pointer ${
                filterType === 'group'
                  ? 'bg-white text-brand-700 font-semibold shadow-2xs'
                  : 'hover:text-slate-900'
              }`}
            >
              Groups
            </button>
          </div>
        </div>

        {/* Conversations Scrollable List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {loadingConvs && conversations.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-slate-500">Loading conversations...</p>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <MessageSquare className="w-6 h-6" />
              </div>
              <p className="text-xs font-semibold text-slate-700">No conversations found</p>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Start a 1-on-1 direct message with any colleague or create a team group.
              </p>
              <div className="pt-2 flex justify-center space-x-2">
                <button
                  onClick={() => {
                    fetchColleagues();
                    setShowDirectModal(true);
                  }}
                  className="px-3 py-1.5 bg-white border border-slate-200 text-brand-700 text-xs font-semibold rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  Start Direct
                </button>
                <button
                  onClick={() => {
                    fetchColleagues();
                    setShowGroupModal(true);
                  }}
                  className="px-3 py-1.5 bg-brand-600 text-white text-xs font-semibold rounded-lg hover:bg-brand-700 cursor-pointer"
                >
                  Create Group
                </button>
              </div>
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const isSelected = conv.id === activeConvId;
              const roleInfo = conv.is_group ? null : formatRoleBadge(conv.other_user?.role);
              const RoleIcon = roleInfo?.icon;

              return (
                <div
                  key={conv.id}
                  onClick={() => setActiveConvId(conv.id)}
                  className={`p-3.5 transition-all cursor-pointer flex items-start space-x-3 ${
                    isSelected
                      ? 'bg-brand-50/90 border-l-4 border-brand-600'
                      : 'hover:bg-slate-100/70'
                  }`}
                >
                  {/* Left: Avatar or Group Icon */}
                  <div className="relative shrink-0">
                    {conv.is_group ? (
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-600 to-indigo-700 text-white flex items-center justify-center font-bold text-sm shadow-xs">
                        <Users className="w-5 h-5" />
                      </div>
                    ) : (
                      <div className="relative">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-200 to-slate-300 text-slate-700 flex items-center justify-center font-bold text-sm overflow-hidden">
                          {conv.other_user?.avatar ? (
                            <img
                              src={conv.other_user.avatar}
                              alt={conv.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <span>{(conv.title || 'U').charAt(0).toUpperCase()}</span>
                          )}
                        </div>
                        {/* Dynamic Presence Dot: Available vs NA */}
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
                            conv.other_user?.is_available ? 'bg-emerald-500' : 'bg-slate-300'
                          }`}
                          title={conv.other_user?.is_available ? 'Available' : 'NA / Offline'}
                        />
                      </div>
                    )}
                  </div>

                  {/* Right Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h3
                        className={`text-xs font-bold truncate ${
                          isSelected ? 'text-brand-900' : 'text-slate-900'
                        }`}
                      >
                        {conv.title}
                      </h3>
                      <span className="text-[10px] text-slate-400 shrink-0 ml-1">
                        {conv.last_message_at
                          ? new Date(conv.last_message_at).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : ''}
                      </span>
                    </div>

                    {/* Role & Designation or Group info */}
                    <div className="flex items-center space-x-1.5 mb-1.5 flex-wrap">
                      {conv.is_group ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          Group • {conv.member_count} members
                        </span>
                      ) : (
                        roleInfo && (
                          <span
                            className={`inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${roleInfo.bg}`}
                          >
                            <RoleIcon className="w-2.5 h-2.5" />
                            <span>{roleInfo.label}</span>
                          </span>
                        )
                      )}
                      {!conv.is_group && conv.other_user?.designation && (
                        <span className="text-[10px] text-slate-500 truncate max-w-[130px]">
                          {conv.other_user.designation}
                        </span>
                      )}
                    </div>

                    {/* Last message preview */}
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-slate-500 truncate">
                        {conv.last_message_preview || 'No messages yet'}
                      </p>
                      {conv.unread_count > 0 && (
                        <span className="ml-2 px-1.5 py-0.2 bg-brand-600 text-white rounded-full text-[10px] font-bold shrink-0">
                          {conv.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ============================================================== */}
      {/* RIGHT PANE: Active Chat Thread (Chronological Dialogue Flow)   */}
      {/* ============================================================== */}
      <div
        className={`flex-1 flex flex-col bg-white overflow-hidden ${
          !activeConvId ? 'hidden md:flex' : 'flex'
        }`}
      >
        {!activeConv ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-slate-50/30">
            <div className="w-16 h-16 rounded-2xl bg-brand-100 text-brand-600 flex items-center justify-center mb-4 shadow-sm">
              <MessageSquare className="w-8 h-8" />
            </div>
            <h2 className="text-lg font-bold text-slate-800">Your Communication Hub</h2>
            <p className="text-xs text-slate-500 max-w-sm mt-1.5 leading-relaxed">
              Real-time direct communication and group collaboration for Ingage Technologies.
              Select a conversation to start chatting.
            </p>
            <div className="mt-6 flex items-center space-x-3">
              <button
                type="button"
                onClick={() => {
                  fetchColleagues();
                  setShowDirectModal(true);
                }}
                className="px-4 py-2 bg-white hover:bg-slate-50 text-brand-700 border border-brand-300 rounded-xl text-xs font-semibold shadow-xs flex items-center space-x-1.5 cursor-pointer transition-all"
              >
                <User className="w-3.5 h-3.5" />
                <span>Start Direct Message</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  fetchColleagues();
                  setShowGroupModal(true);
                }}
                className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center space-x-1.5 cursor-pointer transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create Group Chat</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Active Thread Header */}
            <div className="px-5 py-3.5 border-b border-slate-200 bg-white flex items-center justify-between shrink-0 shadow-2xs">
              <div className="flex items-center space-x-3">
                {/* Mobile Back Button */}
                <button
                  type="button"
                  onClick={() => setActiveConvId(null)}
                  className="md:hidden p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>

                {/* Avatar / Group Icon */}
                {activeConv.is_group ? (
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-600 to-indigo-700 text-white flex items-center justify-center font-bold shadow-xs">
                    <Users className="w-5 h-5" />
                  </div>
                ) : (
                  <div className="relative">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-200 to-slate-300 text-slate-700 flex items-center justify-center font-bold text-sm overflow-hidden">
                      {activeConv.other_user?.avatar ? (
                        <img
                          src={activeConv.other_user.avatar}
                          alt={activeConv.title}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span>{(activeConv.title || 'U').charAt(0).toUpperCase()}</span>
                      )}
                    </div>
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${
                        activeConv.other_user?.is_available ? 'bg-emerald-500' : 'bg-slate-300'
                      }`}
                    />
                  </div>
                )}

                {/* Info & Badges */}
                <div>
                  <div className="flex items-center space-x-2">
                    <h2 className="text-sm font-bold text-slate-900">{activeConv.title}</h2>
                    {!activeConv.is_group && activeConv.other_user?.role && (
                      <span
                        className={`inline-flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
                          formatRoleBadge(activeConv.other_user.role).bg
                        }`}
                      >
                        <span>{formatRoleBadge(activeConv.other_user.role).label}</span>
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 flex items-center space-x-2">
                    {activeConv.is_group ? (
                      <span>{activeConv.member_count} participants</span>
                    ) : (
                      <>
                        <span>{activeConv.other_user?.designation || 'Colleague'}</span>
                        <span>•</span>
                        <span
                          className={
                            activeConv.other_user?.is_available
                              ? 'text-emerald-600 font-semibold'
                              : 'text-slate-400'
                          }
                        >
                          {activeConv.other_user?.is_available ? 'Available / On Duty' : 'NA / Offline'}
                        </span>
                      </>
                    )}
                  </p>
                </div>
              </div>

              {/* Group Action Controls (View Members / Leave Group) */}
              {activeConv.is_group && (
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowMembersModal(true)}
                    className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center space-x-1 transition-all cursor-pointer"
                  >
                    <Users className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Members</span>
                  </button>

                  {/* "and after that whose need to leave" -> Group Leave Button */}
                  <button
                    type="button"
                    onClick={() => setShowLeaveConfirm(true)}
                    className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold flex items-center space-x-1 transition-all cursor-pointer shadow-2xs"
                    title="Leave Group"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Leave</span>
                  </button>
                </div>
              )}
            </div>

            {/* Conversation Messages Thread */}
            {/* Specification:
                "If the user1 (intern) send a message to user2 (intern) it should present to the top
                 follows with the bottom to the conversation, and the user2 (intern) sends to message to user1 (intern)
                 it should present as (user1 message [1st message] user2 message [2nd message]."
             */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-slate-50/40">
              {loadingMessages && messages.length === 0 ? (
                <div className="p-8 text-center">
                  <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  <p className="text-xs text-slate-500">Loading conversation history...</p>
                </div>
              ) : messages.length === 0 ? (
                <div className="p-8 text-center space-y-2">
                  <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <p className="text-xs font-semibold text-slate-700">No messages in this chat yet</p>
                  <p className="text-[11px] text-slate-500">
                    Send the first message to start the conversation!
                  </p>
                </div>
              ) : (
                messages.map((msg) => {
                  if (msg.message_type === 'system') {
                    return (
                      <div key={msg.id} className="flex justify-center my-2">
                        <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full text-[11px] font-medium bg-slate-200/70 text-slate-600 border border-slate-300/60 shadow-2xs">
                          <Info className="w-3 h-3 text-slate-500" />
                          <span>{msg.message_text}</span>
                        </span>
                      </div>
                    );
                  }

                  const isMe = msg.is_self;
                  const roleBadge = formatRoleBadge(msg.sender_role);
                  const RoleIcon = roleBadge.icon;
                  const ordinalText = msg.sequence_index ? `${formatOrdinal(msg.sequence_index)} message` : '';

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} space-y-1`}
                    >
                      {/* Sender Meta Header with Sequence Tag: [1st message], [2nd message], etc. */}
                      <div className="flex items-center space-x-1.5 px-1 text-[11px]">
                        <span className="font-semibold text-slate-800">
                          {isMe ? 'You' : msg.sender_name}
                        </span>

                        {/* Role Badge applied to all roles and positions */}
                        {/* <span
                          className={`inline-flex items-center space-x-0.5 px-1.5 py-0.2 rounded text-[9px] font-semibold border ${roleBadge.bg}`}
                        >
                          <RoleIcon className="w-2.5 h-2.5" />
                          <span>{roleBadge.label}</span>
                        </span> */}

                        {/* Sequence Tag explicitly matching requirement: [1st message] / [2nd message] */}
                        {ordinalText && <div/> 
                        // (
                        //   <span className="px-1.5 py-0.2 rounded-full text-[9px] font-bold bg-slate-200/90 text-slate-700">
                        //     [{ordinalText}]
                        //   </span>
                        // )
                        }

                        <span className="text-[10px] text-slate-400">
                          {new Date(msg.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>

                      {/* Bubble */}
                      <div
                        className={`max-w-[85%] sm:max-w-md md:max-w-lg px-4 py-2.5 rounded-2xl text-xs leading-relaxed shadow-2xs ${
                          isMe
                            ? 'bg-brand-600 text-white rounded-tr-xs'
                            : 'bg-white border border-slate-200 text-slate-800 rounded-tl-xs'
                        }`}
                      >
                        <p className="whitespace-pre-wrap break-words">{msg.message_text}</p>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input Form */}
            <form
              onSubmit={handleSendMessage}
              className="p-3.5 border-t border-slate-200 bg-white flex items-center space-x-2 shrink-0"
            >
              <input
                type="text"
                placeholder={
                  activeConv.is_group
                    ? `Message ${activeConv.title}...`
                    : `Message ${activeConv.title}... (Enter to send)`
                }
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                disabled={sending}
                className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
              />
              <button
                type="submit"
                disabled={!messageText.trim() || sending}
                className={`p-2.5 rounded-xl font-semibold flex items-center justify-center transition-all cursor-pointer shadow-xs ${
                  messageText.trim() && !sending
                    ? 'bg-brand-600 hover:bg-brand-700 text-white'
                    : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                }`}
                title="Send Message"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </>
        )}
      </div>

      {/* ============================================================== */}
      {/* MODAL 1: START DIRECT MESSAGE (1-on-1 Person-to-Person)        */}
      {/* ============================================================== */}
      {showDirectModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-brand-100 text-brand-700 flex items-center justify-center">
                  <User className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Direct Message</h3>
                  <p className="text-[11px] text-slate-500">Pick any colleague across all roles</p>
                </div>
              </div>
              <button
                onClick={() => setShowDirectModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Search Input */}
            <div className="p-3 border-b border-slate-100">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter by name, role, designation..."
                  value={colleagueSearch}
                  onChange={(e) => setColleagueSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                />
              </div>
            </div>

            {/* Colleagues List */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2">
              {loadingColleagues ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  Loading directory...
                </div>
              ) : filteredColleagues.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  No colleagues match your search.
                </div>
              ) : (
                filteredColleagues.map((colleague) => {
                  const roleBadge = formatRoleBadge(colleague.role);
                  const RoleIcon = roleBadge.icon;

                  return (
                    <div
                      key={colleague.id}
                      onClick={() => handleStartDirect(colleague.id)}
                      className="p-2.5 hover:bg-brand-50/60 rounded-xl transition-all cursor-pointer flex items-center justify-between group"
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <div className="relative shrink-0">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-200 to-slate-300 text-slate-700 flex items-center justify-center font-bold text-xs">
                            {colleague.avatar ? (
                              <img
                                src={colleague.avatar}
                                alt={colleague.full_name}
                                className="w-full h-full object-cover rounded-xl"
                              />
                            ) : (
                              colleague.full_name.charAt(0).toUpperCase()
                            )}
                          </div>
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                              colleague.is_available ? 'bg-emerald-500' : 'bg-slate-300'
                            }`}
                          />
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center space-x-1.5">
                            <p className="text-xs font-bold text-slate-900 group-hover:text-brand-700 truncate">
                              {colleague.full_name}
                            </p>
                            <span
                              className={`inline-flex items-center space-x-0.5 px-1.5 py-0.2 rounded text-[9px] font-semibold border ${roleBadge.bg}`}
                            >
                              <RoleIcon className="w-2.5 h-2.5" />
                              <span>{roleBadge.label}</span>
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 truncate">
                            {colleague.designation || colleague.email}
                          </p>
                        </div>
                      </div>

                      <span className="text-[11px] text-brand-600 font-semibold opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-2">
                        Chat &rarr;
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 2: CREATE GROUP CHAT ("whose wanted")                    */}
      {/* ============================================================== */}
      {showGroupModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateGroup}
            className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150"
          >
            {/* Header */}
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Create Group Chat</h3>
                  <p className="text-[11px] text-slate-500">
                    Add colleagues you want in this group
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGroupModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Inputs */}
            <div className="p-4 space-y-3 border-b border-slate-100">
              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Group Title *
                </label>
                <input
                  type="text"
                  placeholder="e.g. Frontend Interns, Tech Leads & Devs, Sprint Alpha"
                  value={groupTitle}
                  onChange={(e) => setGroupTitle(e.target.value)}
                  required
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                  Description (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Topic or purpose of this group..."
                  value={groupDesc}
                  onChange={(e) => setGroupDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                />
              </div>

              {/* Members Selection Header */}
              <div className="flex items-center justify-between pt-1">
                <label className="text-[11px] font-semibold text-slate-700">
                  Select Members ({selectedMemberIds.length} chosen)
                </label>
                {selectedMemberIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedMemberIds([])}
                    className="text-[10px] text-brand-600 hover:underline cursor-pointer"
                  >
                    Clear All
                  </button>
                )}
              </div>

              {/* Search Member Filter */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2" />
                <input
                  type="text"
                  placeholder="Search members to add..."
                  value={colleagueSearch}
                  onChange={(e) => setColleagueSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none"
                />
              </div>
            </div>

            {/* Selectable Member Checkbox List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1 max-h-56">
              {filteredColleagues.map((colleague) => {
                const isChecked = selectedMemberIds.includes(colleague.id);
                const roleBadge = formatRoleBadge(colleague.role);
                const RoleIcon = roleBadge.icon;

                return (
                  <div
                    key={colleague.id}
                    onClick={() => toggleMemberSelection(colleague.id)}
                    className={`p-2 rounded-xl transition-all cursor-pointer flex items-center justify-between border ${
                      isChecked
                        ? 'bg-brand-50 border-brand-300'
                        : 'bg-white hover:bg-slate-50 border-transparent'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center font-bold text-xs shrink-0">
                        {colleague.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center space-x-1.5">
                          <p className="text-xs font-semibold text-slate-900 truncate">
                            {colleague.full_name}
                          </p>
                          <span
                            className={`inline-flex items-center space-x-0.5 px-1 py-0.1 rounded text-[9px] font-semibold border ${roleBadge.bg}`}
                          >
                            <RoleIcon className="w-2 h-2" />
                            <span>{roleBadge.label}</span>
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 truncate">
                          {colleague.designation || colleague.email}
                        </p>
                      </div>
                    </div>

                    <div
                      className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${
                        isChecked
                          ? 'bg-brand-600 border-brand-600 text-white'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {isChecked && <CheckCircle2 className="w-3.5 h-3.5" />}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="p-3 border-t border-slate-200 bg-slate-50/70 flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowGroupModal(false)}
                className="px-3.5 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!groupTitle.trim() || creatingGroup}
                className={`px-4 py-1.5 rounded-xl text-xs font-semibold text-white shadow-xs cursor-pointer ${
                  groupTitle.trim() && !creatingGroup
                    ? 'bg-brand-600 hover:bg-brand-700'
                    : 'bg-slate-300 cursor-not-allowed'
                }`}
              >
                {creatingGroup ? 'Creating...' : 'Create Group'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 3: VIEW GROUP MEMBERS                                    */}
      {/* ============================================================== */}
      {showMembersModal && activeConv && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
              <div>
                <h3 className="text-sm font-bold text-slate-900">{activeConv.title}</h3>
                <p className="text-[11px] text-slate-500">
                  {activeConv.members?.length || 0} Group Members
                </p>
              </div>
              <button
                onClick={() => setShowMembersModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2">
              {(activeConv.members || []).map((m) => {
                const roleBadge = formatRoleBadge(m.role);
                const RoleIcon = roleBadge.icon;
                const isSelf = m.user_id === user?.id;

                return (
                  <div key={m.user_id} className="p-2.5 flex items-center justify-between">
                    <div className="flex items-center space-x-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center font-bold text-xs text-slate-700 shrink-0">
                        {m.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center space-x-1.5">
                          <p className="text-xs font-bold text-slate-900 truncate">
                            {m.full_name} {isSelf && '(You)'}
                          </p>
                          <span
                            className={`inline-flex items-center space-x-0.5 px-1 py-0.1 rounded text-[9px] font-semibold border ${roleBadge.bg}`}
                          >
                            <RoleIcon className="w-2 h-2" />
                            <span>{roleBadge.label}</span>
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 truncate">
                          {m.designation || m.email}
                        </p>
                      </div>
                    </div>

                    {m.member_role === 'admin' && (
                      <span className="px-2 py-0.5 bg-brand-50 text-brand-700 text-[10px] font-bold rounded border border-brand-200 shrink-0">
                        Admin
                      </span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="p-3 border-t border-slate-200 bg-slate-50/70 flex justify-between items-center">
              <button
                type="button"
                onClick={() => {
                  setShowMembersModal(false);
                  setShowLeaveConfirm(true);
                }}
                className="px-3 py-1.5 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg flex items-center space-x-1 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Leave Group</span>
              </button>

              <button
                type="button"
                onClick={() => setShowMembersModal(false)}
                className="px-4 py-1.5 bg-white border border-slate-200 text-slate-700 text-xs font-semibold rounded-xl hover:bg-slate-100 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* MODAL 4: LEAVE GROUP CONFIRMATION ("whose need to leave")       */}
      {/* ============================================================== */}
      {showLeaveConfirm && activeConv && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full border border-slate-200 shadow-xl p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <LogOut className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="text-sm font-bold text-slate-900">Leave '{activeConv.title}'?</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                You will no longer receive new messages or participate in this group chat.
              </p>
            </div>

            <div className="flex justify-end space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setShowLeaveConfirm(false)}
                disabled={leavingGroup}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleLeaveGroup}
                disabled={leavingGroup}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-xs"
              >
                {leavingGroup ? 'Leaving...' : 'Yes, Leave'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChatPage;
