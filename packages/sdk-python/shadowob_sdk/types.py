"""Shadow SDK — typed data models mirroring the TypeScript SDK types."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class ShadowApiErrorBody:
    error: str | dict[str, Any]
    code: str | None = None
    required_amount: int | None = None
    balance: int | None = None
    shortfall: int | None = None
    next_action: str | None = None
    params: dict[str, Any] | None = None


@dataclass
class ShadowAddAgentsToServerResult:
    added: list[str] = field(default_factory=list)
    failed: list[dict[str, str]] = field(default_factory=list)


@dataclass
class ShadowMembershipTier:
    id: str
    level: int
    label: str
    capabilities: list[str] = field(default_factory=list)


@dataclass
class ShadowMembership:
    status: str
    tier: ShadowMembershipTier | dict[str, Any]
    level: int
    is_member: bool
    capabilities: list[str] = field(default_factory=list)
    member_since: str | None = None
    invite_code_id: str | None = None


@dataclass
class ShadowUser:
    id: str
    username: str
    email: str | None = None
    display_name: str | None = None
    avatar_url: str | None = None
    is_bot: bool = False
    agent_id: str | None = None
    membership: ShadowMembership | dict[str, Any] | None = None


@dataclass
class ShadowHomePlayCatalogItem:
    id: str
    image: str
    title: str
    title_en: str
    desc: str
    desc_en: str
    category: str
    category_en: str
    starts: str
    accent_color: str
    status: str
    hot: bool | None = None
    action: dict[str, Any] | None = None
    gates: dict[str, Any] | None = None
    template: dict[str, Any] | None = None
    materials: dict[str, Any] | None = None


@dataclass
class ShadowModelProxyModel:
    id: str
    object: str
    created: int
    owned_by: str


@dataclass
class ShadowModelProxyModelsResponse:
    object: str
    data: list[ShadowModelProxyModel | dict[str, Any]] = field(default_factory=list)


@dataclass
class ShadowModelProxyBilling:
    enabled: bool
    currency: str
    model: str
    models: list[str] = field(default_factory=list)
    shrimpMicrosPerCoin: int = 1_000_000
    shrimpPerCny: float = 20
    inputTokensPerShrimp: float | None = None
    outputTokensPerShrimp: float | None = None
    inputCacheHitCnyPerMillionTokens: float = 0.02
    inputCacheMissCnyPerMillionTokens: float = 1
    outputCnyPerMillionTokens: float = 2
    inputCacheHitShrimpPerMillionTokens: float = 0.4
    inputCacheMissShrimpPerMillionTokens: float = 20
    outputShrimpPerMillionTokens: float = 40


@dataclass
class ShadowServer:
    id: str
    name: str
    slug: str
    description: str | None = None
    icon_url: str | None = None
    banner_url: str | None = None
    is_public: bool = False


@dataclass
class ShadowChannel:
    id: str
    name: str
    type: str
    server_id: str
    description: str | None = None
    position: int | None = None
    is_private: bool | None = None
    is_member: bool | None = None


@dataclass
class ShadowChannelAccess:
    channel: ShadowChannel
    is_server_member: bool
    is_channel_member: bool
    can_manage: bool
    can_access: bool
    requires_approval: bool
    join_request_status: str | None = None
    join_request_id: str | None = None


@dataclass
class ShadowVoiceParticipant:
    id: str
    channel_id: str
    user_id: str
    uid: int
    screen_uid: int
    username: str
    display_name: str | None = None
    avatar_url: str | None = None
    is_bot: bool = False
    is_muted: bool = False
    is_deafened: bool = False
    is_speaking: bool = False
    is_screen_sharing: bool = False
    joined_at: str | None = None
    updated_at: str | None = None
    client_id: str | None = None


@dataclass
class ShadowVoiceCredentials:
    app_id: str
    channel_id: str
    agora_channel_name: str
    uid: int
    screen_uid: int
    token: str | None = None
    screen_token: str | None = None
    expires_at: str | None = None


@dataclass
class ShadowVoiceState:
    channel_id: str
    agora_channel_name: str
    participants: list[ShadowVoiceParticipant | dict[str, Any]] = field(default_factory=list)
    participant_count: int = 0
    empty_since: str | None = None
    grace_ends_at: str | None = None


@dataclass
class ShadowVoicePolicy:
    agent_id: str
    channel_id: str
    listen: bool = True
    auto_join: bool = False
    consume_audio: bool = True
    consume_screen_share: bool = True
    screenshot_interval_seconds: int | None = None


@dataclass
class ShadowServerAccess:
    server: ShadowServer
    is_member: bool
    can_manage: bool
    can_access: bool
    requires_approval: bool
    join_request_status: str | None = None
    join_request_id: str | None = None


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
class ShadowSignedMediaUrl:
    url: str
    expires_at: str


@dataclass
class ShadowServerAppTokenIntrospection:
    active: bool
    token_type: str | None = None
    iss: str | None = None
    aud: str | None = None
    sub: str | None = None
    scope: str | None = None
    client_id: str | None = None
    exp: int | None = None
    iat: int | None = None
    shadow: dict[str, Any] | None = None


@dataclass
class ShadowMessageMention:
    kind: str
    target_id: str
    token: str
    label: str
    source_token: str | None = None
    range: dict[str, int] | None = None
    server_id: str | None = None
    server_slug: str | None = None
    server_name: str | None = None
    channel_id: str | None = None
    channel_name: str | None = None
    app_id: str | None = None
    app_key: str | None = None
    app_name: str | None = None
    icon_url: str | None = None
    user_id: str | None = None
    username: str | None = None
    display_name: str | None = None
    avatar_url: str | None = None
    is_bot: bool | None = None
    is_private: bool | None = None


@dataclass
class ShadowMentionSuggestion:
    id: str
    kind: str
    target_id: str
    token: str
    label: str
    description: str | None = None
    server_id: str | None = None
    server_slug: str | None = None
    server_name: str | None = None
    channel_id: str | None = None
    channel_name: str | None = None
    app_id: str | None = None
    app_key: str | None = None
    app_name: str | None = None
    icon_url: str | None = None
    user_id: str | None = None
    username: str | None = None
    display_name: str | None = None
    avatar_url: str | None = None
    is_bot: bool | None = None
    is_private: bool | None = None


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
class ShadowMemberCreator:
    uid: str
    nickname: str
    username: str | None = None
    display_name: str | None = None
    avatar_url: str | None = None


@dataclass
class ShadowMember:
    user_id: str
    server_id: str
    role: str
    is_bot: bool | None = None
    uid: str | None = None
    nickname: str | None = None
    avatar: str | None = None
    status: str | None = None
    membership_tier: str | None = None
    membership_level: int | None = None
    is_member: bool | None = None
    total_online_seconds: int | None = None
    buddy_tag: str | None = None
    creator: ShadowMemberCreator | dict[str, Any] | None = None
    user: ShadowUser | None = None


@dataclass
class ShadowNotification:
    id: str
    user_id: str
    type: str
    kind: str | None
    title: str
    body: str | None
    is_read: bool
    created_at: str
    reference_id: str | None = None
    reference_type: str | None = None
    sender_id: str | None = None
    sender_avatar_url: str | None = None
    scope_server_id: str | None = None
    scope_channel_id: str | None = None
    aggregation_key: str | None = None
    aggregated_count: int | None = None
    last_aggregated_at: str | None = None
    metadata: dict[str, Any] | None = None
    expires_at: str | None = None


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
class ShadowUsageProviderSnapshot:
    provider: str
    amount_usd: float | None = None
    usage_label: str | None = None
    raw: str | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    total_tokens: int | None = None


@dataclass
class ShadowAgentUsageSnapshotInput:
    source: str | None = None
    model: str | None = None
    total_usd: float | None = None
    input_tokens: int | None = None
    output_tokens: int | None = None
    cache_read_tokens: int | None = None
    cache_write_tokens: int | None = None
    total_tokens: int | None = None
    providers: list[dict[str, Any] | ShadowUsageProviderSnapshot] = field(default_factory=list)
    raw: dict[str, Any] | None = None
    generated_at: str | None = None


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
class ShadowShop:
    id: str
    name: str
    is_enabled: bool
    scope_kind: str | None = None
    server_id: str | None = None
    owner_user_id: str | None = None
    visibility: str | None = None
    description: str | None = None


@dataclass
class ShadowCommerceOfferCardInput:
    kind: str
    offer_id: str
    id: str | None = None


@dataclass
class ShadowCommerceProductCard:
    id: str
    kind: str
    shop_id: str
    shop_scope: dict[str, Any]
    product_id: str
    snapshot: dict[str, Any]
    purchase: dict[str, Any]
    offer_id: str | None = None
    sku_id: str | None = None


@dataclass
class ShadowCommerceProductPickerGroup:
    key: str
    label_key: str
    shop_id: str
    shop_name: str
    shop_scope: dict[str, Any]
    cards: list[ShadowCommerceProductCard | dict[str, Any]] = field(default_factory=list)


@dataclass
class ShadowCommerceCheckoutPreview:
    offer: dict[str, Any]
    shop: dict[str, Any]
    product: dict[str, Any]
    viewer_state: str
    next_action: str
    primary_action: str | None = None
    display_state: dict[str, Any] | None = None
    entitlement: dict[str, Any] | None = None
    paid_file: dict[str, Any] | None = None
    deliverables: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class ShadowCommerceProductContext:
    product: dict[str, Any]
    shop: dict[str, Any]
    server: dict[str, Any] | None = None
    provider: dict[str, Any] | None = None
    buddy: dict[str, Any] | None = None
    offer: dict[str, Any] | None = None
    fulfillment: dict[str, Any] = field(default_factory=dict)
    refund: dict[str, Any] = field(default_factory=dict)
    credit: dict[str, Any] = field(default_factory=dict)
    links: dict[str, Any] = field(default_factory=dict)


@dataclass
class ShadowEntitlementProvisioning:
    status: str
    code: str
    provisioned_at: str | None = None
    checked_at: str | None = None
    resource_type: str | None = None
    resource_id: str | None = None
    capability: str | None = None


@dataclass
class ShadowEntitlement:
    id: str
    user_id: str
    resource_type: str
    resource_id: str
    capability: str
    status: str
    is_active: bool
    server_id: str | None = None
    shop_id: str | None = None
    order_id: str | None = None
    product_id: str | None = None
    offer_id: str | None = None
    scope_kind: str | None = None
    starts_at: str | None = None
    expires_at: str | None = None
    next_renewal_at: str | None = None
    cancelled_at: str | None = None
    revoked_at: str | None = None
    metadata: dict[str, Any] | None = None
    created_at: str | None = None
    updated_at: str | None = None
    shop: dict[str, Any] | None = None
    product: dict[str, Any] | None = None
    offer: dict[str, Any] | None = None
    paid_file: dict[str, Any] | None = None
    buyer: dict[str, Any] | None = None
    order: dict[str, Any] | None = None
    fulfillment_jobs: list[dict[str, Any]] | None = None


@dataclass
class ShadowCommunityAssetDefinition:
    id: str
    issuer_kind: str
    asset_type: str
    name: str
    giftable: bool
    transferable: bool
    consumable: bool
    revocable: bool
    status: str
    issuer_id: str | None = None
    shop_id: str | None = None
    description: str | None = None
    image_url: str | None = None
    expires_after_days: int | None = None
    metadata: dict[str, Any] | None = None
    created_at: str | None = None
    updated_at: str | None = None


@dataclass
class ShadowCommunityAssetGrant:
    id: str
    definition_id: str
    owner_user_id: str
    source_kind: str
    quantity: int
    remaining_quantity: int
    status: str
    source_id: str | None = None
    expires_at: str | None = None
    metadata: dict[str, Any] | None = None
    created_at: str | None = None
    updated_at: str | None = None


@dataclass
class ShadowCommunityAsset:
    grant: ShadowCommunityAssetGrant | dict[str, Any]
    definition: ShadowCommunityAssetDefinition | dict[str, Any]


@dataclass
class ShadowSettlementLine:
    id: str
    seller_user_id: str
    source_type: str
    source_id: str
    gross_amount: int
    platform_fee: int
    net_amount: int
    status: str
    shop_id: str | None = None
    available_at: str | None = None
    settled_at: str | None = None
    created_at: str | None = None
    updated_at: str | None = None


@dataclass
class ShadowOAuthCommerceEntitlementSummary:
    id: str
    status: str
    capability: str
    resource_type: str
    resource_id: str
    product_id: str | None = None
    shop_id: str | None = None
    order_id: str | None = None
    offer_id: str | None = None
    expires_at: str | None = None


@dataclass
class ShadowOAuthCommerceEntitlementAccess:
    allowed: bool
    status: str
    resource_type: str
    resource_id: str
    capability: str
    app: dict[str, Any]
    reason_code: str | None = None
    entitlement: ShadowOAuthCommerceEntitlementSummary | dict[str, Any] | None = None


@dataclass
class ShadowOAuthCommerceEntitlementRedemption:
    app_id: str
    resource_type: str
    resource_id: str
    capability: str
    idempotency_key: str
    redeemed_at: str
    metadata: dict[str, str | int | float | bool | None] | None = None


@dataclass
class ShadowOAuthCommerceEntitlementRedeemResult:
    redeemed: bool
    resource_type: str
    resource_id: str
    capability: str
    app: dict[str, Any]
    entitlement: ShadowOAuthCommerceEntitlementSummary | dict[str, Any]
    redemption: ShadowOAuthCommerceEntitlementRedemption | dict[str, Any]


@dataclass
class ShadowPaidFileOpenResult:
    grant: dict[str, Any]
    viewer_url: str


@dataclass
class ShadowProductMedia:
    url: str
    id: str | None = None
    type: str | None = None
    thumbnail_url: str | None = None
    position: int | None = None


@dataclass
class ShadowProductSku:
    id: str
    spec_values: list[str]
    price: int
    stock: int
    image_url: str | None = None
    sku_code: str | None = None
    is_active: bool | None = None


@dataclass
class ShadowProductEntitlementConfig:
    resource_type: str | None = None
    resource_id: str | None = None
    capability: str | None = None
    duration_seconds: int | None = None
    renewal_period_seconds: int | None = None
    privilege_description: str | None = None


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
    billing_mode: str | None = None


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


@dataclass
class ShadowCloudDeploymentBackup:
    id: str
    deployment_id: str = ""
    namespace: str = ""
    agent_id: str = ""
    sandbox_name: str | None = None
    pvc_name: str = ""
    driver: str = ""
    snapshot_name: str | None = None
    object_key: str | None = None
    status: str = ""
    phase: str = ""
    error: str | None = None
    expires_at: str | None = None
    created_at: str = ""
    updated_at: str = ""
