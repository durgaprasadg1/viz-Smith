import * as React from "react";

import { cn } from "@/lib/utils";

const Table = React.forwardRef(function Table({ className, ...props }, ref) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table
        ref={ref}
        className={cn("w-full caption-bottom text-sm", className)}
        {...props}
      />
    </div>
  );
});

const TableHeader = React.forwardRef(function TableHeader(
  { className, ...props },
  ref,
) {
  return (
    <thead
      ref={ref}
      className={cn("[&_tr]:border-b [&_tr]:border-white/10", className)}
      {...props}
    />
  );
});

const TableBody = React.forwardRef(function TableBody(
  { className, ...props },
  ref,
) {
  return (
    <tbody
      ref={ref}
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
});

const TableRow = React.forwardRef(function TableRow({ className, ...props }, ref) {
  return (
    <tr
      ref={ref}
      className={cn(
        "border-b border-white/10 transition-colors data-[state=selected]:bg-white/5",
        className,
      )}
      {...props}
    />
  );
});

const TableHead = React.forwardRef(function TableHead(
  { className, ...props },
  ref,
) {
  return (
    <th
      ref={ref}
      className={cn(
        "h-12 px-4 text-left align-middle font-medium text-white/70",
        className,
      )}
      {...props}
    />
  );
});

const TableCell = React.forwardRef(function TableCell(
  { className, ...props },
  ref,
) {
  return (
    <td
      ref={ref}
      className={cn("p-4 align-middle text-white", className)}
      {...props}
    />
  );
});

export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow };
