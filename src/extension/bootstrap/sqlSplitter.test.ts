import { describe, expect, test } from "bun:test";
import { splitSqlStatements } from "./sqlSplitter";

describe("splitSqlStatements", () => {
  test("splits a single trivial statement", () => {
    expect(splitSqlStatements("SELECT 1;")).toEqual(["SELECT 1"]);
  });

  test("strips trailing semicolon from emitted statements", () => {
    const out = splitSqlStatements("SELECT 1;");
    expect(out[0].endsWith(";")).toBe(false);
  });

  test("emits the tail when input has no trailing semicolon", () => {
    expect(splitSqlStatements("SELECT 1")).toEqual(["SELECT 1"]);
  });

  test("splits multiple statements", () => {
    expect(splitSqlStatements("SELECT 1; SELECT 2;")).toEqual([
      "SELECT 1",
      "SELECT 2",
    ]);
  });

  test("skips empty statements between semicolons", () => {
    const out = splitSqlStatements("SELECT 1;; SELECT 2;");
    expect(out).toHaveLength(2);
    expect(out).toEqual(["SELECT 1", "SELECT 2"]);
  });

  test("returns empty array for whitespace + semicolons only", () => {
    expect(splitSqlStatements("   ;  ;  ")).toEqual([]);
  });

  test("treats line comment content as part of the buffer", () => {
    // The implementation appends comment chars into `buf`, so the comment
    // survives into the *next* statement (the one whose body it precedes).
    const out = splitSqlStatements("SELECT 1; -- a comment\nSELECT 2;");
    expect(out).toHaveLength(2);
    expect(out[0]).toBe("SELECT 1");
    expect(out[1]).toContain("-- a comment");
    expect(out[1]).toContain("SELECT 2");
  });

  test("ignores semicolons inside block comments", () => {
    const out = splitSqlStatements("SELECT 1; /* ; ; */ SELECT 2;");
    expect(out).toHaveLength(2);
    expect(out[1]).toContain("/* ; ; */");
    expect(out[1]).toContain("SELECT 2");
  });

  test("ignores semicolons inside single-quoted strings", () => {
    expect(splitSqlStatements("INSERT INTO t VALUES ('a;b');")).toEqual([
      "INSERT INTO t VALUES ('a;b')",
    ]);
  });

  test("respects '' as a literal-quote escape inside strings", () => {
    expect(splitSqlStatements("SELECT 'it''s';")).toEqual(["SELECT 'it''s'"]);
  });

  test("ignores semicolons inside untagged dollar-quoted blocks", () => {
    const sql = "DO $$ BEGIN PERFORM 1; PERFORM 2; END $$;";
    const out = splitSqlStatements(sql);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("$$ BEGIN PERFORM 1; PERFORM 2; END $$");
  });

  test("ignores semicolons inside tagged dollar-quoted blocks", () => {
    const sql =
      "CREATE FUNCTION f() RETURNS void AS $func$ SELECT 1; SELECT 2; $func$ LANGUAGE sql;";
    const out = splitSqlStatements(sql);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("$func$ SELECT 1; SELECT 2; $func$");
  });

  test("treats a different inner tag as part of the outer block", () => {
    // $outer$ closes only on the next $outer$, so $inner$...$inner$ inside
    // is preserved as literal content.
    const sql = "$outer$ a $inner$ x; $inner$ b $outer$;";
    const out = splitSqlStatements(sql);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe("$outer$ a $inner$ x; $inner$ b $outer$");
  });

  test("emits a graceful tail when a dollar block is unterminated", () => {
    const out = splitSqlStatements("$$ never closed");
    expect(out).toHaveLength(1);
    expect(out[0]).toContain("$$ never closed");
  });

  test("trims leading/trailing whitespace from each statement", () => {
    const out = splitSqlStatements("  SELECT 1  ;   SELECT 2  ;");
    expect(out).toEqual(["SELECT 1", "SELECT 2"]);
  });
});
