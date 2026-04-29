// Split a SQL script into individual statements.
// Honors: '...' strings (with '' escapes), $tag$...$tag$ dollar-quoted blocks,
// -- line comments, and /* ... */ block comments.
// Returns trimmed, non-empty statements without their trailing semicolon.

export function splitSqlStatements(input: string): string[] {
  const out: string[] = [];
  let buf = "";
  let i = 0;
  const n = input.length;

  while (i < n) {
    const c = input[i];
    const next = i + 1 < n ? input[i + 1] : "";

    if (c === "-" && next === "-") {
      while (i < n && input[i] !== "\n") {
        buf += input[i];
        i++;
      }
      continue;
    }

    if (c === "/" && next === "*") {
      buf += "/*";
      i += 2;
      while (i < n && !(input[i] === "*" && input[i + 1] === "/")) {
        buf += input[i];
        i++;
      }
      if (i < n) {
        buf += "*/";
        i += 2;
      }
      continue;
    }

    if (c === "'") {
      buf += c;
      i++;
      while (i < n) {
        if (input[i] === "'" && input[i + 1] === "'") {
          buf += "''";
          i += 2;
          continue;
        }
        buf += input[i];
        if (input[i] === "'") {
          i++;
          break;
        }
        i++;
      }
      continue;
    }

    if (c === "$") {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(input.slice(i));
      if (m) {
        const tag = m[0];
        buf += tag;
        i += tag.length;
        const end = input.indexOf(tag, i);
        if (end < 0) {
          buf += input.slice(i);
          i = n;
        } else {
          buf += input.slice(i, end + tag.length);
          i = end + tag.length;
        }
        continue;
      }
    }

    if (c === ";") {
      const stmt = buf.trim();
      if (stmt) out.push(stmt);
      buf = "";
      i++;
      continue;
    }

    buf += c;
    i++;
  }

  const tail = buf.trim();
  if (tail) out.push(tail);
  return out;
}
