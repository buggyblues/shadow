import { useEffect, useState } from 'react'
import { apiFetch, type Channel, type Message, type Server } from '../lib/admin-api'

export function ServersTab() {
  const [servers, setServers] = useState<Server[]>([])
  const [selectedServer, setSelectedServer] = useState<Server | null>(null)
  const [channels, setChannels] = useState<Channel[]>([])
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [editingServer, setEditingServer] = useState<Server | null>(null)
  const [editForm, setEditForm] = useState({ name: '', slug: '', description: '', isPublic: false })

  const loadServers = () =>
    apiFetch<Server[]>('/servers')
      .then(setServers)
      .catch(() => {})
  const loadChannels = (id: string) =>
    apiFetch<Channel[]>(`/servers/${id}/channels`)
      .then(setChannels)
      .catch(() => {})
  const loadMessages = (sid: string, cid: string) =>
    apiFetch<Message[]>(`/servers/${sid}/channels/${cid}/messages`)
      .then(setMessages)
      .catch(() => {})

  useEffect(() => {
    loadServers()
  }, [])

  const openServer = (s: Server) => {
    setSelectedServer(s)
    setSelectedChannel(null)
    setMessages([])
    loadChannels(s.id)
  }

  const selectChannel = (ch: Channel) => {
    setSelectedChannel(ch)
    if (selectedServer) loadMessages(selectedServer.id, ch.id)
  }

  const back = () => {
    setSelectedServer(null)
    setChannels([])
    setSelectedChannel(null)
    setMessages([])
  }
  const backToChannels = () => {
    setSelectedChannel(null)
    setMessages([])
  }

  const deleteServer = async (id: string) => {
    if (!confirm('确定要删除该服务器吗？')) return
    await apiFetch(`/servers/${id}`, { method: 'DELETE' })
    loadServers()
    if (selectedServer?.id === id) back()
  }

  const deleteChannel = async (id: string) => {
    if (!confirm('确定要删除该频道吗？')) return
    await apiFetch(`/channels/${id}`, { method: 'DELETE' })
    if (selectedServer) loadChannels(selectedServer.id)
    if (selectedChannel?.id === id) backToChannels()
  }

  const deleteMessage = async (id: string) => {
    if (!confirm('确定要删除该消息吗？')) return
    await apiFetch(`/messages/${id}`, { method: 'DELETE' })
    if (selectedServer && selectedChannel) loadMessages(selectedServer.id, selectedChannel.id)
  }

  const openEdit = (s: Server) => {
    setEditingServer(s)
    setEditForm({
      name: s.name,
      slug: s.slug ?? '',
      description: s.description ?? '',
      isPublic: s.isPublic,
    })
  }

  const saveEdit = async () => {
    if (!editingServer) return
    await apiFetch(`/servers/${editingServer.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        name: editForm.name,
        slug: editForm.slug || null,
        description: editForm.description || null,
        isPublic: editForm.isPublic,
      }),
    }).catch(() => {})
    setEditingServer(null)
    loadServers()
  }

  return (
    <div>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-4 text-lg font-bold">
        <button
          onClick={back}
          className={selectedServer ? 'text-indigo-400 hover:underline' : 'text-white'}
        >
          服务器管理
        </button>
        {selectedServer && (
          <>
            <span className="text-zinc-500">/</span>
            <button
              onClick={backToChannels}
              className={selectedChannel ? 'text-indigo-400 hover:underline' : 'text-white'}
            >
              {selectedServer.name}
            </button>
          </>
        )}
        {selectedChannel && (
          <>
            <span className="text-zinc-500">/</span>
            <span className="text-white">#{selectedChannel.name}</span>
          </>
        )}
      </div>

      {/* Messages */}
      {selectedServer && selectedChannel && (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400 text-left">
                <th className="px-4 py-3">发送者</th>
                <th className="px-4 py-3">内容</th>
                <th className="px-4 py-3">时间</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {messages.map((m) => (
                <tr key={m.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="px-4 py-3 text-zinc-300">
                    {m.author?.displayName ?? m.author?.username ?? m.authorId}
                  </td>
                  <td className="px-4 py-3 text-zinc-300 max-w-sm truncate">{m.content}</td>
                  <td className="px-4 py-3 text-zinc-500">
                    {m.createdAt ? new Date(m.createdAt).toLocaleString() : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => deleteMessage(m.id)}
                      className="text-red-400 hover:text-red-300 text-xs transition"
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
              {messages.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-zinc-500">
                    暂无消息
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Channels */}
      {selectedServer && !selectedChannel && (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400 text-left">
                <th className="px-4 py-3">频道</th>
                <th className="px-4 py-3">类型</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {channels.map((ch) => (
                <tr
                  key={ch.id}
                  onClick={() => selectChannel(ch)}
                  className="border-b border-zinc-800/50 hover:bg-zinc-800/30 cursor-pointer"
                >
                  <td className="px-4 py-3 font-medium text-zinc-300">#{ch.name}</td>
                  <td className="px-4 py-3 text-zinc-400">{ch.type}</td>
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteChannel(ch.id)
                      }}
                      className="text-red-400 hover:text-red-300 text-xs transition"
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
              {channels.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-zinc-500">
                    暂无频道
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Server list */}
      {!selectedServer && (
        <div className="bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400 text-left">
                <th className="px-4 py-3">服务器</th>
                <th className="px-4 py-3">Slug</th>
                <th className="px-4 py-3">公开</th>
                <th className="px-4 py-3">创建时间</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {servers.map((s) => (
                <tr
                  key={s.id}
                  onClick={() => openServer(s)}
                  className="border-b border-zinc-800/50 hover:bg-zinc-800/30 cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {s.iconUrl ? (
                        <img src={s.iconUrl} alt="" className="w-7 h-7 rounded-lg" />
                      ) : (
                        <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center text-xs font-bold">
                          {s.name[0]?.toUpperCase()}
                        </div>
                      )}
                      <span className="font-medium">{s.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-zinc-400 font-mono">{s.slug ?? '-'}</td>
                  <td className="px-4 py-3">{s.isPublic ? '✅' : '❌'}</td>
                  <td className="px-4 py-3 text-zinc-500">
                    {s.createdAt ? new Date(s.createdAt).toLocaleString() : '-'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          openEdit(s)
                        }}
                        className="text-indigo-400 hover:text-indigo-300 text-xs transition"
                      >
                        编辑
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteServer(s.id)
                        }}
                        className="text-red-400 hover:text-red-300 text-xs transition"
                      >
                        删除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {servers.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-zinc-500">
                    暂无服务器
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit server dialog */}
      {editingServer && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => setEditingServer(null)}
        >
          <div
            className="bg-zinc-900 rounded-xl p-6 w-[440px] border border-zinc-800 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-white">编辑服务器</h3>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">名称</label>
              <input
                value={editForm.name}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full bg-zinc-800 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Slug</label>
              <input
                value={editForm.slug}
                onChange={(e) => setEditForm((f) => ({ ...f, slug: e.target.value }))}
                placeholder="例如: my-server"
                className="w-full bg-zinc-800 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">描述</label>
              <textarea
                value={editForm.description}
                onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
                className="w-full bg-zinc-800 text-white rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-zinc-300">公开服务器</span>
              <button
                type="button"
                onClick={() => setEditForm((f) => ({ ...f, isPublic: !f.isPublic }))}
                className={`relative w-11 h-6 rounded-full transition-colors ${editForm.isPublic ? 'bg-indigo-600' : 'bg-zinc-700'}`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${editForm.isPublic ? 'translate-x-5' : ''}`}
                />
              </button>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setEditingServer(null)}
                className="px-4 py-2 text-zinc-400 hover:text-white transition"
              >
                取消
              </button>
              <button
                onClick={saveEdit}
                disabled={!editForm.name.trim()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition disabled:opacity-50"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
