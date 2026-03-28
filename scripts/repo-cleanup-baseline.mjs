import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

const artifactDirs = [
  'dist',
  'build',
  'coverage',
  'test-results',
  'playwright-report',
  '.nyc_output',
  '.cache',
  'tmp',
  'output'
];

const scanRoots = ['src', 'scripts', 'docs', 'tools'];
const textExtensions = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.json',
  '.md',
  '.html',
  '.css'
]);

async function exists(target) {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const out = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walkFiles(full)));
      continue;
    }
    if (entry.isFile() && textExtensions.has(path.extname(entry.name).toLowerCase())) {
      out.push(full);
    }
  }
  return out;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const packageJsonPath = path.join(repoRoot, 'package.json');
  const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
  const deps = Object.keys(packageJson.dependencies || {});

  const fileList = [];
  for (const root of scanRoots) {
    const target = path.join(repoRoot, root);
    if (await exists(target)) {
      fileList.push(...(await walkFiles(target)));
    }
  }
  const scanFiles = fileList.filter((file) => {
    const rel = path.relative(repoRoot, file).replace(/\\/g, '/');
    if (rel === 'scripts/repo-cleanup-baseline.mjs') {
      return false;
    }
    if (rel.startsWith('docs/IN PLANUNG/cleanup-reports/')) {
      return false;
    }
    return true;
  });

  const findings = {
    date: today,
    artifactsAtRepoRoot: [],
    testFocusOrSkip: [],
    todoFixme: [],
    dependencyCandidates: []
  };

  for (const dirName of artifactDirs) {
    const full = path.join(repoRoot, dirName);
    if (await exists(full)) {
      findings.artifactsAtRepoRoot.push(dirName);
    }
  }

  for (const file of scanFiles) {
    let content;
    try {
      content = await fs.readFile(file, 'utf8');
    } catch {
      continue;
    }

    const rel = path.relative(repoRoot, file).replace(/\\/g, '/');
    const lines = content.split(/\r?\n/);

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (/(it\.only|test\.only|describe\.only|it\.skip|test\.skip|describe\.skip)/.test(line)) {
        findings.testFocusOrSkip.push(`${rel}:${i + 1}`);
      }
      if (/(TODO|FIXME|NOTE|XXX|@todo|@fixme)/i.test(line)) {
        findings.todoFixme.push(`${rel}:${i + 1}`);
      }
    }
  }

  for (const dep of deps) {
    const depPattern = new RegExp(
      `(from\\s+['"]${escapeRegex(dep)}['"]|require\\(\\s*['"]${escapeRegex(dep)}['"]\\s*\\)|import\\(\\s*['"]${escapeRegex(dep)}['"]\\s*\\))`
    );
    let used = false;
    for (const file of scanFiles) {
      if (file.endsWith('package.json')) {
        continue;
      }
      const content = await fs.readFile(file, 'utf8');
      if (depPattern.test(content)) {
        used = true;
        break;
      }
    }
    if (!used) {
      findings.dependencyCandidates.push(dep);
    }
  }

  const report = [
    '# Repo Cleanup Baseline',
    '',
    `Date: ${findings.date}`,
    '',
    '## Root Artifact Dirs',
    findings.artifactsAtRepoRoot.length > 0
      ? findings.artifactsAtRepoRoot.map((v) => `- ${v}`).join('\n')
      : '- none',
    '',
    '## Test Focus/Skip Markers',
    findings.testFocusOrSkip.length > 0
      ? findings.testFocusOrSkip.map((v) => `- ${v}`).join('\n')
      : '- none',
    '',
    '## TODO/FIXME Markers',
    findings.todoFixme.length > 0
      ? findings.todoFixme.map((v) => `- ${v}`).join('\n')
      : '- none',
    '',
    '## Dependency Candidates (manual review required)',
    findings.dependencyCandidates.length > 0
      ? findings.dependencyCandidates.map((v) => `- ${v}`).join('\n')
      : '- none',
    '',
    '## Safety Notes',
    '- No files were deleted or moved by this script.',
    '- Treat dependency candidates as hints, not deletion orders.',
    ''
  ].join('\n');

  const write = process.argv.includes('--write');
  if (write) {
    const reportDir = path.join(repoRoot, 'docs', 'IN PLANUNG', 'cleanup-reports');
    await fs.mkdir(reportDir, { recursive: true });
    const reportPath = path.join(reportDir, `REPO_CLEANUP_BASELINE_${today}.md`);
    await fs.writeFile(reportPath, `${report}\n`, 'utf8');
    console.log(`Wrote ${path.relative(repoRoot, reportPath).replace(/\\/g, '/')}`);
    return;
  }

  console.log(report);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
