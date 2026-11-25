import React, { useEffect, useState } from 'react';
import { notificationsApi } from '../api/client';
import { Bell, Check, CheckCheck, Clock, AlertCircle, Info, X } from 'lucide-react';

export const NotificationDrawer = ({ isOpen, onClose, onSelectTask, onCountChange }) => {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const res = await notificationsApi.getNotifications();
      setNotifications(res.data.items || []);
      if (onCountChange && res.data.unread_count !== undefined) {
        onCountChange(res.data.unread_count);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen]);

  const handleMarkRead = async (id, e) => {
    e.stopPropagation();
    try {
      await notificationsApi.markRead(id);
      setNotifications(prev => {
        const updated = prev.map(n => n.id === id ? { ...n, is_read: true } : n);
        if (onCountChange) {
          onCountChange(updated.filter(n => !n.is_read).length);
        }
        return updated;
      });
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationsApi.markAllRead();
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      if (onCountChange) {
        onCountChange(0);
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="absolute right-0 top-14 w-96 max-w-[90vw] bg-white rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-100">
        <div className="flex items-center space-x-2">
          <Bell className="w-4 h-4 text-brand-600" />
          <span className="font-semibold text-sm text-slate-800">Notifications</span>
          <span className="text-xs bg-brand-100 text-brand-700 font-medium px-2 py-0.5 rounded-full">
            {notifications.filter(n => !n.is_read).length} new
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={handleMarkAllRead}
            className="text-xs text-brand-600 hover:text-brand-700 hover:underline flex items-center font-medium"
            title="Mark all as read"
          >
            <CheckCheck className="w-3.5 h-3.5 mr-1" /> Mark all read
          </button>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* List */}
      <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
        {loading ? (
          <div className="py-8 text-center text-xs text-slate-400">Loading notifications...</div>
        ) : notifications.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-400">No notifications</div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              onClick={() => {
                if (n.task_id && onSelectTask) onSelectTask(n.task_id);
              }}
              className={`p-3.5 text-left transition-colors cursor-pointer hover:bg-slate-50 flex items-start space-x-3 ${
                !n.is_read ? 'bg-brand-50/40' : ''
              }`}
            >
              <div className="mt-0.5">
                {n.notification_type === 'task_alert' ? (
                  <AlertCircle className="w-4 h-4 text-rose-500" />
                ) : n.notification_type === 'review' ? (
                  <Check className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Info className="w-4 h-4 text-brand-600" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <h4 className={`text-xs font-semibold truncate ${!n.is_read ? 'text-slate-900' : 'text-slate-700'}`}>
                    {n.title}
                  </h4>
                  {!n.is_read && (
                    <button
                      onClick={(e) => handleMarkRead(n.id, e)}
                      className="text-[10px] text-slate-400 hover:text-brand-600 ml-2"
                      title="Mark as read"
                    >
                      <Check className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">{n.message}</p>
                <div className="flex items-center text-[10px] text-slate-400 mt-1.5 space-x-1">
                  <Clock className="w-3 h-3" />
                  <span>{new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default NotificationDrawer;

