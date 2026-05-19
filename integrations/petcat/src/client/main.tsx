import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query'
import {
  Bath,
  Bot,
  Coffee,
  Gamepad2,
  HeartPulse,
  Loader2,
  Moon,
  Plus,
  Trophy,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { CatAsset } from '../types.js'
import { adoptCat, autoFeed, care, getCat, leaderboard, listAssets, listCats } from './api.js'
import './styles.css'

const queryClient = new QueryClient()

function App() {
  const [selectedCatId, setSelectedCatId] = useState('cat_demo')
  const [adoptOpen, setAdoptOpen] = useState(false)
  const cats = useQuery({ queryKey: ['cats'], queryFn: listCats })
  const selected = useQuery({
    queryKey: ['cat', selectedCatId],
    queryFn: () => getCat(selectedCatId),
    enabled: !!selectedCatId,
  })
  const leaders = useQuery({
    queryKey: ['cats', 'leaderboard'],
    queryFn: () => leaderboard({ limit: 10 }),
  })
  const automation = useMutation({
    mutationFn: () => autoFeed({}),
    onSuccess: () => refreshAll(),
  })

  function refreshAll() {
    void cats.refetch()
    void selected.refetch()
    void leaders.refetch()
  }

  useEffect(() => {
    if (!selectedCatId && cats.data?.cats[0]) setSelectedCatId(cats.data.cats[0].id)
  }, [cats.data, selectedCatId])

  return (
    <main className="appShell">
      <header className="hero">
        <div>
          <span className="eyebrow">Cloud Cat</span>
          <h1>Care for persistent cats with Buddy automation.</h1>
          <p>
            Attributes decay over time. Feed, play, clean, rest, and let a Buddy run auto feeding.
          </p>
        </div>
        <div className="heroActions">
          <button type="button" onClick={() => setAdoptOpen(true)}>
            <Plus />
            Adopt Cat
          </button>
          <button type="button" onClick={() => automation.mutate()} disabled={automation.isPending}>
            {automation.isPending ? <Loader2 className="spinIcon" /> : <Bot />}
            Auto Feed
          </button>
        </div>
      </header>

      <section className="layoutGrid">
        <aside className="panel catList">
          <h2>Cats</h2>
          {(cats.data?.cats ?? []).map((cat) => (
            <button
              className={cat.id === selectedCatId ? 'catLink isActive' : 'catLink'}
              type="button"
              key={cat.id}
              onClick={() => setSelectedCatId(cat.id)}
            >
              <img src={cat.asset.imageUrl} alt="" />
              <span>
                <strong>{cat.name}</strong>
                <small>{cat.mood}</small>
              </span>
            </button>
          ))}
        </aside>

        <section className="panel detailPanel">
          {selected.data ? (
            <CatDetail data={selected.data} onChanged={refreshAll} />
          ) : (
            <div className="emptyState">Select or adopt a cat.</div>
          )}
        </section>

        <aside className="panel sidePanel">
          <div className="panelHeader">
            <Trophy />
            <h2>Leaderboard</h2>
          </div>
          <div className="leaderList">
            {(leaders.data?.leaderboard ?? []).map((entry, index) => (
              <div className="leaderRow" key={entry.catId}>
                <span>{index + 1}</span>
                <img src={entry.imageUrl} alt="" />
                <div>
                  <strong>{entry.name}</strong>
                  <small>
                    {entry.mood} · {entry.ownerName}
                  </small>
                </div>
                <b>{entry.score}</b>
              </div>
            ))}
          </div>
        </aside>
      </section>

      {adoptOpen ? (
        <AdoptModal
          onClose={() => setAdoptOpen(false)}
          onSaved={(catId) => {
            setAdoptOpen(false)
            setSelectedCatId(catId)
            refreshAll()
          }}
        />
      ) : null}
    </main>
  )
}

function CatDetail(props: { data: Awaited<ReturnType<typeof getCat>>; onChanged: () => void }) {
  const { cat, asset, logs } = props.data
  const action = useMutation({
    mutationFn: (commandName: 'cats.feed' | 'cats.play' | 'cats.clean' | 'cats.rest') =>
      care(commandName, cat.id),
    onSuccess: props.onChanged,
  })
  return (
    <div className="catDetail">
      <div className="catStage">
        <img src={asset.imageUrl} alt={cat.name} />
      </div>
      <div className="catInfo">
        <span className="eyebrow">{asset.personality}</span>
        <h2>{cat.name}</h2>
        <p>{cat.mood}</p>
        <div className="meterGrid">
          <Meter label="Hunger" value={cat.hunger} invert />
          <Meter label="Happiness" value={cat.happiness} />
          <Meter label="Energy" value={cat.energy} />
          <Meter label="Cleanliness" value={cat.cleanliness} />
          <Meter label="Health" value={cat.health} />
        </div>
        <div className="careGrid">
          <button
            type="button"
            disabled={action.isPending}
            onClick={() => action.mutate('cats.feed')}
          >
            <Coffee />
            Feed
          </button>
          <button
            type="button"
            disabled={action.isPending}
            onClick={() => action.mutate('cats.play')}
          >
            <Gamepad2 />
            Play
          </button>
          <button
            type="button"
            disabled={action.isPending}
            onClick={() => action.mutate('cats.clean')}
          >
            <Bath />
            Clean
          </button>
          <button
            type="button"
            disabled={action.isPending}
            onClick={() => action.mutate('cats.rest')}
          >
            <Moon />
            Rest
          </button>
        </div>
        {action.error ? <div className="errorText">{action.error.message}</div> : null}
      </div>
      <div className="logPanel">
        <div className="panelHeader">
          <HeartPulse />
          <h2>Care Log</h2>
        </div>
        {logs.map((log) => (
          <div className="logRow" key={log.id}>
            <strong>{log.action.replace('_', ' ')}</strong>
            <span>{new Date(log.createdAt).toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Meter({ label, value, invert }: { label: string; value: number; invert?: boolean }) {
  const display = Math.max(0, Math.min(100, value))
  const fill = invert ? 100 - display : display
  return (
    <div className="meter">
      <div>
        <span>{label}</span>
        <b>{display}</b>
      </div>
      <i>
        <em style={{ width: `${fill}%` }} />
      </i>
    </div>
  )
}

function AdoptModal(props: { onClose: () => void; onSaved: (catId: string) => void }) {
  const assets = useQuery({ queryKey: ['cat-assets'], queryFn: listAssets })
  const [assetId, setAssetId] = useState('')
  const [name, setName] = useState('')
  const selectedAsset =
    assets.data?.assets.find((asset) => asset.id === assetId) ?? assets.data?.assets[0]
  const mutation = useMutation({
    mutationFn: () =>
      adoptCat({ name: name.trim() || selectedAsset?.name, assetId: selectedAsset?.id }),
    onSuccess: (payload) => props.onSaved(payload.cat.id),
  })
  useEffect(() => {
    if (!assetId && assets.data?.assets[0]) setAssetId(assets.data.assets[0].id)
  }, [assetId, assets.data])
  return (
    <div className="modalBackdrop">
      <div className="modalPanel" role="dialog" aria-modal="true">
        <button className="iconButton" type="button" aria-label="Close" onClick={props.onClose}>
          <X />
        </button>
        <h2>Adopt a Cat</h2>
        <label>
          Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={selectedAsset?.name}
          />
        </label>
        <div className="assetGrid">
          {(assets.data?.assets ?? []).map((asset: CatAsset) => (
            <button
              className={asset.id === selectedAsset?.id ? 'assetOption isActive' : 'assetOption'}
              type="button"
              key={asset.id}
              onClick={() => setAssetId(asset.id)}
            >
              <img src={asset.imageUrl} alt="" />
              <span>{asset.name}</span>
            </button>
          ))}
        </div>
        {mutation.error ? <div className="errorText">{mutation.error.message}</div> : null}
        <button
          type="button"
          disabled={!selectedAsset || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          Adopt
        </button>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>,
)
