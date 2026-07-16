import type { PluginCategory, PluginManifest } from '../plugins/types.js'

export const CONNECTOR_PRESENTATION_LOCALES = ['en', 'zh-CN', 'zh-TW', 'ja', 'ko'] as const
export type ConnectorPresentationLocale = (typeof CONNECTOR_PRESENTATION_LOCALES)[number]

export type ConnectorPresentation = {
  name: string
  description: string
}

const LOCALIZED_NAMES: Partial<Record<ConnectorPresentationLocale, Record<string, string>>> = {
  'zh-CN': {
    lark: '飞书 / Lark',
    dingtalk: '钉钉',
    alipay: '支付宝',
    yuque: '语雀',
    amap: '高德地图',
    'wechat-pay': '微信支付',
    'baidu-maps': '百度地图',
    oceanengine: '巨量引擎',
    'tencent-docs': '腾讯文档',
    'tencent-maps': '腾讯地图',
    coze: '扣子',
    wps: 'WPS / 金山文档',
    kuaidi100: '快递100',
    'taobao-aipaas': '淘宝开放平台 / 阿里云 AI PAAS',
    gitee: 'Gitee 码云',
    'baidu-appbuilder': '百度千帆 AppBuilder',
    'baidu-netdisk': '百度网盘',
    'wechat-miniprogram-skyline': '微信小程序 Skyline',
    'douyin-miniprogram': '抖音小程序',
    tapd: 'TAPD 腾讯敏捷产品研发平台',
    cnb: '腾讯云原生构建 CNB',
    'baidu-smartprogram': '百度智能小程序',
    'huawei-xiaoyi': '华为小艺',
    miclaw: '小米 MiClaw',
  },
  'zh-TW': {
    lark: 'Lark / 飛書',
    dingtalk: '釘釘',
    alipay: '支付寶',
    yuque: '語雀',
    amap: '高德地圖',
    'wechat-pay': '微信支付',
    'baidu-maps': '百度地圖',
    oceanengine: '巨量引擎',
    'tencent-docs': '騰訊文件',
    'tencent-maps': '騰訊地圖',
    coze: '扣子',
    wps: 'WPS / 金山文件',
    kuaidi100: '快遞100',
    'taobao-aipaas': '淘寶開放平台 / 阿里雲 AI PAAS',
    gitee: 'Gitee 碼雲',
    'baidu-appbuilder': '百度千帆 AppBuilder',
    'baidu-netdisk': '百度網盤',
    'wechat-miniprogram-skyline': '微信小程式 Skyline',
    'douyin-miniprogram': '抖音小程式',
    'baidu-smartprogram': '百度智慧小程式',
    'huawei-xiaoyi': '華為小藝',
    miclaw: '小米 MiClaw',
  },
}

const CATEGORY_COPY: Record<
  ConnectorPresentationLocale,
  Record<PluginCategory, (name: string) => string>
> = {
  en: {
    communication: (name) => `Connect ${name} so Buddy can work with messages and team content.`,
    productivity: (name) => `Connect ${name} so Buddy can find, create, and update work content.`,
    code: (name) => `Connect ${name} so Buddy can work with repositories, code, and changes.`,
    'ai-provider': (name) => `Connect ${name} so Buddy can use its models and AI services.`,
    database: (name) => `Connect ${name} so Buddy can query and update application data.`,
    search: (name) => `Connect ${name} so Buddy can search and retrieve current information.`,
    automation: (name) => `Connect ${name} so Buddy can run its tools and automated workflows.`,
    media: (name) => `Connect ${name} so Buddy can work with design and media assets.`,
    analytics: (name) => `Connect ${name} so Buddy can inspect campaign and analytics data.`,
    crm: (name) => `Connect ${name} so Buddy can work with customer and sales records.`,
    finance: (name) => `Connect ${name} so Buddy can work with payments and billing records.`,
    devops: (name) => `Connect ${name} so Buddy can inspect and operate deployed services.`,
    'project-management': (name) => `Connect ${name} so Buddy can manage projects and work items.`,
    email: (name) => `Connect ${name} so Buddy can work with audiences and email campaigns.`,
    calendar: (name) => `Connect ${name} so Buddy can work with calendars and schedules.`,
    other: (name) => `Connect ${name} so Buddy can use its tools and data.`,
  },
  'zh-CN': {
    communication: (name) => `连接 ${name}，让 Buddy 处理消息和团队内容。`,
    productivity: (name) => `连接 ${name}，让 Buddy 查找、创建和更新工作内容。`,
    code: (name) => `连接 ${name}，让 Buddy 处理代码仓库、代码和变更。`,
    'ai-provider': (name) => `连接 ${name}，让 Buddy 使用其中的模型和 AI 服务。`,
    database: (name) => `连接 ${name}，让 Buddy 查询和更新应用数据。`,
    search: (name) => `连接 ${name}，让 Buddy 检索最新信息。`,
    automation: (name) => `连接 ${name}，让 Buddy 运行其中的工具和自动化流程。`,
    media: (name) => `连接 ${name}，让 Buddy 处理设计稿和媒体素材。`,
    analytics: (name) => `连接 ${name}，让 Buddy 查看广告和分析数据。`,
    crm: (name) => `连接 ${name}，让 Buddy 处理客户和销售记录。`,
    finance: (name) => `连接 ${name}，让 Buddy 处理支付和账单记录。`,
    devops: (name) => `连接 ${name}，让 Buddy 查看和操作已部署的服务。`,
    'project-management': (name) => `连接 ${name}，让 Buddy 管理项目和工作项。`,
    email: (name) => `连接 ${name}，让 Buddy 处理受众和邮件营销活动。`,
    calendar: (name) => `连接 ${name}，让 Buddy 处理日历和日程。`,
    other: (name) => `连接 ${name}，让 Buddy 使用其中的工具和数据。`,
  },
  'zh-TW': {
    communication: (name) => `連接 ${name}，讓 Buddy 處理訊息和團隊內容。`,
    productivity: (name) => `連接 ${name}，讓 Buddy 尋找、建立和更新工作內容。`,
    code: (name) => `連接 ${name}，讓 Buddy 處理程式碼儲存庫、程式碼和變更。`,
    'ai-provider': (name) => `連接 ${name}，讓 Buddy 使用其中的模型和 AI 服務。`,
    database: (name) => `連接 ${name}，讓 Buddy 查詢和更新應用程式資料。`,
    search: (name) => `連接 ${name}，讓 Buddy 搜尋最新資訊。`,
    automation: (name) => `連接 ${name}，讓 Buddy 執行其中的工具和自動化流程。`,
    media: (name) => `連接 ${name}，讓 Buddy 處理設計稿和媒體素材。`,
    analytics: (name) => `連接 ${name}，讓 Buddy 查看廣告和分析資料。`,
    crm: (name) => `連接 ${name}，讓 Buddy 處理客戶和銷售記錄。`,
    finance: (name) => `連接 ${name}，讓 Buddy 處理付款和帳單記錄。`,
    devops: (name) => `連接 ${name}，讓 Buddy 查看和操作已部署的服務。`,
    'project-management': (name) => `連接 ${name}，讓 Buddy 管理專案和工作項目。`,
    email: (name) => `連接 ${name}，讓 Buddy 處理受眾和電子郵件行銷活動。`,
    calendar: (name) => `連接 ${name}，讓 Buddy 處理行事曆和日程。`,
    other: (name) => `連接 ${name}，讓 Buddy 使用其中的工具和資料。`,
  },
  ja: {
    communication: (name) =>
      `${name} と接続し、Buddy がメッセージやチームのコンテンツを扱えるようにします。`,
    productivity: (name) =>
      `${name} と接続し、Buddy が作業コンテンツを検索・作成・更新できるようにします。`,
    code: (name) => `${name} と接続し、Buddy がリポジトリ、コード、変更を扱えるようにします。`,
    'ai-provider': (name) =>
      `${name} と接続し、Buddy がモデルや AI サービスを利用できるようにします。`,
    database: (name) => `${name} と接続し、Buddy がアプリのデータを照会・更新できるようにします。`,
    search: (name) => `${name} と接続し、Buddy が最新情報を検索・取得できるようにします。`,
    automation: (name) => `${name} と接続し、Buddy がツールや自動化を実行できるようにします。`,
    media: (name) => `${name} と接続し、Buddy がデザインやメディア素材を扱えるようにします。`,
    analytics: (name) => `${name} と接続し、Buddy が広告や分析データを確認できるようにします。`,
    crm: (name) => `${name} と接続し、Buddy が顧客や営業の記録を扱えるようにします。`,
    finance: (name) => `${name} と接続し、Buddy が決済や請求の記録を扱えるようにします。`,
    devops: (name) =>
      `${name} と接続し、Buddy がデプロイ済みサービスを確認・操作できるようにします。`,
    'project-management': (name) =>
      `${name} と接続し、Buddy がプロジェクトや作業項目を管理できるようにします。`,
    email: (name) => `${name} と接続し、Buddy がオーディエンスやメール施策を扱えるようにします。`,
    calendar: (name) => `${name} と接続し、Buddy がカレンダーや予定を扱えるようにします。`,
    other: (name) => `${name} と接続し、Buddy がツールやデータを利用できるようにします。`,
  },
  ko: {
    communication: (name) => `${name}에 연결하여 Buddy가 메시지와 팀 콘텐츠를 다룰 수 있게 합니다.`,
    productivity: (name) =>
      `${name}에 연결하여 Buddy가 작업 콘텐츠를 찾고 만들고 업데이트할 수 있게 합니다.`,
    code: (name) => `${name}에 연결하여 Buddy가 저장소, 코드, 변경 사항을 다룰 수 있게 합니다.`,
    'ai-provider': (name) => `${name}에 연결하여 Buddy가 모델과 AI 서비스를 사용할 수 있게 합니다.`,
    database: (name) =>
      `${name}에 연결하여 Buddy가 앱 데이터를 조회하고 업데이트할 수 있게 합니다.`,
    search: (name) => `${name}에 연결하여 Buddy가 최신 정보를 검색하고 가져올 수 있게 합니다.`,
    automation: (name) => `${name}에 연결하여 Buddy가 도구와 자동화 작업을 실행할 수 있게 합니다.`,
    media: (name) => `${name}에 연결하여 Buddy가 디자인과 미디어 자산을 다룰 수 있게 합니다.`,
    analytics: (name) => `${name}에 연결하여 Buddy가 광고와 분석 데이터를 확인할 수 있게 합니다.`,
    crm: (name) => `${name}에 연결하여 Buddy가 고객과 영업 기록을 다룰 수 있게 합니다.`,
    finance: (name) => `${name}에 연결하여 Buddy가 결제와 청구 기록을 다룰 수 있게 합니다.`,
    devops: (name) => `${name}에 연결하여 Buddy가 배포된 서비스를 확인하고 운영할 수 있게 합니다.`,
    'project-management': (name) =>
      `${name}에 연결하여 Buddy가 프로젝트와 작업 항목을 관리할 수 있게 합니다.`,
    email: (name) => `${name}에 연결하여 Buddy가 대상 고객과 이메일 캠페인을 다룰 수 있게 합니다.`,
    calendar: (name) => `${name}에 연결하여 Buddy가 캘린더와 일정을 다룰 수 있게 합니다.`,
    other: (name) => `${name}에 연결하여 Buddy가 도구와 데이터를 사용할 수 있게 합니다.`,
  },
}

export function buildConnectorLocalizations(manifest: PluginManifest) {
  return Object.fromEntries(
    CONNECTOR_PRESENTATION_LOCALES.map((locale) => {
      const name = LOCALIZED_NAMES[locale]?.[manifest.id] ?? manifest.name
      return [
        locale,
        {
          name,
          description: CATEGORY_COPY[locale][manifest.category](name),
        } satisfies ConnectorPresentation,
      ]
    }),
  ) as Record<ConnectorPresentationLocale, ConnectorPresentation>
}

export function normalizeConnectorPresentationLocale(
  locale?: string | null,
): ConnectorPresentationLocale {
  const normalized = locale?.trim().replace('_', '-').toLowerCase() ?? ''
  if (normalized.startsWith('zh-tw') || normalized.startsWith('zh-hk')) return 'zh-TW'
  if (normalized.startsWith('zh')) return 'zh-CN'
  if (normalized.startsWith('ja')) return 'ja'
  if (normalized.startsWith('ko')) return 'ko'
  return 'en'
}
