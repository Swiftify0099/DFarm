import React from 'react'
import { cn } from '@/utils/cn'
import { ChevronLeft, ChevronRight, Inbox } from 'lucide-react'

export interface ColumnDef<T> {
  key: string
  header: React.ReactNode
  render: (item: T) => React.ReactNode
  className?: string
  align?: 'left' | 'center' | 'right'
}

interface ClayTableProps<T> {
  columns: ColumnDef<T>[]
  data: T[]
  keyExtractor: (item: T) => string
  isLoading?: boolean
  emptyMessage?: string
  onRowClick?: (item: T) => void
  currentPage?: number
  totalPages?: number
  onPageChange?: (page: number) => void
  pageSize?: number
  totalItems?: number
}

export function ClayTable<T>({
  columns,
  data,
  keyExtractor,
  isLoading = false,
  emptyMessage = 'No records found matching criteria.',
  onRowClick,
  currentPage = 1,
  totalPages = 1,
  onPageChange,
  pageSize = 10,
  totalItems,
}: ClayTableProps<T>) {
  return (
    <div className="w-full flex flex-col bg-white rounded-2xl border border-[#F1E7E0] overflow-hidden shadow-sm">
      <div className="w-full overflow-x-auto">
        <table className="w-full text-left text-sm text-[#211B18] border-collapse">
          <thead>
            <tr className="bg-[#FAF6F3] border-b border-[#F1E7E0]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'py-3.5 px-4 font-bold text-xs uppercase tracking-wider text-[#817A75]',
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
          <tbody className="divide-y divide-[#F1E7E0]/60">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {columns.map((col) => (
                    <td key={col.key} className="py-4 px-4">
                      <div className="h-4 bg-[#FAF2EC] rounded-md w-3/4" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="py-12 text-center text-[#817A75]">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <div className="w-10 h-10 rounded-full bg-[#FFE9DC] flex items-center justify-center text-[#FF6A00]">
                      <Inbox className="w-5 h-5" />
                    </div>
                    <span className="text-sm font-medium">{emptyMessage}</span>
                  </div>
                </td>
              </tr>
            ) : (
              data.map((item) => (
                <tr
                  key={keyExtractor(item)}
                  onClick={() => onRowClick && onRowClick(item)}
                  className={cn(
                    'transition-colors duration-150',
                    onRowClick ? 'cursor-pointer hover:bg-[#FFF5EE]/60' : 'hover:bg-[#FAF6F3]/50'
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        'py-3.5 px-4 align-middle',
                        col.align === 'center' && 'text-center',
                        col.align === 'right' && 'text-right',
                        col.className
                      )}
                    >
                      {col.render(item)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      {(totalPages > 1 || (totalItems !== undefined && totalItems > 0)) && (
        <div className="px-4 py-3 border-t border-[#F1E7E0] bg-[#FAF6F3] flex items-center justify-between text-xs text-[#817A75]">
          <div>
            {totalItems !== undefined && (
              <span>
                Showing <strong className="text-[#211B18]">{data.length}</strong> of{' '}
                <strong className="text-[#211B18]">{totalItems}</strong> entries
              </span>
            )}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center gap-1.5">
              <button
                disabled={currentPage <= 1}
                onClick={() => onPageChange && onPageChange(currentPage - 1)}
                className="p-1.5 rounded-lg border border-[#F1E7E0] bg-white text-[#211B18] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#FFE9DC]"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-medium text-[#211B18]">
                Page {currentPage} of {totalPages}
              </span>
              <button
                disabled={currentPage >= totalPages}
                onClick={() => onPageChange && onPageChange(currentPage + 1)}
                className="p-1.5 rounded-lg border border-[#F1E7E0] bg-white text-[#211B18] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#FFE9DC]"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
