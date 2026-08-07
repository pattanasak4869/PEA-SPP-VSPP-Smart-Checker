import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PaginationControlsProps {
  currentPage: number;
  onPageChange: (page: number) => void;
  totalItems: number;
  itemsPerPage: number;
  onItemsPerPageChange: (itemsPerPage: number) => void;
  pageSizeOptions?: number[];
  className?: string;
  showItemRange?: boolean;
}

export const PaginationControls: React.FC<PaginationControlsProps> = ({
  currentPage,
  onPageChange,
  totalItems,
  itemsPerPage,
  onItemsPerPageChange,
  pageSizeOptions = [5, 10, 20, 50, 100],
  className = '',
  showItemRange = true
}) => {
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  const startItem = totalItems === 0 ? 0 : (safeCurrentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(safeCurrentPage * itemsPerPage, totalItems);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages && newPage !== currentPage) {
      onPageChange(newPage);
    }
  };

  const handleItemsPerPageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSize = parseInt(e.target.value, 10);
    onItemsPerPageChange(newSize);
    onPageChange(1); // Reset to first page when page size changes
  };

  // Generate visible page numbers
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    const maxVisiblePages = 5;

    if (totalPages <= maxVisiblePages + 2) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);
      
      let start = Math.max(2, safeCurrentPage - 1);
      let end = Math.min(totalPages - 1, safeCurrentPage + 1);

      if (safeCurrentPage <= 3) {
        start = 2;
        end = 4;
      } else if (safeCurrentPage >= totalPages - 2) {
        start = totalPages - 3;
        end = totalPages - 1;
      }

      if (start > 2) {
        pages.push('...');
      }

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (end < totalPages - 1) {
        pages.push('...');
      }

      pages.push(totalPages);
    }

    return pages;
  };

  if (totalItems === 0) {
    return (
      <div className={`flex flex-col sm:flex-row items-center justify-between gap-4 py-4 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-200/60 dark:border-white/10 ${className}`}>
        <div>ไม่พบข้อมูลรายการ</div>
        <div className="flex items-center gap-2">
          <span className="font-medium">แสดงต่อหน้า:</span>
          <select
            value={itemsPerPage}
            onChange={handleItemsPerPageChange}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1e1b4b] text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#74045F]/30"
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>
                {option} รายการ
              </option>
            ))}
          </select>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex flex-col md:flex-row items-center justify-between gap-4 py-4 px-2 border-t border-slate-200/60 dark:border-white/10 ${className}`}>
      {/* Left side: Items count & Page Size Selector */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
        {showItemRange && (
          <div className="font-medium">
            แสดง <span className="font-bold text-[#74045F] dark:text-[#C7911B]">{startItem}</span> - <span className="font-bold text-[#74045F] dark:text-[#C7911B]">{endItem}</span> จาก <span className="font-bold text-slate-800 dark:text-white">{totalItems}</span> รายการ
          </div>
        )}

        <div className="flex items-center gap-2">
          <span className="text-slate-500 dark:text-slate-400">แสดงต่อหน้า:</span>
          <select
            value={itemsPerPage}
            onChange={handleItemsPerPageChange}
            className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-[#1e1b4b] text-slate-800 dark:text-white font-semibold focus:outline-none focus:ring-2 focus:ring-[#74045F]/30 shadow-xs transition-colors cursor-pointer"
          >
            {pageSizeOptions.map((option) => (
              <option key={option} value={option}>
                {option} รายการ
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Right side: Page Navigation buttons */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* First Page */}
        <button
          onClick={() => handlePageChange(1)}
          disabled={safeCurrentPage === 1}
          title="หน้าแรก"
          className="p-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronsLeft size={16} />
        </button>

        {/* Prev Page */}
        <button
          onClick={() => handlePageChange(safeCurrentPage - 1)}
          disabled={safeCurrentPage === 1}
          title="หน้าก่อนหน้า"
          className="p-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft size={16} />
        </button>

        {/* Page numbers */}
        <div className="flex items-center gap-1">
          {getPageNumbers().map((page, idx) => {
            if (page === '...') {
              return (
                <span key={`ellipsis-${idx}`} className="px-2 text-xs text-slate-400 select-none">
                  ...
                </span>
              );
            }

            const pageNum = page as number;
            const isActive = pageNum === safeCurrentPage;

            return (
              <button
                key={pageNum}
                onClick={() => handlePageChange(pageNum)}
                className={`min-w-[32px] h-8 px-2 rounded-lg text-xs font-bold transition-all ${
                  isActive
                    ? 'bg-[#74045F] text-white dark:bg-[#C7911B] dark:text-slate-950 shadow-md shadow-[#74045F]/20 dark:shadow-[#C7911B]/20 scale-105'
                    : 'bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10'
                }`}
              >
                {pageNum}
              </button>
            );
          })}
        </div>

        {/* Next Page */}
        <button
          onClick={() => handlePageChange(safeCurrentPage + 1)}
          disabled={safeCurrentPage === totalPages}
          title="หน้าถัดไป"
          className="p-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight size={16} />
        </button>

        {/* Last Page */}
        <button
          onClick={() => handlePageChange(totalPages)}
          disabled={safeCurrentPage === totalPages}
          title="หน้าสุดท้าย"
          className="p-1.5 rounded-lg border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronsRight size={16} />
        </button>
      </div>
    </div>
  );
};
