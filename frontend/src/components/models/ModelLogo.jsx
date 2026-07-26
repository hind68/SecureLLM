import { modelLogoSrc } from '../../utils/modelMetadata'

export default function ModelLogo({ alias, className = '' }) {
  const logo = modelLogoSrc(alias)

  if (!logo) {
    return null
  }

  return (
    <span className={className}>
      <img src={logo} alt="" onError={(event) => { event.currentTarget.style.display = 'none' }} />
    </span>
  )
}
