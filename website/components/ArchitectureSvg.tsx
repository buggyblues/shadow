export function ArchitectureSvg({ lang = 'en' }: { lang?: 'en' | 'zh' }) {
  const t =
    lang === 'zh'
      ? {
          owner: '你 (Owner)',
          owns: '拥有',
          creates: '创建',
          buddies: 'AI 搭子们',
          buddy1: 'AI 搭子 1',
          buddy2: 'AI 搭子 2',
          server: '服务器 (Server)',
          workspace: '工作空间 Workspace',
          workspaceDesc: '共享文件和上下文',
          channel1: '频道 1',
          channel2: '频道 2',
          channelN: '频道 N',
          shop: '店铺 Shop',
          shopDesc: '知识/课程/视频/设计',
          apps: '应用 Apps',
          appsDesc: 'Buddy开发的服务/游戏',
          market: 'Buddy Market',
          marketDesc: '租赁 AI 搭子',
          members: '社区成员',
          person: '成员',
          renters: '租户',
          renter: '租户',
          dialogue: '对话',
          sharedCtx: '共享上下文',
          genWorks: '生成作品',
          upload: '上传资料',
          listWorks: '作品上架',
          sellWorks: '售卖',
          develop: '开发',
          provideService: '提供服务',
          listRent: '上架出租',
          rent: '租赁',
          getAccess: '获得使用权',
        }
      : {
          owner: 'You (Owner)',
          owns: 'Owns',
          creates: 'Creates',
          buddies: 'AI Buddies',
          buddy1: 'AI Buddy 1',
          buddy2: 'AI Buddy 2',
          server: 'Server',
          workspace: 'Workspace',
          workspaceDesc: 'Shared files & context',
          channel1: 'Channel 1',
          channel2: 'Channel 2',
          channelN: 'Channel N',
          shop: 'Shop',
          shopDesc: 'Knowledge / Courses / Design',
          apps: 'Apps',
          appsDesc: 'Services & games by Buddies',
          market: 'Buddy Market',
          marketDesc: 'Rent AI Buddies',
          members: 'Community Members',
          person: 'Member',
          renters: 'Renters',
          renter: 'Renter',
          dialogue: 'Chat',
          sharedCtx: 'Shared context',
          genWorks: 'Generate works',
          upload: 'Upload files',
          listWorks: 'List works',
          sellWorks: 'Sell',
          develop: 'Develop',
          provideService: 'Provide service',
          listRent: 'List for rent',
          rent: 'Rent',
          getAccess: 'Get access',
        }

  /*
    Clean layout — 3 columns, top-to-bottom flow:

    LEFT COLUMN          CENTER (Server box)              RIGHT COLUMN
    ┌────────┐           ┌──────────────────────┐
    │ Owner  │──creates─►│  Server              │
    └────────┘           │                      │
        │ owns           │  [Workspace]         │
        ▼                │                      │         ┌──────────┐
    ┌────────┐  ctx/chat │  [Ch1] [Ch2] [ChN]   │◄─chat──│ Members  │
    │Buddies │──────────►│                      │─────────│          │
    └────────┘  develop  │  [Shop] [Apps]       │ sell/   └──────────┘
                ────────►│                      │ service
                         │  [Market]            │         ┌──────────┐
                         └──────────────────────┘◄─rent──│ Renters  │
                                                          └──────────┘
    
    Buddies connect LEFT→CENTER.
    Members connect RIGHT→CENTER.
    Renters connect BOTTOM-RIGHT↑CENTER.
    No lines cross because each group only touches the server from its own side.
  */
  return (
    <svg
      viewBox="0 0 860 460"
      className="w-full"
      style={{
        maxWidth: '860px',
        margin: '0 auto',
        display: 'block',
        fontFamily: "'Nunito', 'ZCOOL KuaiLe', sans-serif",
      }}
    >
      <defs>
        <marker
          id="arrow"
          viewBox="0 0 10 6"
          refX="10"
          refY="3"
          markerWidth="8"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,3 L0,6 Z" fill="var(--shadow-text-dim, #94a3b8)" />
        </marker>
        <marker
          id="arrowCyan"
          viewBox="0 0 10 6"
          refX="10"
          refY="3"
          markerWidth="8"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,3 L0,6 Z" fill="#22d3ee" />
        </marker>
        <marker
          id="arrowTeal"
          viewBox="0 0 10 6"
          refX="10"
          refY="3"
          markerWidth="8"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,3 L0,6 Z" fill="#14b8a6" />
        </marker>
        <marker
          id="arrowYellow"
          viewBox="0 0 10 6"
          refX="10"
          refY="3"
          markerWidth="8"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,3 L0,6 Z" fill="#eab308" />
        </marker>
        <marker
          id="arrowRed"
          viewBox="0 0 10 6"
          refX="10"
          refY="3"
          markerWidth="8"
          markerHeight="5"
          orient="auto-start-reverse"
        >
          <path d="M0,0 L10,3 L0,6 Z" fill="#e94560" />
        </marker>
        <filter id="cardShadow" x="-4%" y="-4%" width="108%" height="112%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="rgba(0,0,0,0.12)" />
        </filter>
      </defs>

      {/* ---- SERVER background (center) ---- */}
      <rect
        x="220"
        y="10"
        width="420"
        height="370"
        rx="18"
        fill="var(--shadow-card-bg, #f8fafc)"
        stroke="var(--shadow-card-border, #e2e8f0)"
        strokeWidth="2"
      />
      <text
        x="430"
        y="38"
        textAnchor="middle"
        fontSize="14"
        fontWeight="700"
        fill="var(--shadow-text-dim, #94a3b8)"
      >
        {t.server}
      </text>

      {/* ---- OWNER (top-left) ---- */}
      <rect
        x="20"
        y="10"
        width="140"
        height="40"
        rx="12"
        fill="#e94560"
        filter="url(#cardShadow)"
      />
      <text x="90" y="35" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff">
        {t.owner}
      </text>

      {/* ---- BUDDIES (left-center) ---- */}
      <rect
        x="10"
        y="115"
        width="190"
        height="120"
        rx="14"
        fill="var(--shadow-card-bg, #f0f9ff)"
        stroke="#0ea5e9"
        strokeWidth="2"
        strokeDasharray="6 3"
      />
      <text x="105" y="140" textAnchor="middle" fontSize="12" fontWeight="700" fill="#0ea5e9">
        {t.buddies}
      </text>
      <rect x="22" y="150" width="80" height="34" rx="8" fill="#0ea5e9" filter="url(#cardShadow)" />
      <text x="62" y="172" textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">
        🐱 {t.buddy1}
      </text>
      <rect
        x="112"
        y="150"
        width="80"
        height="34"
        rx="8"
        fill="#0ea5e9"
        filter="url(#cardShadow)"
      />
      <text x="152" y="172" textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">
        🐱 {t.buddy2}
      </text>
      <text x="105" y="210" textAnchor="middle" fontSize="9" fill="var(--shadow-text-dim, #94a3b8)">
        {t.genWorks}
      </text>

      {/* ---- WORKSPACE (inside Server, row 1) ---- */}
      <rect
        x="250"
        y="56"
        width="190"
        height="50"
        rx="10"
        fill="var(--shadow-card-bg, #f8fafc)"
        stroke="var(--shadow-card-border, #cbd5e1)"
        strokeWidth="1.5"
        filter="url(#cardShadow)"
      />
      <text
        x="345"
        y="77"
        textAnchor="middle"
        fontSize="12"
        fontWeight="700"
        fill="var(--shadow-text, #1e293b)"
      >
        {t.workspace}
      </text>
      <text x="345" y="95" textAnchor="middle" fontSize="10" fill="var(--shadow-text-dim, #94a3b8)">
        {t.workspaceDesc}
      </text>

      {/* ---- CHANNELS (inside Server, row 2) ---- */}
      <rect
        x="250"
        y="126"
        width="110"
        height="32"
        rx="8"
        fill="var(--shadow-card-bg, #f8fafc)"
        stroke="var(--shadow-card-border, #cbd5e1)"
        strokeWidth="1.5"
      />
      <text
        x="305"
        y="147"
        textAnchor="middle"
        fontSize="11"
        fontWeight="600"
        fill="var(--shadow-text, #1e293b)"
      >
        {t.channel1}
      </text>
      <rect
        x="370"
        y="126"
        width="110"
        height="32"
        rx="8"
        fill="var(--shadow-card-bg, #f8fafc)"
        stroke="var(--shadow-card-border, #cbd5e1)"
        strokeWidth="1.5"
      />
      <text
        x="425"
        y="147"
        textAnchor="middle"
        fontSize="11"
        fontWeight="600"
        fill="var(--shadow-text, #1e293b)"
      >
        {t.channel2}
      </text>
      <rect
        x="490"
        y="126"
        width="110"
        height="32"
        rx="8"
        fill="var(--shadow-card-bg, #f8fafc)"
        stroke="var(--shadow-card-border, #cbd5e1)"
        strokeWidth="1.5"
      />
      <text
        x="545"
        y="147"
        textAnchor="middle"
        fontSize="11"
        fontWeight="600"
        fill="var(--shadow-text, #1e293b)"
      >
        {t.channelN}
      </text>

      {/* ---- SHOP (inside Server, row 3 left) ---- */}
      <rect
        x="240"
        y="190"
        width="120"
        height="50"
        rx="10"
        fill="#fde68a"
        stroke="#facc15"
        strokeWidth="1.5"
        filter="url(#cardShadow)"
      />
      <text x="300" y="212" textAnchor="middle" fontSize="12" fontWeight="700" fill="#1a1a2e">
        {t.shop}
      </text>
      <text x="300" y="228" textAnchor="middle" fontSize="9" fill="#78716c">
        {t.shopDesc}
      </text>

      {/* ---- APPS (inside Server, row 3 center) ---- */}
      <rect
        x="370"
        y="190"
        width="120"
        height="50"
        rx="10"
        fill="#e94560"
        stroke="#dc2626"
        strokeWidth="1.5"
        filter="url(#cardShadow)"
      />
      <text x="430" y="212" textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">
        {t.apps}
      </text>
      <text x="430" y="228" textAnchor="middle" fontSize="9" fill="rgba(255,255,255,0.7)">
        {t.appsDesc}
      </text>

      {/* ---- MARKET (inside Server, row 4) ---- */}
      <rect
        x="340"
        y="270"
        width="180"
        height="50"
        rx="10"
        fill="#4ecdc4"
        stroke="#14b8a6"
        strokeWidth="1.5"
        filter="url(#cardShadow)"
      />
      <text x="430" y="292" textAnchor="middle" fontSize="12" fontWeight="700" fill="#1a1a2e">
        {t.market}
      </text>
      <text x="430" y="308" textAnchor="middle" fontSize="9" fill="#1a1a2e">
        {t.marketDesc}
      </text>

      {/* ---- MEMBERS (right-center) ---- */}
      <rect
        x="660"
        y="90"
        width="190"
        height="98"
        rx="14"
        fill="var(--shadow-card-bg, #f0f9ff)"
        stroke="var(--shadow-card-border, #cbd5e1)"
        strokeWidth="2"
        strokeDasharray="6 3"
      />
      <text
        x="755"
        y="116"
        textAnchor="middle"
        fontSize="12"
        fontWeight="700"
        fill="var(--shadow-text-dim, #94a3b8)"
      >
        {t.members}
      </text>
      <rect
        x="680"
        y="130"
        width="70"
        height="32"
        rx="8"
        fill="var(--shadow-card-bg, #f1f5f9)"
        stroke="var(--shadow-card-border, #cbd5e1)"
        strokeWidth="1.5"
      />
      <text
        x="715"
        y="151"
        textAnchor="middle"
        fontSize="10"
        fontWeight="600"
        fill="var(--shadow-text, #475569)"
      >
        👤 {t.person}
      </text>
      <rect
        x="762"
        y="130"
        width="70"
        height="32"
        rx="8"
        fill="var(--shadow-card-bg, #f1f5f9)"
        stroke="var(--shadow-card-border, #cbd5e1)"
        strokeWidth="1.5"
      />
      <text
        x="797"
        y="151"
        textAnchor="middle"
        fontSize="10"
        fontWeight="600"
        fill="var(--shadow-text, #475569)"
      >
        👤 {t.person}
      </text>

      {/* ---- RENTERS (bottom-right) ---- */}
      <rect
        x="660"
        y="290"
        width="190"
        height="80"
        rx="14"
        fill="var(--shadow-card-bg, #f0f9ff)"
        stroke="var(--shadow-card-border, #cbd5e1)"
        strokeWidth="2"
        strokeDasharray="6 3"
      />
      <text
        x="755"
        y="318"
        textAnchor="middle"
        fontSize="12"
        fontWeight="700"
        fill="var(--shadow-text-dim, #94a3b8)"
      >
        {t.renters}
      </text>
      <rect
        x="710"
        y="332"
        width="80"
        height="30"
        rx="8"
        fill="var(--shadow-card-bg, #f1f5f9)"
        stroke="var(--shadow-card-border, #cbd5e1)"
        strokeWidth="1.5"
      />
      <text
        x="750"
        y="352"
        textAnchor="middle"
        fontSize="10"
        fontWeight="600"
        fill="var(--shadow-text, #475569)"
      >
        👤 {t.renter}
      </text>

      {/* ===== CONNECTIONS ===== */}

      {/* Owner → creates Server (right) */}
      <line
        x1="160"
        y1="30"
        x2="218"
        y2="30"
        stroke="var(--shadow-text-dim, #94a3b8)"
        strokeWidth="1.5"
        markerEnd="url(#arrow)"
      />
      <text x="188" y="23" textAnchor="middle" fontSize="9" fill="var(--shadow-text-dim, #94a3b8)">
        {t.creates}
      </text>

      {/* Owner → owns Buddies (down) */}
      <line
        x1="90"
        y1="50"
        x2="90"
        y2="113"
        stroke="var(--shadow-text-dim, #94a3b8)"
        strokeWidth="1.5"
        markerEnd="url(#arrow)"
      />
      <text x="105" y="84" fontSize="9" fill="var(--shadow-text-dim, #94a3b8)">
        {t.owns}
      </text>

      {/* Buddies → Workspace (shared context — right into server) */}
      <line
        x1="200"
        y1="150"
        x2="248"
        y2="82"
        stroke="#22d3ee"
        strokeWidth="1.5"
        markerEnd="url(#arrowCyan)"
      />
      <text x="218" y="108" fontSize="8" fill="#22d3ee">
        {t.sharedCtx}
      </text>

      {/* Buddies → Channels (chat — right into server) */}
      <line
        x1="200"
        y1="168"
        x2="248"
        y2="142"
        stroke="#22d3ee"
        strokeWidth="1.2"
        markerEnd="url(#arrowCyan)"
      />
      <text x="218" y="162" fontSize="8" fill="#22d3ee">
        {t.dialogue}
      </text>

      {/* Buddies → Apps (develop — route below buddy box, enter server left side, go to Apps) */}
      <path
        d="M 105 235 L 105 260 Q 105 270 125 270 L 230 270 L 368 220"
        fill="none"
        stroke="var(--shadow-text-dim, #94a3b8)"
        strokeWidth="1.2"
        markerEnd="url(#arrow)"
      />
      <text x="175" y="264" fontSize="8" fill="var(--shadow-text-dim, #94a3b8)">
        {t.develop}
      </text>

      {/* Buddies → Market (list for rent — route below server, enter from bottom) */}
      <path
        d="M 105 235 L 105 400 Q 105 420 140 420 L 410 420 Q 430 420 430 400 L 430 322"
        fill="none"
        stroke="var(--shadow-text-dim, #94a3b8)"
        strokeWidth="1.2"
        strokeDasharray="4 3"
        markerEnd="url(#arrow)"
      />
      <text x="270" y="416" fontSize="8" fill="var(--shadow-text-dim, #94a3b8)">
        {t.listRent}
      </text>

      {/* Workspace → Shop (down, inside server) */}
      <line
        x1="310"
        y1="106"
        x2="300"
        y2="188"
        stroke="var(--shadow-text-dim, #94a3b8)"
        strokeWidth="1.2"
        markerEnd="url(#arrow)"
      />
      <text x="294" y="152" fontSize="8" fill="var(--shadow-text-dim, #94a3b8)">
        {t.listWorks}
      </text>

      {/* Members → Channels (left into server) */}
      <line
        x1="660"
        y1="150"
        x2="602"
        y2="142"
        stroke="#22d3ee"
        strokeWidth="1.2"
        markerEnd="url(#arrowCyan)"
      />
      <text x="634" y="140" fontSize="8" fill="#22d3ee">
        {t.dialogue}
      </text>

      {/* Members → Workspace (route above channels into server) */}
      <path
        d="M 660 110 L 642 80 L 442 80"
        fill="none"
        stroke="var(--shadow-text-dim, #94a3b8)"
        strokeWidth="1.2"
        markerEnd="url(#arrow)"
      />
      <text x="560" y="88" fontSize="8" fill="var(--shadow-text-dim, #94a3b8)">
        {t.upload}
      </text>

      {/* Shop → Members (sell — exit server right, above market) */}
      <path
        d="M 360 205 L 640 205 Q 650 205 650 195 L 650 170 L 658 170"
        fill="none"
        stroke="#eab308"
        strokeWidth="1.5"
        markerEnd="url(#arrowYellow)"
      />
      <text x="560" y="198" fontSize="8" fill="#eab308">
        {t.sellWorks}
      </text>

      {/* Apps → Members (provide service — exit server right, below shop arrow) */}
      <path
        d="M 490 225 L 640 225 Q 650 225 650 210 L 658 188"
        fill="none"
        stroke="#e94560"
        strokeWidth="1.5"
        markerEnd="url(#arrowRed)"
      />
      <text x="560" y="238" fontSize="8" fill="#e94560">
        {t.provideService}
      </text>

      {/* Renters → Market (rent — enter server from right) */}
      <path
        d="M 660 310 L 642 310 Q 640 310 640 300 L 640 295 L 522 295"
        fill="none"
        stroke="#14b8a6"
        strokeWidth="1.5"
        markerEnd="url(#arrowTeal)"
      />
      <text x="596" y="304" fontSize="8" fill="#14b8a6">
        {t.rent}
      </text>

      {/* Market → Renters (get access — exit server right, dashed) */}
      <path
        d="M 520 310 L 640 335 Q 642 336 644 336 L 658 336"
        fill="none"
        stroke="#14b8a6"
        strokeWidth="1.2"
        strokeDasharray="4 3"
        markerEnd="url(#arrowTeal)"
      />
      <text x="586" y="332" fontSize="8" fill="#14b8a6">
        {t.getAccess}
      </text>

      {/* Renter → Buddy (dialogue — route below server) */}
      <path
        d="M 660 360 Q 400 450 105 235"
        fill="none"
        stroke="#22d3ee"
        strokeWidth="1.2"
        strokeDasharray="4 3"
        markerEnd="url(#arrowCyan)"
      />
      <text x="380" y="430" fontSize="8" fill="#22d3ee">
        {t.dialogue}
      </text>
    </svg>
  )
}
