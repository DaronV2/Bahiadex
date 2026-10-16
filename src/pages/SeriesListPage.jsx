import { useEffect, useMemo } from 'react'
import { enc, get, seriesDate, sortByRecency } from '../api/tcgdex.js'
import { useLang } from '../app/language.js'
import { ErrorState, SkeletonTiles } from '../components/Feedback.jsx'
import { Tile } from '../components/Tile.jsx'
import { useAsync, useDates, useOrder } from '../hooks/index.js'

export default function Series() {
  const lang = useLang()
  const [state, retry] = useAsync(() => get(lang, '/series'), [lang])
  const items = useMemo(() => state.data || [], [state.data])
  const { dates, ready } = useDates(items, id => seriesDate(lang, id), lang)
  const [newest, toggle] = useOrder()
  const sorted = useMemo(() => sortByRecency(items, dates, ready, newest), [items, dates, ready, newest])

  useEffect(() => { document.title = 'Classeur Pokémon TCG' }, [])

  return (
    <>
      <h1>Les séries</h1>
      <p className="lede">Choisissez une série pour voir ses extensions, puis ouvrez une extension pour parcourir ses cartes.</p>

      {state.status === 'loading' && <SkeletonTiles />}
      {state.status === 'error' && <ErrorState error={state.error} onRetry={retry} />}
      {state.status === 'ok' && (
        <>
          <div className="toolbar">
            <button className="btn" type="button" onClick={toggle}>
              {newest ? 'Plus récentes en premier' : 'Plus anciennes en premier'}
            </button>
            <span className="count" aria-live="polite">
              {ready ? `${items.length} séries` : 'Classement par date de sortie…'}
            </span>
          </div>
          <div className="tiles">
            {sorted.map(s => (
              <Tile key={s.id} to={`/serie/${enc(s.id)}`} logo={s.logo} title={s.name} />
            ))}
          </div>
        </>
      )}
    </>
  )
}
