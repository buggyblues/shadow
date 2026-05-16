"""Shadow real-time Socket.IO client — Python edition.

Mirrors the TypeScript ``ShadowSocket`` class so that every JS SDK socket
method has a Python equivalent with identical semantics.
"""

from __future__ import annotations

from typing import Any, Callable

import socketio


class ShadowSocket:
    """Real-time event listener for the Shadow server via Socket.IO."""

    def __init__(
        self,
        server_url: str,
        token: str,
        *,
        transports: list[str] | None = None,
        auto_reconnect: bool = True,
        reconnection_delay: float = 1.0,
    ) -> None:
        self._server_url = server_url.rstrip("/")
        self._token = token
        self._connected = False
        self._sio = socketio.Client(
            reconnection=auto_reconnect,
            reconnection_delay=reconnection_delay,
        )

        # Internal connection tracking
        @self._sio.event
        def connect() -> None:
            self._connected = True

        @self._sio.event
        def disconnect() -> None:
            self._connected = False

    @property
    def connected(self) -> bool:
        return self._connected

    @property
    def raw(self) -> socketio.Client:
        return self._sio

    # ── Connection lifecycle ─────────────────────────────────────────────

    def connect(self) -> None:
        if not self._sio.connected:
            self._sio.connect(
                self._server_url,
                auth={"token": self._token},
                transports=["websocket"],
            )

    def disconnect(self) -> None:
        if self._sio.connected:
            self._sio.disconnect()

    def wait(self) -> None:
        """Block until the connection is closed (useful for long-running bots)."""
        self._sio.wait()

    # ── Event listeners ──────────────────────────────────────────────────

    def on(self, event: str, handler: Callable[..., Any]) -> "ShadowSocket":
        self._sio.on(event, handler)
        return self

    def off(self, event: str, handler: Callable[..., Any] | None = None) -> "ShadowSocket":
        # python-socketio uses on() to register; to remove we access handlers directly
        if handler and event in self._sio.handlers:
            fns = self._sio.handlers[event]
            self._sio.handlers[event] = [f for f in fns if f is not handler]
        elif event in self._sio.handlers:
            del self._sio.handlers[event]
        return self

    def on_connect(self, handler: Callable[[], None]) -> "ShadowSocket":
        self._sio.on("connect", handler)
        return self

    def on_disconnect(self, handler: Callable[[str], None]) -> "ShadowSocket":
        self._sio.on("disconnect", handler)
        return self

    # ── Room management ──────────────────────────────────────────────────

    def join_channel(self, channel_id: str) -> dict[str, Any]:
        return self._sio.call("channel:join", {"channelId": channel_id})

    def leave_channel(self, channel_id: str) -> None:
        self._sio.emit("channel:leave", {"channelId": channel_id})

    def join_voice_channel(
        self,
        channel_id: str,
        *,
        client_id: str | None = None,
        muted: bool | None = None,
        deafened: bool | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"channelId": channel_id}
        if client_id is not None:
            payload["clientId"] = client_id
        if muted is not None:
            payload["muted"] = muted
        if deafened is not None:
            payload["deafened"] = deafened
        return self._sio.call("voice:join", payload)

    def leave_voice_channel(self, channel_id: str) -> dict[str, Any]:
        return self._sio.call("voice:leave", {"channelId": channel_id})

    def update_voice_state(
        self,
        channel_id: str,
        *,
        muted: bool | None = None,
        deafened: bool | None = None,
        speaking: bool | None = None,
        screen_sharing: bool | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"channelId": channel_id}
        if muted is not None:
            payload["muted"] = muted
        if deafened is not None:
            payload["deafened"] = deafened
        if speaking is not None:
            payload["speaking"] = speaking
        if screen_sharing is not None:
            payload["screenSharing"] = screen_sharing
        return self._sio.call("voice:state:update", payload)

    def send_voice_heartbeat(self, channel_id: str) -> None:
        self._sio.emit("voice:heartbeat", {"channelId": channel_id})

    # ── Client actions ───────────────────────────────────────────────────

    def send_message(
        self,
        channel_id: str,
        content: str,
        *,
        thread_id: str | None = None,
        reply_to_id: str | None = None,
        mentions: list[dict[str, Any]] | None = None,
        metadata: dict[str, Any] | None = None,
    ) -> None:
        data: dict[str, Any] = {"channelId": channel_id, "content": content}
        if thread_id:
            data["threadId"] = thread_id
        if reply_to_id:
            data["replyToId"] = reply_to_id
        if mentions is not None:
            data["mentions"] = mentions
        if metadata is not None:
            data["metadata"] = metadata
        self._sio.emit("message:send", data)

    def send_typing(self, channel_id: str) -> None:
        self._sio.emit("message:typing", {"channelId": channel_id})

    def update_presence(
        self, status: str  # 'online' | 'idle' | 'dnd' | 'offline'
    ) -> None:
        self._sio.emit("presence:update", {"status": status})

    def update_activity(
        self, channel_id: str, activity: str | None
    ) -> None:
        self._sio.emit(
            "presence:activity", {"channelId": channel_id, "activity": activity}
        )
