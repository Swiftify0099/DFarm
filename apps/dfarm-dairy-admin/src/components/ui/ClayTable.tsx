import React from 'react'
import clsx from 'clsx'
import { EmptyStateVisual } from '@/assets/illustrations'

export interface Column<T> {
  key: string
  header: React.ReactNode
  render?: (row: T, index: number) => React.ReactNode
  align?: 'left' | 'center' | 'right'
  className?: string
}

export interface ClayTableProps<T> {
  columns: Column<T>[]
  data: T[]
  keyExtractor: (item: T) => string
  isLoading?: boolean
  emptyMessage?: string
  emptySubtext?: string
  className?: string
  onRowClick?: (item: T) => void
}

export function ClayTable<T>({
  columns,
  data,
  keyExtractor,
  isLoading = false,
  emptyMessage = 'No records found',
  emptySubtext = 'Records will appear here once registered or synced.',
  className = '',
  onRowClick,
}: ClayTableProps<T>) {
  if (isLoading) {
    return (
      <div className="w-full p-12 flex flex-col items-center justify-center text-[#817A75] gap-3">
        <svg
          className="animate-spin h-7 w-7 text-[#FF6A00]"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
        <span className="text-sm font-medium">Loading verified dairy records...</span>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="w-full py-12 px-4 flex flex-col items-center justify-center text-center">
        <EmptyStateVisual size={80} />
        <h4 className="text-base font-bold text-[#211B18] mt-4">{emptyMessage}</h4>
        <p className="text-xs text-[#817A75] max-w-sm mt-1">{emptySubtext}</p>
      </div>
    )
  }

  return (
    <div className={clsx('w-full overflow-x-auto rounded-xl border border-[#F1E7E0] bg-white shadow-xs', className)}>
      <table className="w-full text-left text-sm text-[#211B18] border-collapse">
        <thead className="bg-[#FFF5EE] border-b border-[#F1E7E0] text-xs uppercase tracking-wider text-[#817A75] font-bold">
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                className={clsx(
                  'px-4 py-3.5',
                  col.align === 'center' && 'text-center',
                  col.align === 'right' && 'text-right',
                  col.className
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#F1E7E0]/70">
          {data.map((row, idx) => (
            <tr
              key={keyExtractor(row)}
              onClick={() => onRowClick?.(row)}
              className={clsx(
                'transition-colors duration-100 hover:bg-[#FFF5EE]/60',
                onRowClick && 'cursor-pointer'
              )}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={clsx(
                    'px-4 py-3 text-sm whitespace-nowrap',
                    col.align === 'center' && 'text-center',
                    col.align === 'right' && 'text-right',
                    col.className
                  )}
                >
                  {col.render ? col.render(row, idx) : (row as any)[col.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
