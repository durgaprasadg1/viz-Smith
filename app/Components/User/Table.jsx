"use client";
/* eslint-disable react-hooks/incompatible-library */

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import React, { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const palettes = {
  emerald: {
    headerRow: "bg-gradient-to-r from-emerald-50 to-teal-50",
    headerText: "text-emerald-900",
    card: "rounded-2xl border border-emerald-100 shadow-sm bg-white",
    hoverRow: "hover:bg-emerald-50/60",
    input: "rounded-xl border border-emerald-100 bg-white shadow-sm focus-visible:ring-2 focus-visible:ring-emerald-200",
    select:
      "h-9 rounded-lg border border-emerald-100 bg-white px-3 text-sm text-stone-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-200",
    pageBtn: "border border-emerald-100 text-emerald-800 hover:bg-emerald-50",
    meta: "text-stone-500",
  },
  stone: {
    headerRow: "bg-stone-100",
    headerText: "text-stone-900",
    card: "rounded-2xl border border-stone-200 shadow-sm bg-white",
    hoverRow: "hover:bg-stone-50",
    input: "rounded-xl border border-stone-200 bg-white shadow-sm focus-visible:ring-2 focus-visible:ring-stone-300",
    select:
      "h-9 rounded-lg border border-stone-200 bg-white px-3 text-sm text-stone-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-stone-300",
    pageBtn: "border border-stone-200 text-stone-800 hover:bg-stone-100",
    meta: "text-stone-500",
  },
  midnight: {
    headerRow: "bg-white/[0.04]",
    headerText: "text-white/85",
    card: "rounded-2xl border border-white/10 bg-white/5 shadow-[0_24px_80px_-48px_rgba(34,211,238,0.45)] backdrop-blur",
    hoverRow: "hover:bg-white/[0.04]",
    input:
      "rounded-xl border border-white/10 bg-white/5 text-white shadow-sm placeholder:text-white/35 focus-visible:ring-2 focus-visible:ring-cyan-300/20 focus-visible:border-cyan-300/30",
    select:
      "h-9 rounded-lg border border-white/10 bg-white/5 px-3 text-sm text-white/80 shadow-sm focus:outline-none focus:ring-2 focus:ring-cyan-300/20",
    pageBtn:
      "border border-white/10 bg-white/5 text-white/85 hover:bg-white/10",
    meta: "text-white/45",
  },
};

export function DataTable({
  columns,
  data,
  colorVariant = "emerald",
  searchPlaceholder = "Search...",
  emptyMessage = "No results.",
}) {
  const theme = palettes[colorVariant] || palettes.emerald;
  const [globalFilter, setGlobalFilter] = useState("");
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const [sorting, setSorting] = useState([]);

  const table = useReactTable({
    data,
    columns,
    state: {
      globalFilter,
      pagination,
      sorting,
    },
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <div className="">
      <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex-1 max-w-sm ">
          <Input
            placeholder={searchPlaceholder}
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className={`w-full ${theme.input}`}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm text-muted-foreground">Rows</label>
          <select
            aria-label="Rows per page"
            className={theme.select}
            value={pagination.pageSize}
            onChange={(e) =>
              setPagination((p) => ({
                ...p,
                pageSize: Number(e.target.value),
                pageIndex: 0,
              }))
            }
          >
            {[10, 20, 30, 40, 50].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={`overflow-hidden ${theme.card}`}>
        <Table>
          <TableHeader> 
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className={theme.headerRow}>
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sortState = header.column.getIsSorted();
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder ? null : (
                        <button
                          className={`flex items-center gap-2 ${theme.headerText} font-semibold`}
                          onClick={() =>
                            canSort && header.column.toggleSorting()
                          }
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                          {canSort && (
                            <span className="ml-2">
                              {sortState === "asc" ? (
                                <ArrowUp className="h-3 w-3" />
                              ) : sortState === "desc" ? (
                                <ArrowDown className="h-3 w-3" />
                              ) : (
                                <ArrowUpDown className="h-3 w-3 opacity-50" />
                              )}
                            </span>
                          )}
                        </button>
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                  className={theme.hoverRow}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between py-4">
        <div className={`text-sm ${theme.meta}`}>
          {table.getFilteredRowModel().rows.length
            ? `Showing ${
                table.getState().pagination.pageIndex *
                  table.getState().pagination.pageSize +
                1
              } - ${Math.min(
                (table.getState().pagination.pageIndex + 1) *
                  table.getState().pagination.pageSize,
                table.getFilteredRowModel().rows.length,
              )} of ${table.getFilteredRowModel().rows.length}`
            : "No rows to display"}
        </div>
        <div className="flex items-center gap-2 text-stone-700">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className={theme.pageBtn}
          >
            Prev
          </Button>
          <div className="px-3 text-sm">
            Page {table.getState().pagination.pageIndex + 1} of{" "}
            {table.getPageCount()}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className={theme.pageBtn}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

export default DataTable;
