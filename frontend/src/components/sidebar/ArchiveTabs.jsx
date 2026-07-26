export default function ArchiveTabs({ showArchived, setShowArchived }) {
  return (
    <div className="archive-tabs" role="tablist" aria-label="Filtrer les conversations">
      <button
        type="button"
        role="tab"
        aria-selected={!showArchived}
        className={!showArchived ? 'active' : ''}
        onClick={() => setShowArchived(false)}
      >
        Actives
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={showArchived}
        className={showArchived ? 'active' : ''}
        onClick={() => setShowArchived(true)}
      >
        Archives
      </button>
    </div>
  )
}
