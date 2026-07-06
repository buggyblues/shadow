import { MermaidDiagram } from './MermaidDiagram'

const ZH_DIAGRAM = `flowchart TB
    Admin(["管理员"])
    Visitor(["游客"])

    subgraph SV["空间 Space"]
        Desktop["空间桌面\\n公告 / 互动组件 / 入口"]
        CH["频道\\n交流与讨论"]
        WS["工作区\\n文件与协作产出"]
        Apps["空间应用\\n共享工具与互动体验"]
        Content["分享内容\\n攻略 / 教程 / 文件 / 应用"]
    end

    subgraph Buddies["Buddy 服务"]
        B1["Buddy 1"]
        B2["Buddy 2"]
        Cloud["云电脑\\n7/24 运行环境"]
    end

    subgraph Members["社区空间成员"]
        M1["成员"]
        M2["成员"]
    end

    Admin -->|摆放| Desktop
    Visitor -->|查看| Desktop
    Desktop -->|进入| CH
    Desktop -->|打开| WS
    Desktop -->|启动| Apps
    Desktop -->|联系| Buddies
    Members -->|交流| CH
    Members -->|保存| WS
    Members -->|分享| Content
    Content -->|展示| Desktop
    Apps -->|读取 / 产出| WS
    Buddies -->|服务成员| Members
    Buddies <-->|空间上下文| CH
    Buddies <-->|文件与结果| WS
    B1 --> Cloud
    B2 --> Cloud

    classDef owner fill:#ef4444,stroke:#dc2626,color:#fff
    classDef buddy fill:#0891b2,stroke:#0e7490,color:#fff
    classDef ws fill:#1e3a5f,stroke:#2563eb,color:#e2e8f0
    classDef channel fill:#374151,stroke:#4b5563,color:#d1d5db
    classDef apps fill:#dc2626,stroke:#b91c1c,color:#fff
    classDef market fill:#0d9488,stroke:#0f766e,color:#fff
    classDef member fill:#374151,stroke:#4b5563,color:#d1d5db

    class Admin owner
    class Visitor,M1,M2 member
    class B1,B2,Cloud buddy
    class WS,Desktop ws
    class CH channel
    class Apps apps
    class Content market`

const EN_DIAGRAM = `flowchart TB
    Admin(["Admin"])
    Visitor(["Visitor"])

    subgraph SV["Space"]
        Desktop["Community desktop\\nAnnouncements / widgets / entry points"]
        CH["Channels\\nConversation and discussion"]
        WS["Workspace\\nFiles and collaborative outputs"]
        Apps["Community apps\\nShared tools and interactive experiences"]
        Content["Shared content\\nGuides / tutorials / files / apps"]
    end

    subgraph Buddies["Buddy services"]
        B1["Buddy 1"]
        B2["Buddy 2"]
        Cloud["Cloud computer\\n24/7 runtime"]
    end

    subgraph Members["Community members"]
        M1["Member"]
        M2["Member"]
    end

    Admin -->|place| Desktop
    Visitor -->|view| Desktop
    Desktop -->|enter| CH
    Desktop -->|open| WS
    Desktop -->|launch| Apps
    Desktop -->|contact| Buddies
    Members -->|talk| CH
    Members -->|save| WS
    Members -->|share| Content
    Content -->|display| Desktop
    Apps -->|read / produce| WS
    Buddies -->|serve members| Members
    Buddies <-->|community context| CH
    Buddies <-->|files and results| WS
    B1 --> Cloud
    B2 --> Cloud

    classDef owner fill:#ef4444,stroke:#dc2626,color:#fff
    classDef buddy fill:#0891b2,stroke:#0e7490,color:#fff
    classDef ws fill:#1e3a5f,stroke:#2563eb,color:#e2e8f0
    classDef channel fill:#374151,stroke:#4b5563,color:#d1d5db
    classDef apps fill:#dc2626,stroke:#b91c1c,color:#fff
    classDef market fill:#0d9488,stroke:#0f766e,color:#fff
    classDef member fill:#374151,stroke:#4b5563,color:#d1d5db

    class Admin owner
    class Visitor,M1,M2 member
    class B1,B2,Cloud buddy
    class WS,Desktop ws
    class CH channel
    class Apps apps
    class Content market`

export function ArchitectureSvg({ lang = 'en' }: { lang?: 'en' | 'zh' }) {
  return <MermaidDiagram diagram={lang === 'zh' ? ZH_DIAGRAM : EN_DIAGRAM} />
}
