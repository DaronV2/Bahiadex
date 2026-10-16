import { useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { enc, formatDate, get, setDate, sortByRecency } from '../api/tcgdex.js'
import { useLang } from '../app/language.js'
import { CollectionProgress } from '../components/CollectionProgress.jsx'
import { Crumbs } from '../components/Crumbs.jsx'
import { ErrorState, SkeletonTiles } from '../components/Feedback.jsx'
import { Tile } from '../components/Tile.jsx'
import { useCollection } from '../data/collection.js'
import { useAsync, useDates, useOrder } from '../hooks/index.js'

export default function Serie() {
  const { id } = useParams()
  const lang = useLang()
  const [state, retry] = useAsync(() => get(lang, `/series/${enc(id)}`), [lang, id])
  const serie = state.data
  const sets = useMemo(() => serie?.sets || [], [serie])
  const { cards: collectionCards, loading: collectionLoading, error: collectionError } = useCollection(undefined, state.status === 'ok')
  const { dates, ready } = useDates(sets, sid => setDate(lang, sid), lang)
  const [newest, toggle] = useOrder()
  const sorted = useMemo(() => sortByRecency(sets, dates, ready, newest), [sets, dates, ready, newest])
  const totalCards = sets.reduce((total, set) => total + (set.cardCount?.total || set.cardCount?.official || 0), 0)
  const setIds = useMemo(() => new Set(sets.map(set => set.id)), [sets])
  const ownedCards = collectionCards.filter(card => setIds.has(card.setId)).length

  useEffect(() => {
    document.title = serie ? `${serie.name} · Classeur Pokémon TCG` : 'Classeur Pokémon TCG'
  }, [serie])

  return (
    <>
      <Crumbs items={[{ label: 'Séries', to: '/' }, { label: serie?.name || '…' }]} />
      <h1>{serie?.name || 'Chargement…'}</h1>

      {state.status === 'loading' && <SkeletonTiles />}
      {state.status === 'error' && <ErrorState error={state.error} onRetry={retry} />}
      {state.status === 'ok' && (
        <>
          <p className="lede">{sets.length} extension{sets.length > 1 ? 's' : ''} dans cette série.</p>
          {collectionError
            ? <p className="auth-error" role="alert">{collectionError}</p>
            : <CollectionProgress label={`Collection de ${serie.name}`} owned={ownedCards} total={totalCards} loading={collectionLoading} />}
          {sets.length > 0 ? (
            <>
              <div className="toolbar">
                <button className="btn" type="button" onClick={toggle}>
                  {newest ? 'Plus récentes en premier' : 'Plus anciennes en premier'}
                </button>
                {!ready && <span className="count" aria-live="polite">Classement par date de sortie…</span>}
                {collectionLoading && <span className="count" role="status">Calcul de la collection…</span>}
              </div>
              <div className="tiles">
                {sorted.map(s => (
                  <Tile
                    key={s.id}
                    to={`/set/${enc(s.id)}?s=${enc(id)}`}
                    logo={s.logo}
                    symbol={s.symbol}
                    title={s.name}
                    progress={{
                      label: 'Collection',
                      owned: collectionCards.filter(card => card.setId === s.id).length,
                      total: s.cardCount?.total || s.cardCount?.official || 0,
                      loading: collectionLoading
                    }}
                    meta={[
                      s.cardCount ? `${s.cardCount.total} cartes` : '',
                      dates[s.id] ? formatDate(dates[s.id], lang) : ''
                    ].filter(Boolean).join(' · ')}
                  />
                ))}
              </div>
            </>
          ) : (
            <div className="state"><strong>Aucune extension</strong>Cette série ne contient pas encore d'extension.</div>
          )}
        </>
      )}
    </>
  )
}
