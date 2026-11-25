import asyncio
from datetime import datetime, timezone
from typing import Dict, Set, Optional, Any
import logging

logger = logging.getLogger("notification_broadcaster")

class NotificationBroadcaster:
    """
    Manages Server-Sent Events (SSE) connections and real-time user login presence in RAM.
    Allows dynamic verification of employee availability without storing static database records.
    """
    def __init__(self):
        # Maps user_id -> Set of active asyncio.Queue instances
        self._user_queues: Dict[int, Set[asyncio.Queue]] = {}
        # Maps user_id -> datetime of last login or active presence
        self._active_logins: Dict[int, datetime] = {}
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def mark_user_login(self, user_id: int) -> None:
        """Mark a user as actively logged in."""
        self._active_logins[user_id] = datetime.now(timezone.utc)
        logger.debug(f"[Broadcaster] User {user_id} marked as logged in")

    def mark_user_logout(self, user_id: int) -> None:
        """Mark a user as logged out and remove their active presence."""
        self._active_logins.pop(user_id, None)
        if user_id in self._user_queues:
            self._user_queues.pop(user_id, None)
        logger.debug(f"[Broadcaster] User {user_id} marked as logged out")

    def is_user_logged_in(self, user_id: int) -> bool:
        """
        Dynamically check if an employee is currently logged in:
        1. User has an active SSE stream connection (browser tab is open).
        2. OR user logged in / active within the last 15 minutes.
        """
        # Active open connection
        if user_id in self._user_queues and len(self._user_queues[user_id]) > 0:
            return True

        # Recent active login session
        last_time = self._active_logins.get(user_id)
        if last_time:
            elapsed = (datetime.now(timezone.utc) - last_time).total_seconds()
            if elapsed < 900:  # 15 minutes session threshold
                return True
            else:
                self._active_logins.pop(user_id, None)

        return False

    def register(self, user_id: int, queue: asyncio.Queue, loop: asyncio.AbstractEventLoop) -> None:
        """Register a new SSE stream queue for a user."""
        self._loop = loop
        if user_id not in self._user_queues:
            self._user_queues[user_id] = set()
        self._user_queues[user_id].add(queue)
        self._active_logins[user_id] = datetime.now(timezone.utc)
        logger.debug(f"[Broadcaster] User {user_id} connected (Active streams: {len(self._user_queues[user_id])})")

    def unregister(self, user_id: int, queue: asyncio.Queue) -> None:
        """Unregister an SSE stream queue when a user disconnects or closes tab."""
        if user_id in self._user_queues:
            self._user_queues[user_id].discard(queue)
            if not self._user_queues[user_id]:
                del self._user_queues[user_id]
        logger.debug(f"[Broadcaster] User {user_id} disconnected")

    def broadcast(self, user_id: int, payload: Dict[str, Any]) -> None:
        """
        Thread-safely push an event to all open connections of a user.
        Safe to call from background worker threads or async routes.
        """
        queues = self._user_queues.get(user_id)
        if not queues:
            return  # User has no active SSE connections

        for queue in list(queues):
            try:
                if self._loop and self._loop.is_running():
                    self._loop.call_soon_threadsafe(queue.put_nowait, payload)
                else:
                    queue.put_nowait(payload)
            except Exception as e:
                logger.warning(f"[Broadcaster] Failed to dispatch to queue for user {user_id}: {e}")

broadcaster = NotificationBroadcaster()

