import { Pumpkin } from './Pumpkin'
import { Snowflake } from './Snowflake'
import { Ornament } from './Ornament'
import { useTheme } from '../lib/settings'

/** The little emblem of whatever season is on: a pumpkin, a snowflake or a bauble. Renders nothing out of season. */
export function SeasonIcon({ size = 20, className = '' }: { size?: number; className?: string }) {
  const { key } = useTheme()
  if (key === 'halloween') return <Pumpkin size={size} className={className} />
  if (key === 'frost') return <Snowflake size={size} className={className} />
  if (key === 'festive') return <Ornament size={size} className={className} />
  return null
}
