export function DashboardPage() {
  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100 flex items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-4xl font-bold">🛡️ Shadow Admin</h1>
        <p className="text-zinc-400 text-lg">管理后台 — 开发中</p>
        <div className="flex gap-4 justify-center text-sm text-zinc-500">
          <span>用户管理</span>
          <span>·</span>
          <span>服务器管理</span>
          <span>·</span>
          <span>数据统计</span>
        </div>
      </div>
    </div>
  )
}
