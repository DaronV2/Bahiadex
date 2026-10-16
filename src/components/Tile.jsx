import { Link } from 'react-router-dom'
import { logoUrl } from '../api/tcgdex.js'
import { CollectionProgress } from './CollectionProgress.jsx'

// Tuile de navigation vers une série ou une extension.
export function Tile({ to, logo, symbol, title, meta, progress }) {
  return (
    <Link className="tile" to={to}>
      <div className="tile-logo">
        {logo
          ? <img src={logoUrl(logo)} alt="" loading="lazy" />
          : <span className="fallback">{title}</span>}
      </div>
      <div className="tile-body">
        <span className="tile-title">{title}</span>
        {(symbol || meta) && (
          <span className="tile-meta">
            {symbol && <img src={logoUrl(symbol)} alt="" loading="lazy" />}
            {meta}
          </span>
        )}
        {progress && <CollectionProgress {...progress} />}
      </div>
    </Link>
  )
}