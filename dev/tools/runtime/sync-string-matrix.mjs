import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { compareAlpha, listFilesRecursive, sha256Hex, toPosixPath } from "./runtime-shared.mjs";

const root = process.cwd();
const writeMode = process.argv.includes("--write");
const matrixPath = path.join(root, "app", "src", "sot", "STRING_MATRIX.json");
const reportPath = path.join(root, "docs", "SOT", "STRING_MATRIX.md");
const scanRoots = ["app/src/game", "app/src/kernel", "app/src/ui", "app/public", "docs/V2"];
const supportedExtensions = new Set([".js", ".mjs", ".cjs", ".json", ".html", ".md", ".css"]);

function shouldKeepString(value) {
  const text = String(value || "").trim();
  if (text.length < 2 || text.length > 200) return false;
  if (!/[A-Za-z]/.test(text)) return false;
  if (/^\.\.?\//.test(text)) return false;
  if (/^(node:|https?:|app:|plugin:)/.test(text)) return false;
  if (/\.(js|mjs|cjs|json|md|html|css|svg|png|jpg|jpeg|ttf|woff2?)$/i.test(text)) return false;
  return true;
}

function decodeEscapes(value) {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, "\"")
    .replace(/\\'/g, "'")
    .replace(/\\\\/g, "\\");
}

function extractQuotedStrings(text) {
  const out = [];
  const rx = /(["'`])((?:\\.|(?!\1)[\s\S])*)\1/g;
  let match = null;
  while ((match = rx.exec(text)) !== null) {
    const value = decodeEscapes(match[2]);
    if (shouldKeepString(value)) {
      out.push(value);
    }
  }
  return out;
}

function extractMarkdownText(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const cleaned = line.replace(/^\s{0,3}#+\s*/, "").trim();
    if (shouldKeepString(cleaned)) {
      out.push(cleaned);
    }
  }
  return out;
}

function extractHtmlText(text) {
  const out = [];
  const rx = />\s*([^<>\n][^<>]*)\s*</g;
  let match = null;
  while ((match = rx.exec(text)) !== null) {
    const value = String(match[1] || "").trim();
    if (shouldKeepString(value)) {
      out.push(value);
    }
  }
  return out;
}

function extractStringsForFile(relPath, text) {
  const ext = path.extname(relPath).toLowerCase();
  const strings = new Set(extractQuotedStrings(text));
  if (ext === ".md") {
    for (const value of extractMarkdownText(text)) {
      strings.add(value);
    }
  }
  if (ext === ".html") {
    for (const value of extractHtmlText(text)) {
      strings.add(value);
    }
  }
  return [...strings].sort(compareAlpha);
}

function renderMarkdown(matrix) {
  const lines = [
    "# String Matrix",
    "",
    "Diese Matrix erzwingt, dass die aktiven Spiel- und Doku-Strings maschinenlesbar und synchron gehalten werden.",
    "",
    "## Scope",
    ""
  ];
  for (const relRoot of matrix.scan_roots) {
    lines.push(`- \`${relRoot}\``);
  }
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Files: ${matrix.file_count}`);
  lines.push(`- Unique Strings: ${matrix.unique_string_count}`);
  lines.push("");
  lines.push("## Files");
  lines.push("");
  for (const file of matrix.files) {
    lines.push(`### ${file.path}`);
    lines.push("");
    lines.push(`- Strings: ${file.string_count}`);
    lines.push(`- Fingerprint: \`${file.fingerprint}\``);
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const files = [];
  const allStrings = new Set();
  for (const relRoot of scanRoots) {
    const absRoot = path.join(root, relRoot);
    let absFiles = [];
    try {
      absFiles = await listFilesRecursive(absRoot);
    } catch {
      continue;
    }
    for (const absFile of absFiles) {
      const relPath = toPosixPath(path.relative(root, absFile));
      if (!supportedExtensions.has(path.extname(relPath).toLowerCase())) {
        continue;
      }
      const content = await readFile(absFile, "utf8");
      const strings = extractStringsForFile(relPath, content);
      for (const value of strings) {
        allStrings.add(value);
      }
      files.push({
        path: relPath,
        string_count: strings.length,
        fingerprint: sha256Hex(strings.join("|")),
        strings: strings.map((value) => ({
          value,
          hash: sha256Hex(value)
        }))
      });
    }
  }

  files.sort((a, b) => compareAlpha(a.path, b.path));
  const matrixFingerprint = sha256Hex(files.map((file) => `${file.path}:${file.fingerprint}`).join("|"));
  const matrix = {
    schemaVersion: 1,
    matrix_fingerprint: matrixFingerprint,
    scan_roots: scanRoots,
    file_count: files.length,
    unique_string_count: allStrings.size,
    files
  };

  const expectedJson = `${JSON.stringify(matrix, null, 2)}\n`;
  const expectedMd = renderMarkdown(matrix);
  const currentJson = await readFile(matrixPath, "utf8").catch(() => "");
  const currentMd = await readFile(reportPath, "utf8").catch(() => "");
  const drift = currentJson !== expectedJson || currentMd !== expectedMd;

  if (writeMode && drift) {
    await writeFile(matrixPath, expectedJson, "utf8");
    await writeFile(reportPath, expectedMd, "utf8");
  }

  if (!writeMode && drift) {
    console.error("[STRING_MATRIX] DRIFT: string matrix is not synchronized.");
    console.error("[STRING_MATRIX] FIX: npm run strings:sync");
    process.exit(1);
  }

  console.log(`[STRING_MATRIX] OK files=${matrix.file_count} strings=${matrix.unique_string_count} mode=${writeMode ? "write" : "check"}`);
}

await main();
