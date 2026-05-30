import { app } from 'electron'

type DesktopTextKey =
  | 'community'
  | 'settings'
  | 'preferences'
  | 'connector'
  | 'enableConnector'
  | 'addBuddy'
  | 'noConnectorConnections'
  | 'enableConnection'
  | 'disconnectConnection'
  | 'desktopPet'
  | 'quit'
  | 'documentation'
  | 'edit'
  | 'view'
  | 'window'
  | 'help'
  | 'readerSecure'
  | 'readerUnsupported'
  | 'readerSource'
  | 'readerFit'
  | 'readerActualSize'
  | 'readerZoomIn'
  | 'readerZoomOut'
  | 'readerDarkBackground'
  | 'readerLightBackground'
  | 'readerCheckerBackground'
  | 'readerLoading'
  | 'readerLoadFailed'

const dictionary: Record<string, Record<DesktopTextKey, string>> = {
  en: {
    community: 'Open Community',
    settings: 'Desktop Settings',
    preferences: 'Preferences',
    connector: 'Connector',
    enableConnector: 'Enable Connector',
    addBuddy: 'Create Buddy...',
    noConnectorConnections: 'No connected Buddy',
    enableConnection: 'Enable this connection',
    disconnectConnection: 'Disconnect',
    desktopPet: 'Desktop Pet',
    quit: 'Quit App',
    documentation: 'Documentation',
    edit: 'Edit',
    view: 'View',
    window: 'Window',
    help: 'Help',
    readerSecure: 'Opened with community authorization',
    readerUnsupported: 'This file can be opened with the default app.',
    readerSource: 'Source',
    readerFit: 'Fit',
    readerActualSize: '100%',
    readerZoomIn: 'Zoom in',
    readerZoomOut: 'Zoom out',
    readerDarkBackground: 'Dark background',
    readerLightBackground: 'Light background',
    readerCheckerBackground: 'Checker background',
    readerLoading: 'Loading file...',
    readerLoadFailed: 'Could not preview this file.',
  },
  'zh-cn': {
    community: '打开社区',
    settings: '虾豆桌面端设置',
    preferences: '偏好设置',
    connector: '连接器',
    enableConnector: '开启连接器',
    addBuddy: '创建 Buddy...',
    noConnectorConnections: '暂无已连接 Buddy',
    enableConnection: '开启这个连接',
    disconnectConnection: '断开连接',
    desktopPet: '桌面宠物',
    quit: '退出应用',
    documentation: '文档',
    edit: '编辑',
    view: '视图',
    window: '窗口',
    help: '帮助',
    readerSecure: '已使用社区登录态安全打开',
    readerUnsupported: '这个文件可以使用默认应用打开。',
    readerSource: '来源',
    readerFit: '适合窗口',
    readerActualSize: '100%',
    readerZoomIn: '放大',
    readerZoomOut: '缩小',
    readerDarkBackground: '深色背景',
    readerLightBackground: '浅色背景',
    readerCheckerBackground: '网格背景',
    readerLoading: '正在加载文件...',
    readerLoadFailed: '无法预览这个文件。',
  },
  'zh-tw': {
    community: '開啟社群',
    settings: '蝦豆桌面端設定',
    preferences: '偏好設定',
    connector: '連接器',
    enableConnector: '開啟連接器',
    addBuddy: '建立 Buddy...',
    noConnectorConnections: '尚無已連線 Buddy',
    enableConnection: '開啟此連線',
    disconnectConnection: '中斷連線',
    desktopPet: '桌面寵物',
    quit: '結束應用程式',
    documentation: '文件',
    edit: '編輯',
    view: '檢視',
    window: '視窗',
    help: '說明',
    readerSecure: '已使用社群登入狀態安全開啟',
    readerUnsupported: '此檔案可使用預設應用程式開啟。',
    readerSource: '來源',
    readerFit: '符合視窗',
    readerActualSize: '100%',
    readerZoomIn: '放大',
    readerZoomOut: '縮小',
    readerDarkBackground: '深色背景',
    readerLightBackground: '淺色背景',
    readerCheckerBackground: '格線背景',
    readerLoading: '正在載入檔案...',
    readerLoadFailed: '無法預覽此檔案。',
  },
  ja: {
    community: 'コミュニティを開く',
    settings: 'デスクトップ設定',
    preferences: '環境設定',
    connector: 'Connector',
    enableConnector: 'Connector を有効化',
    addBuddy: 'Buddy を作成...',
    noConnectorConnections: '接続済み Buddy はありません',
    enableConnection: 'この接続を有効化',
    disconnectConnection: '切断',
    desktopPet: 'デスクトップペット',
    quit: 'アプリを終了',
    documentation: 'ドキュメント',
    edit: '編集',
    view: '表示',
    window: 'ウィンドウ',
    help: 'ヘルプ',
    readerSecure: 'コミュニティ認証で開いています',
    readerUnsupported: 'このファイルは既定のアプリで開けます。',
    readerSource: 'ソース',
    readerFit: 'フィット',
    readerActualSize: '100%',
    readerZoomIn: '拡大',
    readerZoomOut: '縮小',
    readerDarkBackground: '暗い背景',
    readerLightBackground: '明るい背景',
    readerCheckerBackground: 'チェック背景',
    readerLoading: 'ファイルを読み込んでいます...',
    readerLoadFailed: 'このファイルをプレビューできません。',
  },
  ko: {
    community: '커뮤니티 열기',
    settings: '데스크톱 설정',
    preferences: '환경설정',
    connector: 'Connector',
    enableConnector: 'Connector 켜기',
    addBuddy: 'Buddy 만들기...',
    noConnectorConnections: '연결된 Buddy 없음',
    enableConnection: '이 연결 켜기',
    disconnectConnection: '연결 해제',
    desktopPet: '데스크톱 펫',
    quit: '앱 종료',
    documentation: '문서',
    edit: '편집',
    view: '보기',
    window: '창',
    help: '도움말',
    readerSecure: '커뮤니티 인증으로 열었습니다',
    readerUnsupported: '이 파일은 기본 앱으로 열 수 있습니다.',
    readerSource: '출처',
    readerFit: '맞춤',
    readerActualSize: '100%',
    readerZoomIn: '확대',
    readerZoomOut: '축소',
    readerDarkBackground: '어두운 배경',
    readerLightBackground: '밝은 배경',
    readerCheckerBackground: '체커 배경',
    readerLoading: '파일을 불러오는 중...',
    readerLoadFailed: '이 파일을 미리 볼 수 없습니다.',
  },
}

function localeKey(): string {
  const locale = app.getLocale().toLowerCase()
  if (locale.startsWith('zh-tw') || locale.startsWith('zh-hk') || locale.startsWith('zh-hant')) {
    return 'zh-tw'
  }
  if (locale.startsWith('zh')) return 'zh-cn'
  if (locale.startsWith('ja')) return 'ja'
  if (locale.startsWith('ko')) return 'ko'
  return 'en'
}

export function desktopText(key: DesktopTextKey): string {
  return dictionary[localeKey()]?.[key] ?? dictionary.en?.[key] ?? key
}
