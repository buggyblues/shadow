import { QueryClient, QueryClientProvider, useMutation, useQuery } from '@tanstack/react-query'
import { Crown, Dices, Loader2, RotateCcw, Trophy } from 'lucide-react'
import { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { leaderboard, listPrizes, listRuns, startSpin } from './api.js'
import './styles.css'

const queryClient = new QueryClient()

function App() {
  const [participantName, setParticipantName] = useState('')
  const prizes = useQuery({ queryKey: ['wheel', 'prizes'], queryFn: listPrizes })
  const runs = useQuery({ queryKey: ['wheel', 'runs'], queryFn: () => listRuns({ limit: 12 }) })
  const leaders = useQuery({
    queryKey: ['wheel', 'leaderboard'],
    queryFn: () => leaderboard({ limit: 10 }),
  })
  const spin = useMutation({
    mutationFn: () => startSpin({ participantName: participantName.trim() || undefined }),
    onSuccess: () => {
      void runs.refetch()
      void leaders.refetch()
    },
  })
  const latestRun = spin.data?.run ?? runs.data?.runs[0]
  const bestScore = useMemo(
    () => Math.max(0, ...(leaders.data?.leaderboard.map((entry) => entry.totalScore) ?? [])),
    [leaders.data],
  )

  return (
    <main className="appShell">
      <section className="heroPanel">
        <div className="heroCopy">
          <span className="eyebrow">Animal Spin Wheel</span>
          <h1>Spin three times and climb the leaderboard.</h1>
          <p>Each animal has a weighted probability and score. Every completed round is saved.</p>
          <div className="nameRow">
            <input
              value={participantName}
              onChange={(event) => setParticipantName(event.target.value)}
              placeholder="Participant name"
              maxLength={40}
            />
            <button type="button" onClick={() => spin.mutate()} disabled={spin.isPending}>
              {spin.isPending ? <Loader2 className="spinIcon" /> : <Dices />}
              Spin 3
            </button>
          </div>
          {spin.error ? <div className="errorText">{spin.error.message}</div> : null}
        </div>
        <div className="wheelStage">
          <img
            className={spin.isPending ? 'wheelImage isSpinning' : 'wheelImage'}
            src="/wheel/animal-wheel.png"
            alt="Animal prize wheel"
          />
        </div>
      </section>

      <section className="contentGrid">
        <div className="panel resultPanel">
          <div className="panelTitle">
            <RotateCcw />
            <h2>Latest Round</h2>
          </div>
          {latestRun ? (
            <>
              <div className="scoreCard">
                <span>{latestRun.participant.displayName}</span>
                <strong>{latestRun.totalScore}</strong>
              </div>
              <div className="spinList">
                {latestRun.spins.map((item) => (
                  <div className="spinResult" key={item.id}>
                    <span>{item.index}</span>
                    <div>
                      <strong>{item.animal}</strong>
                      <small>{item.label}</small>
                    </div>
                    <b>+{item.score}</b>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="emptyState">No rounds yet.</div>
          )}
        </div>

        <div className="panel">
          <div className="panelTitle">
            <Crown />
            <h2>Prizes</h2>
          </div>
          <div className="prizeGrid">
            {(prizes.data?.prizes ?? []).map((prize) => (
              <div className="prizeTile" key={prize.id} style={{ borderColor: prize.color }}>
                <strong>{prize.animal}</strong>
                <span>{prize.score} pts</span>
                <small>{prize.weight}% weight</small>
              </div>
            ))}
          </div>
        </div>

        <div className="panel leaderboardPanel">
          <div className="panelTitle">
            <Trophy />
            <h2>Leaderboard</h2>
          </div>
          <div className="leaderList">
            {(leaders.data?.leaderboard ?? []).map((entry, index) => (
              <div className="leaderRow" key={entry.participantId}>
                <span className="rank">{index + 1}</span>
                <div>
                  <strong>{entry.displayName}</strong>
                  <small>
                    {entry.rounds} rounds · best {entry.bestRunScore}
                  </small>
                </div>
                <b>{entry.totalScore}</b>
              </div>
            ))}
          </div>
          {!bestScore ? (
            <div className="emptyState">Spin once to create the first score.</div>
          ) : null}
        </div>
      </section>
    </main>
  )
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <QueryClientProvider client={queryClient}>
    <App />
  </QueryClientProvider>,
)
