"""Shadow SDK — typed data models mirroring the TypeScript SDK types."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class ShadowUser:
    id: str
    username: str
    display_name: str | None = None
    avatar_url: str | None = None
    is_bot: bool = False
    agent_id: str | None = None


@dataclass
class ShadowServer:
    id: str
    name: str
    slug: str
    description: str | None = None
    icon_url: str | None = None
    banner_url: str | None = None
    homepage_html: str | None = None
    is_public: bool = False


@dataclass
class ShadowChannel:
    id: str
    name: str
    type: str
    server_id: str
    description: str | None = None
    position: int | None = None


@dataclass
class ShadowAttachment:
    id: str
    filename: str
    url: str
    content_type: str
    size: int
    width: int | None = None
    height: int | None = None
    workspace_node_id: str | None = None


@dataclass
class ShadowMessage:
    id: str
    content: str
    channel_id: str
    author_id: str
    created_at: str
    updated_at: str
    thread_id: str | None = None
    reply_to_id: str | None = None
    is_pinned: bool = False
    author: dict[str, Any] | None = None
    attachments: list[dict[str, Any] | ShadowAttachment] = field(default_factory=list)
    metadata: dict[str, Any] | None = None


@dataclass
class ShadowInteractiveActionInput:
    block_id: str
    action_id: str
    value: str | None = None
    label: str | None = None
    values: dict[str, str] | None = None


@dataclass
class ShadowThread:
    id: str
    name: str
    channel_id: str
    parent_message_id: str
    created_at: str


@dataclass
class ShadowMember:
    user_id: str
    server_id: str
    role: str
    user: ShadowUser | None = None


@dataclass
class ShadowDmChannel:
    id: str
    user1_id: str
    user2_id: str
    created_at: str


@dataclass
class ShadowNotification:
    id: str
    user_id: str
    type: str
    title: str
    body: str
    is_read: bool
    created_at: str
    reference_id: str | None = None
    reference_type: str | None = None


@dataclass
class ShadowInviteCode:
    id: str
    code: str
    created_by: str
    is_active: bool
    created_at: str
    used_by: str | None = None
    used_at: str | None = None
    note: str | None = None


@dataclass
class ShadowCloudProviderModel:
    id: str
    name: str | None = None
    tags: list[str] = field(default_factory=list)
    context_window: int | None = None
    max_tokens: int | None = None
    cost: dict[str, float] | None = None
    capabilities: dict[str, bool] | None = None


@dataclass
class ShadowCloudProviderProfile:
    id: str
    provider_id: str
    name: str
    scope: str
    enabled: bool
    config: dict[str, Any] = field(default_factory=dict)
    env_vars: list[dict[str, Any]] = field(default_factory=list)
    updated_at: str | None = None


@dataclass
class ShadowSlashCommand:
    name: str
    description: str | None = None
    aliases: list[str] = field(default_factory=list)
    pack_id: str | None = None
    source_path: str | None = None
    interaction: dict[str, Any] | None = None


@dataclass
class ShadowChannelSlashCommand(ShadowSlashCommand):
    agent_id: str = ""
    bot_user_id: str = ""
    bot_username: str = ""
    bot_display_name: str | None = None


@dataclass
class ShadowFriendship:
    id: str
    user_id: str
    friend_id: str
    status: str
    created_at: str
    user: ShadowUser | None = None
    friend: ShadowUser | None = None


@dataclass
class ShadowListing:
    id: str
    agent_id: str
    title: str
    description: str
    price_per_hour: float
    currency: str
    tags: list[str]
    is_active: bool
    created_at: str


@dataclass
class ShadowContract:
    id: str
    listing_id: str
    tenant_id: str
    owner_id: str
    status: str
    started_at: str
    expires_at: str
    total_cost: float
    created_at: str


@dataclass
class ShadowProduct:
    id: str
    shop_id: str
    name: str
    price: float
    currency: str
    stock: int
    status: str
    images: list[str]
    created_at: str
    category_id: str | None = None
    description: str | None = None


@dataclass
class ShadowOrder:
    id: str
    shop_id: str
    buyer_id: str
    status: str
    total_amount: float
    currency: str
    items: list[dict[str, Any]]
    created_at: str
