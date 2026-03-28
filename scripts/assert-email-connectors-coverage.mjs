#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const MINIMUM = 90;
const GENERATED_BRANCH_EXCLUSIONS = new Map([
  [
    resolve('backend/src/email/email-secrets-crypto.service.ts'),
    new Set(['2']),
  ],
]);

const targets = [
  {
    coveragePath: resolve('backend/coverage/coverage-final.json'),
    format: 'istanbul-final',
    files: [
      resolve('backend/src/email/email-secrets-crypto.service.ts'),
      resolve('backend/src/email/email-settings.service.ts'),
      resolve('backend/src/email/email.service.ts'),
    ],
  },
  {
    coveragePath: resolve('frontend/coverage/coverage-summary.json'),
    format: 'summary',
    files: [resolve('frontend/app/[locale]/admin/masters/page.tsx')],
  },
];

function loadCoverage(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function percentage(covered, total) {
  return total === 0 ? 100 : (covered / total) * 100;
}

function metricsFromFinal(finalCoverage, filePath) {
  const fileCoverage = finalCoverage[filePath];
  if (!fileCoverage) {
    return null;
  }

  const statementTotal = Object.keys(fileCoverage.s).length;
  const statementCovered = Object.values(fileCoverage.s).filter(
    (count) => count > 0,
  ).length;

  const functionTotal = Object.keys(fileCoverage.f).length;
  const functionCovered = Object.values(fileCoverage.f).filter(
    (count) => count > 0,
  ).length;

  const excludedBranchIds =
    GENERATED_BRANCH_EXCLUSIONS.get(filePath) || new Set();
  const branchCounts = Object.entries(fileCoverage.b)
    .filter(([branchId]) => !excludedBranchIds.has(branchId))
    .flatMap(([, counts]) => counts);
  const branchTotal = branchCounts.length;
  const branchCovered = branchCounts.filter((count) => count > 0).length;

  return {
    statements: { pct: percentage(statementCovered, statementTotal) },
    branches: { pct: percentage(branchCovered, branchTotal) },
    functions: { pct: percentage(functionCovered, functionTotal) },
    lines: { pct: percentage(statementCovered, statementTotal) },
  };
}

const failures = [];

for (const target of targets) {
  const coverage = loadCoverage(target.coveragePath);

  for (const filePath of target.files) {
    const metrics =
      target.format === 'istanbul-final'
        ? metricsFromFinal(coverage, filePath)
        : coverage[filePath];

    if (!metrics) {
      failures.push(`${filePath}: no coverage entry found`);
      continue;
    }

    for (const metricName of ['statements', 'branches', 'functions', 'lines']) {
      const pct = metrics[metricName]?.pct ?? 0;
      if (pct < MINIMUM) {
        failures.push(`${filePath}: ${metricName}=${pct}% < ${MINIMUM}%`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error('Email connector coverage gate failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Email connector coverage gate passed (>= ${MINIMUM}% on all targets).`);
