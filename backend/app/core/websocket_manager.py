import asyncio
import json
import logging
from typing import Dict, Set, Optional, Any
from fastapi import WebSocket

logger = logging.getLogger("websocket_presence")

class WebSocketPresenceManager:
    """
    Manages live WebSocket connections for employees.
    Verifies real-time presence (Available vs NA) dynamically
    without storing static records in PostgreSQL database.
    """
    def __init__(self):
        # Maps user_id -> Set of active WebSocket connections
        self._user_sockets: Dict[int, Set[WebSocket]] = {}
        # All connected WebSockets for broadcasting presence changes
        self._all_sockets: Set[WebSocket] = set()
        self._socket_tokens: Dict[WebSocket, str] = {}

    async def connect(self, user_id: int, websocket: WebSocket, token: str) -> None:
        """Register an active employee WebSocket connection and broadcast Available."""
        await websocket.accept()
        if user_id not in self._user_sockets:
            self._user_sockets[user_id] = set()
        self._user_sockets[user_id].add(websocket)
        self._all_sockets.add(websocket)
        self._socket_tokens[websocket] = token
        logger.info(f"[WebSocket Presence] User {user_id} connected (Active sockets: {len(self._user_sockets[user_id])})")
        
        # Broadcast presence update: this employee is now Available
        await self.broadcast_presence(user_id=user_id, is_available=True, availability_status="Available")

    async def disconnect(self, user_id: int, websocket: WebSocket) -> None:
        """Unregister an employee's WebSocket connection and broadcast NA if no sockets remain."""
        if user_id in self._user_sockets:
            self._user_sockets[user_id].discard(websocket)
            if not self._user_sockets[user_id]:
                del self._user_sockets[user_id]
                # No remaining active connections for this user -> broadcast NA
                await self.broadcast_presence(user_id=user_id, is_available=False, availability_status="NA")
        
        self._all_sockets.discard(websocket)
        self._socket_tokens.pop(websocket, None)
        logger.info(f"[WebSocket Presence] User {user_id} disconnected")

    async def disconnect_session(self, user_id: int, token: str) -> None:
        """Close this login session's sockets and mark the user unavailable if none remain."""
        user_sockets = self._user_sockets.get(user_id, set())
        session_sockets = [
            websocket
            for websocket in user_sockets
            if self._socket_tokens.get(websocket) == token
        ]
        if not session_sockets:
            return

        for websocket in session_sockets:
            user_sockets.discard(websocket)
            self._all_sockets.discard(websocket)
            self._socket_tokens.pop(websocket, None)

        is_last_session = not user_sockets
        if is_last_session:
            self._user_sockets.pop(user_id, None)

        for websocket in session_sockets:
            try:
                await websocket.close(code=1000)
            except Exception:
                pass

        if is_last_session:
            await self.broadcast_presence(user_id=user_id, is_available=False, availability_status="NA")

    def is_user_available(self, user_id: int) -> bool:
        """
        Check if an employee currently has an active WebSocket connection.
        Returns True if employee is actively connected via WebSocket, False otherwise.
        """
        return user_id in self._user_sockets and len(self._user_sockets[user_id]) > 0

    def get_online_user_ids(self) -> Set[int]:
        """Return all user IDs currently verified as online via WebSocket."""
        return set(self._user_sockets.keys())

    async def broadcast_presence(self, user_id: int, is_available: bool, availability_status: str) -> None:
        """Broadcast live presence update to all open WebSocket connections."""
        payload = json.dumps({
            "type": "presence_update",
            "user_id": user_id,
            "is_available": is_available,
            "availability_status": availability_status
        })
        dead_sockets = set()
        for ws in list(self._all_sockets):
            try:
                await ws.send_text(payload)
            except Exception:
                dead_sockets.add(ws)
        for dead_ws in dead_sockets:
            self._all_sockets.discard(dead_ws)

    async def run_periodic_service_cycle(self) -> Dict[str, Any]:
        """
        8-minute periodic service cycle that verifies active WebSocket connections
        and broadcasts employee availability (Available vs NA) to all clients.
        """
        from datetime import datetime, timezone
        online_ids = list(self.get_online_user_ids())
        payload = json.dumps({
            "type": "presence_service_cycle",
            "cycle_interval_minutes": 8,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "online_user_ids": online_ids,
            "message": "8-minute automated employee availability service check completed"
        })
        dead_sockets = set()
        for ws in list(self._all_sockets):
            try:
                await ws.send_text(payload)
            except Exception:
                dead_sockets.add(ws)
        for dead_ws in dead_sockets:
            self._all_sockets.discard(dead_ws)

        logger.info(f"[8-Min Service] Broadcast completed. Verified {len(online_ids)} online users via WebSocket.")
        return {
            "cycle_interval_minutes": 8,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "online_user_ids": online_ids,
            "total_online": len(online_ids)
        }

ws_manager = WebSocketPresenceManager()

