"""Minimal async Shadow SDK used by the Hermes Shadow platform plugin.

The repository snapshot uploaded with this task contains an empty
``packages/sdk-python`` directory, so this module implements the subset of the
TypeScript SDK that the Hermes adapter needs. It intentionally mirrors the TS
client method names where practical.
"""

from __future__ import annotations

import asyncio
import json
import mimetypes
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Awaitable, Callable, Iterable
from urllib.parse import quote, urljoin, urlparse

import httpx

JsonDict = dict[str, Any]
EventHandler = Callable[..., Any]


class ShadowApiError(RuntimeError):
    """Raised when the Shadow REST API returns a non-2xx response."""

    def __init__(self, method: str, path: str, status_code: int, body: str):
        body = _sanitize_body(body)
        super().__init__(f"Shadow API {method} {path} failed ({status_code}): {body}")
        self.method = method
        self.path = path
        self.status_code = status_code
        self.body = body


def _sanitize_body(body: str, limit: int = 600) -> str:
    if not body:
        return "(empty response)"
    text = body.strip()
    # Keep JSON readable and strip common HTML error pages to their text/title.
    if text.startswith("{") or text.startswith("["):
        try:
            return json.dumps(json.loads(text), ensure_ascii=False)[:limit]
        except Exception:
            return text[:limit]
    if "<" in text and ">" in text:
        import re

        title = re.search(r"<title>(.*?)</title>", text, flags=re.I | re.S)
        if title:
            return re.sub(r"\s+", " ", title.group(1)).strip()[:limit]
        text = re.sub(r"<[^>]+>", " ", text)
        text = re.sub(r"\s+", " ", text).strip()
    return text[:limit]


def normalize_base_url(value: str) -> str:
    value = (value or "").strip().rstrip("/")
    if value.endswith("/api"):
        value = value[:-4]
    if not value:
        raise ValueError("Shadow base URL is required")
    return value


def content_disposition_filename(header: str | None) -> str | None:
    if not header:
        return None
    import re
    from urllib.parse import unquote

    match = re.search(r"filename\*=UTF-8''([^;]+)", header, flags=re.I)
    if match:
        try:
            return unquote(match.group(1).strip())
        except Exception:
            return match.group(1).strip()
    match = re.search(r'filename="([^"]+)"', header, flags=re.I)
    if match:
        return match.group(1)
    match = re.search(r"filename=([^;]+)", header, flags=re.I)
    if match:
        return match.group(1).strip()
    return None


def infer_content_type(filename: str, fallback: str = "application/octet-stream") -> str:
    guessed, _ = mimetypes.guess_type(filename)
    return guessed or fallback


def parse_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    text = str(value).strip().lower()
    if text in {"1", "true", "yes", "y", "on"}:
        return True
    if text in {"0", "false", "no", "n", "off"}:
        return False
    return default


def split_csv(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, (list, tuple, set)):
        return [str(v).strip() for v in value if str(v).strip()]
    return [part.strip() for part in str(value).replace("\n", ",").split(",") if part.strip()]


@dataclass(slots=True)
class DownloadedFile:
    data: bytes
    filename: str
    content_type: str


class ShadowAsyncClient:
    """Small async REST client for Shadow.

    It covers the gateway adapter path: auth/me, channel discovery, message
    send/read/edit/delete, reactions, media upload/download, and thread sends.
    """

    def __init__(self, base_url: str, token: str, *, timeout: float = 60.0):
        self.base_url = normalize_base_url(base_url)
        self.token = token
        self.timeout = timeout
        self._client: httpx.AsyncClient | None = None

    async def __aenter__(self) -> "ShadowAsyncClient":
        await self.open()
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self.close()

    async def open(self) -> None:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self.timeout, follow_redirects=True)

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=self.timeout, follow_redirects=True)
        return self._client

    def _headers(self, *, json_content: bool = True) -> dict[str, str]:
        headers = {"Authorization": f"Bearer {self.token}"}
        if json_content:
            headers["Content-Type"] = "application/json"
        return headers

    def _url(self, path_or_url: str) -> str:
        if path_or_url.startswith("http://") or path_or_url.startswith("https://"):
            return path_or_url
        if not path_or_url.startswith("/"):
            path_or_url = "/" + path_or_url
        return self.base_url + path_or_url

    async def request(
        self,
        method: str,
        path: str,
        *,
        json_body: Any | None = None,
        params: dict[str, Any] | None = None,
    ) -> Any:
        await self.open()
        response = await self.client.request(
            method.upper(),
            self._url(path),
            headers=self._headers(json_content=True),
            json=json_body,
            params=params,
        )
        if response.status_code < 200 or response.status_code >= 300:
            raise ShadowApiError(method.upper(), path, response.status_code, response.text)
        if response.status_code == 204 or not response.content:
            return None
        payload = response.json()
        if isinstance(payload, dict) and "ok" in payload and "success" not in payload:
            payload = {**payload, "success": bool(payload.get("ok"))}
        return payload

    async def get_me(self) -> JsonDict:
        return await self.request("GET", "/api/auth/me")

    async def heartbeat_agent(self, agent_id: str) -> JsonDict:
        return await self.request(
            "POST",
            f"/api/agents/{quote(str(agent_id), safe='')}/heartbeat",
        )

    async def update_agent_slash_commands(self, agent_id: str, commands: list[JsonDict]) -> JsonDict:
        return await self.request(
            "PUT",
            f"/api/agents/{quote(str(agent_id), safe='')}/slash-commands",
            json_body={"commands": commands},
        )

    async def get_agent_slash_commands(self, agent_id: str) -> JsonDict:
        return await self.request(
            "GET",
            f"/api/agents/{quote(str(agent_id), safe='')}/slash-commands",
        )

    async def get_agent_config(self, agent_id: str) -> JsonDict:
        return await self.request(
            "GET",
            f"/api/agents/{quote(str(agent_id), safe='')}/config",
        )

    async def list_servers(self) -> list[JsonDict]:
        return await self.request("GET", "/api/servers")

    async def get_server_channels(self, server_id_or_slug: str) -> list[JsonDict]:
        return await self.request("GET", f"/api/servers/{quote(str(server_id_or_slug), safe='')}/channels")

    async def list_direct_channels(self) -> list[JsonDict]:
        return await self.request("GET", "/api/channels/dm")

    async def create_direct_channel(self, user_id: str) -> JsonDict:
        return await self.request(
            "POST",
            "/api/channels/dm",
            json_body={"userId": str(user_id)},
        )

    async def get_channel(self, channel_id: str) -> JsonDict:
        return await self.request("GET", f"/api/channels/{quote(str(channel_id), safe='')}")

    async def get_messages(
        self,
        channel_id: str,
        *,
        limit: int = 50,
        cursor: str | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {"limit": int(limit)}
        if cursor:
            params["cursor"] = cursor
        payload = await self.request(
            "GET",
            f"/api/channels/{quote(str(channel_id), safe='')}/messages",
            params=params,
        )
        if isinstance(payload, list):
            return {"messages": payload, "hasMore": False}
        return payload

    async def get_message(self, message_id: str) -> JsonDict:
        return await self.request("GET", f"/api/messages/{quote(str(message_id), safe='')}")

    async def resolve_attachment_media_url(self, attachment_id: str, *, disposition: str = "inline") -> JsonDict:
        return await self.request(
            "GET",
            f"/api/attachments/{quote(str(attachment_id), safe='')}/media-url",
            params={"disposition": disposition},
        )

    async def send_message(
        self,
        channel_id: str,
        content: str,
        *,
        thread_id: str | None = None,
        reply_to_id: str | None = None,
        mentions: list[JsonDict] | None = None,
        metadata: JsonDict | None = None,
        attachments: list[JsonDict] | None = None,
    ) -> JsonDict:
        body: JsonDict = {"content": content}
        if thread_id:
            body["threadId"] = thread_id
        if reply_to_id:
            body["replyToId"] = reply_to_id
        if mentions:
            body["mentions"] = mentions
        if metadata:
            body["metadata"] = metadata
        if attachments:
            body["attachments"] = attachments
        return await self.request(
            "POST",
            f"/api/channels/{quote(str(channel_id), safe='')}/messages",
            json_body=body,
        )

    async def send_to_thread(
        self,
        thread_id: str,
        content: str,
        *,
        reply_to_id: str | None = None,
        mentions: list[JsonDict] | None = None,
        metadata: JsonDict | None = None,
    ) -> JsonDict:
        body: JsonDict = {"content": content}
        if reply_to_id:
            body["replyToId"] = reply_to_id
        if mentions:
            body["mentions"] = mentions
        if metadata:
            body["metadata"] = metadata
        return await self.request(
            "POST",
            f"/api/threads/{quote(str(thread_id), safe='')}/messages",
            json_body=body,
        )

    async def edit_message(self, message_id: str, content: str) -> JsonDict:
        return await self.request(
            "PATCH",
            f"/api/messages/{quote(str(message_id), safe='')}",
            json_body={"content": content},
        )

    async def delete_message(self, message_id: str) -> None:
        await self.request("DELETE", f"/api/messages/{quote(str(message_id), safe='')}")

    async def add_reaction(self, message_id: str, emoji: str) -> None:
        await self.request(
            "POST",
            f"/api/messages/{quote(str(message_id), safe='')}/reactions",
            json_body={"emoji": emoji},
        )

    async def remove_reaction(self, message_id: str, emoji: str) -> None:
        await self.request(
            "DELETE",
            f"/api/messages/{quote(str(message_id), safe='')}/reactions/{quote(str(emoji), safe='')}",
        )

    async def upload_media(
        self,
        data: bytes,
        filename: str,
        content_type: str | None = None,
        *,
        message_id: str | None = None,
    ) -> JsonDict:
        await self.open()
        content_type = content_type or infer_content_type(filename)
        files = {"file": (filename, data, content_type)}
        form_data: dict[str, str] = {}
        if message_id:
            form_data["messageId"] = message_id
        response = await self.client.post(
            self._url("/api/media/upload"),
            headers=self._headers(json_content=False),
            files=files,
            data=form_data,
        )
        if response.status_code < 200 or response.status_code >= 300:
            raise ShadowApiError("POST", "/api/media/upload", response.status_code, response.text)
        return response.json()

    async def upload_media_from_path(self, path: str | os.PathLike[str], *, message_id: str | None = None) -> JsonDict:
        p = Path(path).expanduser()
        data = p.read_bytes()
        return await self.upload_media(
            data,
            p.name,
            infer_content_type(p.name),
            message_id=message_id,
        )

    async def upload_media_from_url(self, url_or_path: str, *, message_id: str | None = None) -> JsonDict:
        value = str(url_or_path).strip()
        if value.upper().startswith("MEDIA:"):
            value = value.split(":", 1)[1].strip()
        if value.startswith("file://"):
            value = value[7:]
        if value.startswith("~") or value.startswith("/") or not urlparse(value).scheme:
            return await self.upload_media_from_path(value, message_id=message_id)
        downloaded = await self.download_file(value)
        return await self.upload_media(
            downloaded.data,
            downloaded.filename,
            downloaded.content_type,
            message_id=message_id,
        )

    async def download_file(self, file_url: str) -> DownloadedFile:
        await self.open()
        headers: dict[str, str] = {}
        full_url = file_url
        if file_url.startswith("/"):
            full_url = self.base_url + file_url
            headers["Authorization"] = f"Bearer {self.token}"
        elif file_url.startswith(self.base_url):
            headers["Authorization"] = f"Bearer {self.token}"
        response = await self.client.get(full_url, headers=headers, follow_redirects=True)
        if response.status_code < 200 or response.status_code >= 300:
            raise ShadowApiError("GET", file_url, response.status_code, response.text)
        content_type = response.headers.get("content-type") or "application/octet-stream"
        filename = content_disposition_filename(response.headers.get("content-disposition"))
        if not filename:
            parsed_path = urlparse(str(response.url)).path or urlparse(full_url).path
            filename = os.path.basename(parsed_path) or "file"
        return DownloadedFile(response.content, filename, content_type)


class ShadowSocketClient:
    """Async Socket.IO wrapper for Shadow realtime events."""

    def __init__(
        self,
        base_url: str,
        token: str,
        *,
        transports: Iterable[str] | None = None,
        reconnection: bool = True,
        logger: Any | None = None,
    ):
        try:
            import socketio  # type: ignore
        except Exception as exc:  # pragma: no cover - depends on optional dependency
            raise RuntimeError(
                "python-socketio is required for Shadow realtime mode. "
                "Install requirements.txt or set SHADOW_REST_ONLY=true."
            ) from exc

        self.base_url = normalize_base_url(base_url)
        self.token = token
        self.transports = list(transports or ["websocket"])
        self.logger = logger
        self.sio = socketio.AsyncClient(
            reconnection=reconnection,
            logger=False,
            engineio_logger=False,
        )

    @property
    def connected(self) -> bool:
        return bool(getattr(self.sio, "connected", False))

    def on(self, event: str, handler: EventHandler) -> None:
        self.sio.on(event, handler=handler)

    async def connect(self) -> None:
        await self.sio.connect(
            self.base_url,
            auth={"token": self.token},
            transports=self.transports,
            wait_timeout=10,
        )

    async def disconnect(self) -> None:
        if self.connected:
            await self.sio.disconnect()

    async def join_channel(self, channel_id: str) -> Any:
        try:
            return await self.sio.call("channel:join", {"channelId": channel_id}, timeout=10)
        except Exception:
            # Some Socket.IO servers may not ack. Fall back to fire-and-forget.
            await self.sio.emit("channel:join", {"channelId": channel_id})
            return {"ok": True}

    async def leave_channel(self, channel_id: str) -> None:
        await self.sio.emit("channel:leave", {"channelId": channel_id})

    async def send_typing(self, channel_id: str, typing: bool = True) -> None:
        await self.sio.emit("message:typing", {"channelId": channel_id, "typing": typing})

    async def update_presence(self, status: str) -> None:
        await self.sio.emit("presence:update", {"status": status})

    async def update_activity(self, channel_id: str, activity: str | None) -> None:
        await self.sio.emit("presence:activity", {"channelId": channel_id, "activity": activity})

    async def send_message(self, payload: JsonDict) -> None:
        await self.sio.emit("message:send", payload)
