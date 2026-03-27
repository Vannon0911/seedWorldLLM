import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const FUNCTION_PATTERNS = [
  { kind: "function", regex: /\b(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/g },
  { kind: "arrow", regex: /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g },
  { kind: "function-expression", regex: /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function\b/g }
];

function toPosixRelative(root, filePath) {
  return path.relative(root, filePath).split(path.sep).join("/");
}

function categoryForFile(relPath) {
  if (relPath.startsWith("src/kernel/interface")) {
    return "kernel-interface";
  }

  if (relPath.startsWith("src/kernel/patchDispatcher")) {
    return "kernel-dispatcher";
  }

  if (relPath.startsWith("src/kernel/")) {
    return "kernel-core";
  }

  if (relPath.startsWith("src/")) {
    return "app";
  }

  if (relPath.startsWith("tools/runtime/")) {
    return "runtime-tooling";
  }

  if (relPath.startsWith("tests/")) {
    return "testing";
  }

  return "misc";
}

function lineForIndex(content, index) {
  return content.slice(0, index).split("\n").length;
}

function parseFunctionsInFile(content) {
  const out = [];

  for (const pattern of FUNCTION_PATTERNS) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match = regex.exec(content);

    while (match) {
      out.push({
        name: match[1],
        line: lineForIndex(content, match.index),
        kind: pattern.kind
      });
      match = regex.exec(content);
    }
  }

  return out;
}

async function listFilesRecursive(rootDir) {
  const stack = [rootDir];
  const files = [];

  while (stack.length > 0) {
    const current = stack.pop();
    const entries = await readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(absolute);
        continue;
      }

      files.push(absolute);
    }
  }

  return files;
}

function isTargetFile(relPath) {
  return relPath.endsWith(".js") || relPath.endsWith(".mjs");
}

export async function buildFunctionSot(root) {
  const scanRoots = ["src", "tools/runtime", "tests"];
  const sourceFiles = [];
  const records = [];

  for (const scanRoot of scanRoots) {
    const absoluteRoot = path.join(root, scanRoot);
    const files = await listFilesRecursive(absoluteRoot);

    for (const file of files) {
      const rel = toPosixRelative(root, file);
      if (!isTargetFile(rel)) {
        continue;
      }

      sourceFiles.push(file);
    }
  }

  sourceFiles.sort((a, b) => toPosixRelative(root, a).localeCompare(toPosixRelative(root, b)));
  const contents = await Promise.all(sourceFiles.map((file) => readFile(file, "utf8")));

  for (let index = 0; index < sourceFiles.length; index += 1) {
    const file = sourceFiles[index];
    const rel = toPosixRelative(root, file);
    const content = contents[index];
    const functions = parseFunctionsInFile(content);
    const category = categoryForFile(rel);

    for (const fn of functions) {
      records.push({
        id: `${rel}#${fn.name}@${fn.line}`,
        name: fn.name,
        file: rel,
        line: fn.line,
        kind: fn.kind,
        category
      });
    }
  }

  records.sort((a, b) => {
    if (a.file !== b.file) {
      return a.file.localeCompare(b.file);
    }

    if (a.line !== b.line) {
      return a.line - b.line;
    }

    if (a.name !== b.name) {
      return a.name.localeCompare(b.name);
    }

    return a.kind.localeCompare(b.kind);
  });

  return {
    version: "function-sot.v1",
    generatedFrom: scanRoots,
    functions: records
  };
}
