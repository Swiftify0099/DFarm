import React from 'react'
import clsx from 'clsx'

interface ClayCardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean
  className?: string
  children: React.ReactNode
}

export const ClayCard: React.FC<ClayCardProps> = ({
  interactive = false,
  className = '',
  children,
  ...props
}) => {
  return (
    <div
      className={clsx(
        interactive ? 'clay-card-interactive' : 'clay-card',
        'p-5 sm:p-6 transition-all duration-200',
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
