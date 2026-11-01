import type { ButtonHTMLAttributes, ComponentType } from 'react'
import type { IconProps } from '../../../icons'

// No icon in the console is smaller than this (px, a square): the icons are what the buttons say.
export const ICON_PX = 20

// A button that is an icon: its name is the accessible label and the tooltip (the app's buttons are icons wherever one says it).
export function IconBtn({ Icon, label, title, size = ICON_PX, className = 'wrSmallBtn', ...rest }: {
  Icon: ComponentType<IconProps>
  label: string
  title?: string
  size?: number
  className?: string
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'title' | 'aria-label' | 'children'>) {
  return (
    <button type="button" {...rest} className={`${className} wrIconBtn`} aria-label={label} title={title ?? label}>
      <Icon size={size} />
    </button>
  )
}
