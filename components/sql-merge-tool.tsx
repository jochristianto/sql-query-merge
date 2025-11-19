"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { ChevronDownIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "./ui/dropdown-menu";

type MergeResult = {
  result: string;
  error?: string;
  usedCount: number;
  placeholderCount: number;
};

function escapeSqlValue(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  // Dates or other toString-able types handled as strings
  const s = String(v);
  // Double the single quotes inside the string: O'Reilly -> O''Reilly
  const escaped = s.replace(/'/g, "''");
  return `'${escaped}'`;
}

function countPlaceholders(sql: string): number {
  let inSingle = false;
  let inDouble = false;
  let inBack = false;
  let count = 0;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (!inDouble && !inBack && ch === "'") {
      // Enter/exit single quote; handle escaped '' inside singles
      if (inSingle && next === "'") {
        i++; // skip escaped quote
        continue;
      }
      inSingle = !inSingle;
      continue;
    }

    if (!inSingle && !inBack && ch === '"') {
      if (inDouble && next === '"') {
        i++;
        continue;
      }
      inDouble = !inDouble;
      continue;
    }

    if (!inSingle && !inDouble && ch === "`") {
      if (inBack && next === "`") {
        i++;
        continue;
      }
      inBack = !inBack;
      continue;
    }

    if (!inSingle && !inDouble && !inBack && ch === "?") {
      count++;
    }
  }
  return count;
}

function mergeSql(sql: string, params: unknown[]): MergeResult {
  let inSingle = false;
  let inDouble = false;
  let inBack = false;
  let out = "";
  let pi = 0;

  const placeholderCount = countPlaceholders(sql);

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (!inDouble && !inBack && ch === "'") {
      if (inSingle && next === "'") {
        out += "''";
        i++;
        continue;
      }
      inSingle = !inSingle;
      out += ch;
      continue;
    }

    if (!inSingle && !inBack && ch === '"') {
      if (inDouble && next === '"') {
        out += '""';
        i++;
        continue;
      }
      inDouble = !inDouble;
      out += ch;
      continue;
    }

    if (!inSingle && !inDouble && ch === "`") {
      if (inBack && next === "`") {
        out += "``";
        i++;
        continue;
      }
      inBack = !inBack;
      out += ch;
      continue;
    }

    if (!inSingle && !inDouble && !inBack && ch === "?") {
      if (pi >= params.length) {
        // Not enough params; leave '?' and report error at end
        out += "?";
      } else {
        out += escapeSqlValue(params[pi++]);
      }
      continue;
    }

    out += ch;
  }

  if (pi < params.length) {
    return {
      result: out,
      error: `Too many parameters: provided ${params.length}, used ${pi}.`,
      usedCount: pi,
      placeholderCount,
    };
  }
  if (pi < placeholderCount) {
    return {
      result: out,
      error: `Not enough parameters: placeholders=${placeholderCount}, provided=${params.length}.`,
      usedCount: pi,
      placeholderCount,
    };
  }
  return { result: out, usedCount: pi, placeholderCount };
}

function formatSql(input: string): string {
  if (!input) return "";

  // First pass: uppercase SQL keywords only outside of quotes
  const keywords = new Set([
    "select",
    "from",
    "where",
    "group",
    "by",
    "having",
    "order",
    "limit",
    "offset",
    "join",
    "left",
    "right",
    "inner",
    "outer",
    "cross",
    "on",
    "and",
    "or",
    "union",
    "all",
    "into",
    "values",
    "set",
    "update",
    "insert",
    "delete",
    "distinct",
    "as",
    "case",
    "when",
    "then",
    "end",
    "is",
    "null",
    "like",
    "in",
    "exists",
    "not",
    "between",
    "top",
  ]);

  let inSingle = false;
  let inDouble = false;
  let inBack = false;
  let out = "";
  let word = "";

  const flushWord = () => {
    if (word) {
      const lower = word.toLowerCase();
      out += keywords.has(lower) ? word.toUpperCase() : word;
      word = "";
    }
  };

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const next = input[i + 1];

    if (!inDouble && !inBack && ch === "'") {
      flushWord();
      if (inSingle && next === "'") {
        out += "''";
        i++;
        continue;
      }
      inSingle = !inSingle;
      out += ch;
      continue;
    }

    if (!inSingle && !inBack && ch === '"') {
      flushWord();
      if (inDouble && next === '"') {
        out += '""';
        i++;
        continue;
      }
      inDouble = !inDouble;
      out += ch;
      continue;
    }

    if (!inSingle && !inDouble && ch === "`") {
      flushWord();
      if (inBack && next === "`") {
        out += "``";
        i++;
        continue;
      }
      inBack = !inBack;
      out += ch;
      continue;
    }

    if (!inSingle && !inDouble && !inBack && /[A-Za-z]/.test(ch)) {
      word += ch;
    } else {
      flushWord();
      out += ch;
    }
  }
  flushWord();

  // Second pass: whitespace normalization and line breaks before major clauses.
  let s = out
    // collapse spaces/tabs but keep newlines
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();

  // Insert newlines before major clauses (longer phrases first)
  s = s
    .replace(/\s+(UNION\s+ALL)\b/g, "\n$1")
    .replace(/\s+\b(LEFT\s+OUTER\s+JOIN)\b/g, "\n$1")
    .replace(/\s+\b(RIGHT\s+OUTER\s+JOIN)\b/g, "\n$1")
    .replace(/\s+\b(FULL\s+OUTER\s+JOIN)\b/g, "\n$1")
    .replace(/\s+\b(INNER\s+JOIN)\b/g, "\n$1")
    .replace(/\s+\b(LEFT\s+JOIN)\b/g, "\n$1")
    .replace(/\s+\b(RIGHT\s+JOIN)\b/g, "\n$1")
    .replace(/\s+\b(OUTER\s+JOIN)\b/g, "\n$1")
    .replace(/\s+\b(CROSS\s+JOIN)\b/g, "\n$1")
    .replace(/\s+\b(JOIN)\b/g, "\n$1")
    .replace(/\s+\b(GROUP\s+BY)\b/g, "\n$1")
    .replace(/\s+\b(ORDER\s+BY)\b/g, "\n$1")
    .replace(/\s+\b(HAVING)\b/g, "\n$1")
    .replace(/\s+\b(WHERE)\b/g, "\n$1")
    .replace(/\s+\b(FROM)\b/g, "\n$1")
    .replace(/\s+\b(UNION)\b/g, "\n$1")
    .replace(/\s+\b(LIMIT)\b/g, "\n$1")
    .replace(/\s+\b(OFFSET)\b/g, "\n$1");

  // Put AND/OR on new lines with basic indentation (outside of strings due to first-pass capitalization)
  s = s.replace(/\s+\b(AND|OR)\b/g, "\n  $1");

  // Neaten multiple consecutive newlines
  s = s.replace(/\n{3,}/g, "\n\n");

  return s;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function highlightSqlHtml(input: string): string {
  if (!input) return "";

  const keywords = new Set([
    "select",
    "from",
    "where",
    "group",
    "by",
    "having",
    "order",
    "limit",
    "offset",
    "join",
    "left",
    "right",
    "inner",
    "outer",
    "cross",
    "on",
    "and",
    "or",
    "union",
    "all",
    "into",
    "values",
    "set",
    "update",
    "insert",
    "delete",
    "distinct",
    "as",
    "case",
    "when",
    "then",
    "end",
    "is",
    "null",
    "like",
    "in",
    "exists",
    "not",
    "between",
    "top",
  ]);

  let out = "";
  let word = "";
  let inSingle = false;
  let inDouble = false;
  let inBack = false;

  const flushWord = () => {
    if (!word) return;
    const lower = word.toLowerCase();
    if (keywords.has(lower)) {
      out += `<span class="text-code-keyword font-medium">${escapeHtml(
        word.toUpperCase()
      )}</span>`;
    } else {
      out += escapeHtml(word);
    }
    word = "";
  };

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const next = input[i + 1] ?? "";

    // String literals: single quotes
    if (!inDouble && !inBack && ch === "'") {
      flushWord();
      // open/close single string; handle escaped ''
      out += `<span class="text-accent-foreground">`;
      out += escapeHtml("'");
      inSingle = !inSingle;
      while (inSingle && ++i < input.length) {
        const c = input[i];
        const n = input[i + 1] ?? "";
        if (c === "'" && n === "'") {
          out += escapeHtml("''");
          i++;
          continue;
        }
        if (c === "'") {
          out += escapeHtml("'");
          i++;
          inSingle = false;
          break;
        }
        out += escapeHtml(c);
      }
      out += `</span>`;
      continue;
    }

    // Double-quoted identifiers/strings (dialect-dependent)
    if (!inSingle && !inBack && ch === '"') {
      flushWord();
      out += `<span class="text-muted-foreground">`;
      out += escapeHtml('"');
      inDouble = !inDouble;
      while (inDouble && ++i < input.length) {
        const c = input[i];
        const n = input[i + 1] ?? "";
        if (c === '"' && n === '"') {
          out += escapeHtml('""');
          i++;
          continue;
        }
        if (c === '"') {
          out += escapeHtml('"');
          i++;
          inDouble = false;
          break;
        }
        out += escapeHtml(c);
      }
      out += `</span>`;
      continue;
    }

    // Backtick identifiers
    if (!inSingle && !inDouble && ch === "`") {
      flushWord();
      out += `<span class="text-muted-foreground">`;
      out += escapeHtml("`");
      inBack = !inBack;
      while (inBack && ++i < input.length) {
        const c = input[i];
        const n = input[i + 1] ?? "";
        if (c === "`" && n === "`") {
          out += escapeHtml("``");
          i++;
          continue;
        }
        if (c === "`") {
          out += escapeHtml("`");
          i++;
          inBack = false;
          break;
        }
        out += escapeHtml(c);
      }
      out += `</span>`;
      continue;
    }

    // Outside of quoted contexts
    if (!inSingle && !inDouble && !inBack) {
      // Numbers: simple integer/float
      if (/[0-9]/.test(ch) || (ch === "." && /[0-9]/.test(next))) {
        flushWord();
        let num = ch;
        let j = i + 1;
        while (j < input.length && /[0-9_.]/.test(input[j])) j++;
        num = input.slice(i, j);
        out += `<span class="text-secondary-foreground">${escapeHtml(
          num
        )}</span>`;
        i = j - 1;
        continue;
      }
      // Words (letters/underscore)
      if (/[A-Za-z_]/.test(ch)) {
        word += ch;
        continue;
      }
      // Boundary/non-word char
      flushWord();
      out += escapeHtml(ch);
      continue;
    }

    // Fallback (shouldn't reach due to in-quote handlers)
    out += escapeHtml(ch);
  }

  flushWord();
  return out;
}

export default function SqlMergeTool() {
  const [sql, setSql] = useState<string>(
    "SELECT * FROM abc WHERE abc.id = ? AND abc.anotherId IN (?, ?)"
  );
  const [paramsText, setParamsText] = useState<string>('["784", 123, 456]');
  const [jsonInput, setJsonInput] = useState<string>("");
  const [merged, setMerged] = useState<string>("");
  const [formatted, setFormatted] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [copied, setCopied] = useState<boolean>(false);
  const [formatMode, setFormatMode] = useState<"beautify" | "minify">(
    "beautify"
  );

  const placeholderCount = useMemo(() => countPlaceholders(sql), [sql]);
  const highlighted = useMemo(() => highlightSqlHtml(formatted), [formatted]);

  function parseParams(text: string): unknown[] | { error: string } {
    try {
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) {
        return { error: "Parameters input must be a JSON array." };
      }
      return parsed;
    } catch (e) {
      return {
        error:
          'Invalid JSON. Ensure it\'s a valid array like: ["784", 123, 456]',
      };
    }
  }

  const onMerge = async () => {
    setCopied(false);
    const parsed = parseParams(paramsText);
    if (Array.isArray(parsed)) {
      const r = mergeSql(sql, parsed);
      setMerged(r.result);
      await updateFormatted(r.result);
      setError(r.error || "");
    } else {
      setMerged("");
      setFormatted("");
      setError(parsed.error);
    }
  };

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatted);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };

  const onLoadExample = () => {
    setSql(
      [
        "SELECT u.id, u.name, o.id AS order_id, SUM(oi.qty * oi.price) AS total",
        "FROM users u",
        "JOIN orders o ON o.user_id = u.id",
        "LEFT JOIN order_items oi ON oi.order_id = o.id",
        "WHERE u.status = ?",
        "  AND o.created_at BETWEEN ? AND ?",
        "  AND o.state IN (?, ?, ?)",
        "GROUP BY u.id, u.name, o.id",
        "HAVING SUM(oi.qty * oi.price) > ?",
        "ORDER BY total DESC, u.name ASC",
        "LIMIT ?",
      ].join(" ")
    );
    setParamsText(
      '["active", "2024-01-01", "2024-12-31", "processing", "shipped", "delivered", 1000, 50]'
    );
    setMerged("");
    setFormatted("");
    setError("");
    setCopied(false);
  };

  const onLoadAdvancedExample = () => {
    setSql(
      [
        "WITH recent_orders AS (",
        "  SELECT o.id, o.user_id, SUM(oi.qty * oi.price) AS total",
        "  FROM orders o",
        "  JOIN order_items oi ON oi.order_id = o.id",
        "  WHERE o.created_at >= ?",
        "  GROUP BY o.id, o.user_id",
        ")",
        "SELECT u.id, u.name, ro.total,",
        "  COUNT(*) OVER (PARTITION BY u.id) AS order_count",
        "FROM users u",
        "JOIN recent_orders ro ON ro.user_id = u.id",
        "LEFT JOIN payments p ON p.order_id = ro.id AND p.status IN (?, ?)",
        "WHERE u.region = ?",
        "  AND ro.total > ?",
        "  AND u.name LIKE ?",
        "  AND u.id IN (?, ?)",
        "GROUP BY u.id, u.name, ro.total",
        "HAVING COUNT(p.id) >= ?",
        "ORDER BY ro.total DESC, u.name ASC",
        "LIMIT ?",
        "OFFSET ?",
      ].join(" ")
    );
    setParamsText(
      '["2025-01-01", "succeeded", "pending", "NA", 500, "%son%", 101, 202, 1, 25, 0]'
    );
    setMerged("");
    setFormatted("");
    setError("");
    setCopied(false);
  };

  const onClear = () => {
    setSql("");
    setParamsText("");
    setJsonInput("");
    setMerged("");
    setFormatted("");
    setError("");
    setCopied(false);
  };

  const onLoadFromJson = async () => {
    try {
      const parsed = JSON.parse(jsonInput);

      if (!parsed.sql || !parsed.values) {
        setError("JSON must contain 'sql' and 'values' properties");
        return;
      }

      // JSON.parse already handles unescaping, so we can use the values directly
      const newSql = parsed.sql;
      const newParams = parsed.values;

      setSql(newSql);
      setParamsText(JSON.stringify(newParams));

      // Automatically merge after loading
      setCopied(false);
      if (Array.isArray(newParams)) {
        const r = mergeSql(newSql, newParams);
        setMerged(r.result);
        await updateFormatted(r.result);
        setError(r.error || "");
      }
    } catch (e) {
      setError("Invalid JSON format. Please check your input.");
    }
  };

  const onLoadFromJsonAndCopy = async () => {
    try {
      const parsed = JSON.parse(jsonInput);

      if (!parsed.sql || !parsed.values) {
        setError("JSON must contain 'sql' and 'values' properties");
        return;
      }

      // JSON.parse already handles unescaping, so we can use the values directly
      const newSql = parsed.sql;
      const newParams = parsed.values;

      setSql(newSql);
      setParamsText(JSON.stringify(newParams));

      // Automatically merge after loading
      if (Array.isArray(newParams)) {
        const r = mergeSql(newSql, newParams);
        setMerged(r.result);
        await updateFormatted(r.result);
        setError(r.error || "");

        // Copy to clipboard
        if (!r.error) {
          const formattedOutput =
            formatMode === "beautify"
              ? await beautifyWithPMTSF(r.result)
              : minifySqlPreserveStrings(r.result);

          try {
            await navigator.clipboard.writeText(formattedOutput);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            // ignore clipboard errors
          }
        }
      }
    } catch (e) {
      setError("Invalid JSON format. Please check your input.");
    }
  };

  async function beautifyWithPMTSF(sql: string): Promise<string> {
    if (!sql) return "";
    try {
      // Dynamic import supports Next.js's inferred deps; handle CJS interop
      const mod: any = await import("poor-mans-t-sql-formatter");
      const lib: any = mod?.default ?? mod;

      const options = {
        // Readability-focused settings similar to beautifycode.net
        indent: "  ",
        spacesPerTab: 2,
        maxLineWidth: 100,
        statementBreaks: 2,
        clauseBreaks: 1,
        expandCommaLists: true,
        trailingCommas: true,
        spaceAfterExpandedComma: true,
        expandBooleanExpressions: true,
        expandCaseStatements: true,
        expandBetweenConditions: true,
        expandInLists: true,
        breakJoinOnSections: true,
        uppercaseKeywords: true,
        coloring: false, // we already render our own highlight preview
        // Leave keywordStandardization off to respect non-T-SQL dialects
      };

      const result = lib?.formatSql ? lib.formatSql(sql, options) : null;
      return typeof result?.text === "string" ? result.text : sql;
    } catch {
      // Fallback to local formatter if the package isn't available
      return formatSql(sql);
    }
  }

  function minifySqlPreserveStrings(input: string): string {
    if (!input) return "";
    let out = "";
    let inSingle = false;
    let inDouble = false;
    let inBack = false;
    let i = 0;
    let prevWasSpace = false;

    const appendSpace = () => {
      const prev = out[out.length - 1];
      // avoid spaces right after '(' or ',' and before ')' or ','
      if (prev === "(" || prev === "," || !prev) return;
      out += " ";
    };

    while (i < input.length) {
      const ch = input[i];
      const next = input[i + 1] ?? "";

      // single-quoted string
      if (!inDouble && !inBack && ch === "'") {
        inSingle = true;
        out += "'";
        i++;
        while (i < input.length && inSingle) {
          const c = input[i];
          const n = input[i + 1] ?? "";
          if (c === "'" && n === "'") {
            out += "''";
            i += 2;
            continue;
          }
          if (c === "'") {
            out += "'";
            i++;
            inSingle = false;
            break;
          }
          out += c;
          i++;
        }
        prevWasSpace = false;
        continue;
      }

      // double-quoted string/identifier
      if (!inSingle && !inBack && ch === '"') {
        inDouble = true;
        out += '"';
        i++;
        while (i < input.length && inDouble) {
          const c = input[i];
          const n = input[i + 1] ?? "";
          if (c === '"' && n === '"') {
            out += '""';
            i += 2;
            continue;
          }
          if (c === '"') {
            out += '"';
            i++;
            inDouble = false;
            break;
          }
          out += c;
          i++;
        }
        prevWasSpace = false;
        continue;
      }

      // backtick identifier
      if (!inSingle && !inDouble && ch === "`") {
        inBack = true;
        out += "`";
        i++;
        while (i < input.length && inBack) {
          const c = input[i];
          const n = input[i + 1] ?? "";
          if (c === "`" && n === "`") {
            out += "``";
            i += 2;
            continue;
          }
          if (c === "`") {
            out += "`";
            i++;
            inBack = false;
            break;
          }
          out += c;
          i++;
        }
        prevWasSpace = false;
        continue;
      }

      // collapse whitespace outside quotes
      if (!inSingle && !inDouble && !inBack && /\s/.test(ch)) {
        if (!prevWasSpace) {
          // peek next non-space
          let k = i + 1;
          let nextNon = "";
          while (k < input.length && /\s/.test(input[k])) k++;
          nextNon = input[k] ?? "";
          if (nextNon !== ")" && nextNon !== ",") {
            appendSpace();
          }
          prevWasSpace = true;
        }
        i++;
        continue;
      }

      // normal char
      out += ch;
      prevWasSpace = false;
      i++;
    }

    return out.trim();
  }

  async function updateFormatted(
    newMerged: string,
    mode: "beautify" | "minify" = formatMode
  ) {
    if (!newMerged) {
      setFormatted("");
      return;
    }
    if (mode === "beautify") {
      const pretty = await beautifyWithPMTSF(newMerged);
      setFormatted(pretty);
    } else {
      setFormatted(minifySqlPreserveStrings(newMerged));
    }
  }

  const onFormatModeChange = (mode: "beautify" | "minify") => {
    setFormatMode(mode);
    updateFormatted(merged, mode);
  };

  return (
    <section className="grid gap-6">
      {/* JSON Input Section */}
      <div className="grid gap-2">
        <label
          htmlFor="json-input"
          className="text-sm font-medium text-foreground"
        >
          Load from JSON (optional)
        </label>
        <div className="flex gap-2">
          <textarea
            id="json-input"
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
            rows={3}
            placeholder='{"sql":"SELECT...", "values":[...]}'
            className="flex-1 resize-y rounded-md border border-input bg-background p-3 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={onLoadFromJsonAndCopy}
            disabled={!jsonInput.trim()}
            className="self-start inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 hover:cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {copied ? "Copied!" : "Load & Copy"}
          </button>
        </div>
        <div className="text-xs text-muted-foreground">
          Paste a JSON object with{" "}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">sql</code> and{" "}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">values</code>{" "}
          properties to auto-populate the fields below.
        </div>
      </div>

      <hr />

      {/* Toolbar: primary actions */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onMerge}
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 hover:cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring"
        >
          Merge
        </button>

        <div className="inline-flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Format</span>
          <button
            type="button"
            role="switch"
            aria-checked={formatMode === "beautify"}
            onClick={async () => {
              const next = formatMode === "beautify" ? "minify" : "beautify";
              setFormatMode(next);
              await updateFormatted(merged, next);
            }}
            data-state={formatMode === "beautify" ? "on" : "off"}
            className="group relative inline-flex h-6 w-11 items-center rounded-full bg-muted transition-colors hover:cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring data-[state=on]:bg-primary/20"
          >
            <span className="sr-only">Toggle Beautify/Minify</span>
            <span
              className={cn(
                "inline-block h-5 w-5 transform rounded-full bg-primary transition-transform",
                formatMode === "beautify" ? "translate-x-5" : "translate-x-1"
              )}
            />
          </button>
          <span className="text-xs text-muted-foreground min-w-14">
            {formatMode === "beautify" ? "Beautify" : "Minify"}
          </span>
        </div>

        <button
          type="button"
          onClick={onClear}
          className="inline-flex items-center rounded-md bg-muted px-3 py-2 text-sm font-medium text-foreground hover:opacity-90 hover:cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring"
        >
          Clear
        </button>

        <div className="inline-flex rounded-md shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={onLoadExample}
            className="inline-flex items-center rounded-l-md bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground hover:opacity-90 hover:cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring"
          >
            Load Example
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Open examples menu"
                className="inline-flex items-center justify-center rounded-r-md bg-secondary px-2 py-2 text-sm text-secondary-foreground hover:opacity-90 hover:cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring border-l border-border"
              >
                <ChevronDownIcon className="size-4" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" sideOffset={6}>
              <DropdownMenuItem
                className="hover:cursor-pointer"
                onClick={onLoadAdvancedExample}
              >
                Load advanced example
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Main content: 2 columns on md+ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: inputs */}
        <div className="grid gap-4 self-start items-start">
          <div className="grid gap-2 items-start">
            <label
              htmlFor="sql"
              className="text-sm font-medium text-foreground"
            >
              SQL with {"'?'"} placeholders
            </label>
            <textarea
              id="sql"
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              rows={6}
              className="w-full resize-y rounded-md border border-input bg-background p-3 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              aria-describedby="sql-help"
              spellCheck={false}
            />
            <div id="sql-help" className="text-xs text-muted-foreground">
              Placeholders outside quotes will be replaced. Example:{" "}
              {"SELECT * FROM abc WHERE id = ? AND anotherId IN (?, ?)"}
            </div>
            <div className="text-xs text-muted-foreground">
              Detected placeholders:{" "}
              <span className="font-medium text-foreground">
                {placeholderCount}
              </span>
            </div>
          </div>

          <div className="grid gap-2 items-start">
            <label
              htmlFor="params"
              className="text-sm font-medium text-foreground"
            >
              Parameters (JSON array)
            </label>
            <textarea
              id="params"
              value={paramsText}
              onChange={(e) => setParamsText(e.target.value)}
              rows={4}
              className="w-full resize-y rounded-md border border-input bg-background p-3 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
              aria-describedby="params-help"
              spellCheck={false}
            />
            <div id="params-help" className="text-xs text-muted-foreground">
              Example: {'["784", 123, 456]'} — strings will be single-quoted and
              escaped, numbers left as-is.
            </div>
          </div>
        </div>

        {/* Right: output */}
        <div className="flex h-full flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-foreground">
              Output
            </label>
            <button
              type="button"
              onClick={onCopy}
              disabled={!formatted}
              className="inline-flex items-center rounded-md bg-accent px-3 py-2 text-sm font-medium text-accent-foreground hover:opacity-90 hover:cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
            >
              {copied ? "Copied!" : "Copy Output"}
            </button>
          </div>

          <pre className="flex-1 min-h-0 overflow-auto rounded-md border border-input bg-background p-3 text-sm">
            <code
              className="font-mono text-foreground"
              dangerouslySetInnerHTML={{
                __html: formatted
                  ? highlighted
                  : escapeHtml('Run "Merge" to see the output here.'),
              }}
            />
          </pre>

          {error && (
            <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
