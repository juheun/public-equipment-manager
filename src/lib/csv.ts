function escapeCsvField(value: string | number | null | undefined): string {
  const str = value == null ? "" : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  return rows.map((row) => row.map(escapeCsvField).join(",")).join("\r\n");
}

const UTF8_BOM = "﻿";

/** 엑셀에서 한글이 깨지지 않도록 UTF-8 BOM을 붙여 CSV 다운로드 응답을 만든다. */
export function csvResponse(filename: string, csv: string): Response {
  return new Response(UTF8_BOM + csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export function jsonBackupResponse(filename: string, data: unknown): Response {
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}
