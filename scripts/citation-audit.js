#!/usr/bin/env node
/**
 * ══════════════════════════════════════════════════════════════
 * Monthly Citation Style Audit
 * Runs via GitHub Actions on the 1st of each month
 *
 * Checks master_citation_styles.json against known court rule
 * patterns and reports any inconsistencies.
 * ══════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');

const REPO_ROOT = process.env.GITHUB_WORKSPACE || path.resolve(__dirname, '..');

// Known canonical citation patterns by jurisdiction
const CANONICAL_PATTERNS = {
  federal: {
    statute: /^\d{1,3}\s+U\.S\.C\.\s+§\s+\d/,
    regulation: /^\d{1,3}\s+C\.F\.R\.\s+§\s+\d/,
    rule_civ: /^Fed\.\s+R\.\s+Civ\.\s+P\.\s+\d/,
    rule_app: /^Fed\.\s+R\.\s+App\.\s+P\.\s+\d/,
    rule_evid: /^Fed\.\s+R\.\s+Evid\.\s+\d/
  },
  california: {
    statute: /^Cal\.\s+\w+\.?\s+Code\s+§\s+\d/
  },
  colorado: {
    statute: /^Colo\.\s+Rev\.\s+Stat\.\s+§\s+\d/
  },
  newyork: {
    statute: /^N\.Y\.\s+\w/
  }
};

function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Monthly Citation Style Audit');
  console.log(`  ${new Date().toISOString()}`);
  console.log('═══════════════════════════════════════════════');

  // Check if citation styles file exists
  const stylesPath = path.join(REPO_ROOT, 'master_citation_styles.json');
  if (!fs.existsSync(stylesPath)) {
    console.log('  No master_citation_styles.json found — skipping audit');
    return;
  }

  try {
    const styles = JSON.parse(fs.readFileSync(stylesPath, 'utf8'));
    let issues = 0;

    console.log(`\n  Auditing ${Object.keys(styles).length} jurisdiction entries...\n`);

    for (const [jurisdiction, rules] of Object.entries(styles)) {
      const patterns = CANONICAL_PATTERNS[jurisdiction.toLowerCase()];
      if (!patterns) continue;

      for (const [ruleType, pattern] of Object.entries(patterns)) {
        const example = rules[ruleType]?.example;
        if (example && !pattern.test(example)) {
          console.log(`  ⚠️ ${jurisdiction}.${ruleType}: "${example}" doesn't match canonical pattern`);
          issues++;
        }
      }
    }

    if (issues === 0) {
      console.log('  ✓ All citation styles match canonical patterns');
    } else {
      console.log(`\n  ⚠️ ${issues} issue(s) found — review manually`);
    }
  } catch (e) {
    console.error(`  Error reading styles: ${e.message}`);
  }

  // Also audit any URLs in the JS files that point to legal databases
  console.log('\n  Checking legal database URL patterns in JS files...');
  const jsFiles = ['js/gov-hub.js'];
  for (const rel of jsFiles) {
    const filePath = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(filePath)) continue;
    const src = fs.readFileSync(filePath, 'utf8');

    // Check CourtListener URLs
    const clUrls = src.match(/courtlistener\.com\/[^\s'"`)]+/g) || [];
    console.log(`  ${rel}: ${clUrls.length} CourtListener URLs found`);

    // Check for common bad patterns
    const badPatterns = [
      { re: /courtlistener\.com\/c\/\d+\/[A-Z]/g, desc: 'CourtListener URL with volume before reporter (wrong order)' }
    ];
    for (const bp of badPatterns) {
      const matches = src.match(bp.re) || [];
      if (matches.length > 0) {
        console.log(`  ⚠️ ${matches.length} instances of: ${bp.desc}`);
      }
    }
  }

  console.log('\n✓ Citation audit complete');
}

main();
