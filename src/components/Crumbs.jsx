import { Link } from 'react-router-dom'

// Fil d'Ariane affiché en haut des pages de navigation.
export function Crumbs({ items }) {
  return (
    <nav className="crumbs" aria-label="Fil d'Ariane">
      {items.map((crumb, index) => (
        <span key={index} className="crumb">
          {index > 0 && <span className="sep" aria-hidden="true">/</span>}
          {crumb.to
            ? <Link to={crumb.to}>{crumb.label}</Link>
            : <span aria-current="page">{crumb.label}</span>}
        </span>
      ))}
    </nav>
  )
}