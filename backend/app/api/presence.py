from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, status
from app.core.security import decode_access_token
from app.core.websocket_manager import ws_manager
import logging

logger = logging.getLogger("presence_api")

router = APIRouter(tags=["WebSocket Presence"])

@router.websocket("/ws/presence")
async def websocket_presence_endpoint(
    websocket: WebSocket,
    token: str = Query(...)
):
    """
    Real-time WebSocket presence endpoint.
    When an employee connects, they are immediately verified as Available.
    When they disconnect, they are immediately verified as NA.
    """
    user_id_str = decode_access_token(token)
    if not user_id_str:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    try:
        user_id = int(user_id_str)
    except ValueError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await ws_manager.connect(user_id, websocket, token)

    try:
        # Send initial confirmation and online roster
        await websocket.send_json({
            "type": "presence_init",
            "user_id": user_id,
            "status": "connected",
            "online_user_ids": list(ws_manager.get_online_user_ids())
        })

        # Keep connection open and respond to heartbeats & 8-min service triggers
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
            elif data == "service_verify" or (data.startswith("{") and "service_verify" in data):
                cycle_res = await ws_manager.run_periodic_service_cycle()
                await websocket.send_json(cycle_res)
    except WebSocketDisconnect:
        await ws_manager.disconnect(user_id, websocket)
    except Exception as e:
        logger.warning(f"[WebSocket Presence] Error for user {user_id}: {e}")
        await ws_manager.disconnect(user_id, websocket)


@router.post("/service-check")
@router.get("/service-check")
@router.post("/presence/service-check")
@router.get("/presence/service-check")
async def trigger_periodic_service_check():
    """
    Triggers or verifies the 8-minute employee availability service check.
    Broadcasts live presence across WebSockets and returns verified status.
    """
    res = await ws_manager.run_periodic_service_cycle()
    return {
        "status": "success",
        "message": "8-minute employee duty availability service check completed successfully",
        **res
    }


