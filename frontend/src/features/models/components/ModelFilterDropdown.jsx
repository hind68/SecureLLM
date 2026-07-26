import { useState } from 'react'
import { DownArrowIcon } from '../../../components/common/icons'

export default function ModelFilterDropdown({ modelFilter, models, setModelFilter }) {
  const [isModelFilterOpen, setIsModelFilterOpen] = useState(false)
  const activeFilterLabel = models.find((model) => model.alias === modelFilter)?.displayName || 'Tous les modeles'

  return (
    <div className="custom-dropdown" data-menu-root>
      <button
        type="button"
        className="custom-dropdown-trigger"
        aria-haspopup="listbox"
        aria-expanded={isModelFilterOpen}
        onClick={() => setIsModelFilterOpen((current) => !current)}
      >
        <span>{activeFilterLabel}</span>
        <DownArrowIcon />
      </button>
      {isModelFilterOpen && (
        <ul className="custom-dropdown-menu" role="listbox" aria-label="Filtrer par modele">
          <li
            role="option"
            aria-selected={modelFilter === ''}
            className={modelFilter === '' ? 'selected' : ''}
            onClick={() => {
              setModelFilter('')
              setIsModelFilterOpen(false)
            }}
          >
            Tous les modeles
          </li>
          {models.map((model) => (
            <li
              key={model.alias}
              role="option"
              aria-selected={modelFilter === model.alias}
              className={modelFilter === model.alias ? 'selected' : ''}
              onClick={() => {
                setModelFilter(model.alias)
                setIsModelFilterOpen(false)
              }}
            >
              {model.displayName}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
