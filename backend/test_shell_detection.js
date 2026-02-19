/**
 * Test: Layered Shell Network Detection
 *
 * Verifies both example scenarios from the spec:
 *   Scenario 1 – Exact pass-through (all hops same amount)
 *   Scenario 2 – Gradual decay (small decreases each hop)
 */

const ForensicsEngine = require('./detection/forensicsEngine');

// ── Scenario 1: Exact pass-through ─────────────────────────────────
// O1 → SH1 → SH2 → SH3 → E1, all 200,000
const exactPassThroughTxns = [
    { transaction_id: 'T13', sender_id: 'O1', receiver_id: 'SH1', amount: 200000, timestamp: '2026-01-06 10:00:00' },
    { transaction_id: 'T14', sender_id: 'SH1', receiver_id: 'SH2', amount: 200000, timestamp: '2026-01-06 10:08:00' },
    { transaction_id: 'T15', sender_id: 'SH2', receiver_id: 'SH3', amount: 200000, timestamp: '2026-01-06 10:15:00' },
    { transaction_id: 'T16', sender_id: 'SH3', receiver_id: 'E1', amount: 200000, timestamp: '2026-01-06 10:23:00' },
];

// ── Scenario 2: Gradual decay ──────────────────────────────────────
// O2 → SH4 → SH5 → SH6 → E2, amounts decrease by small fees
const gradualDecayTxns = [
    { transaction_id: 'T17', sender_id: 'O2', receiver_id: 'SH4', amount: 200000, timestamp: '2026-01-06 11:00:00' },
    { transaction_id: 'T18', sender_id: 'SH4', receiver_id: 'SH5', amount: 198000, timestamp: '2026-01-06 11:08:00' },
    { transaction_id: 'T19', sender_id: 'SH5', receiver_id: 'SH6', amount: 195000, timestamp: '2026-01-06 11:15:00' },
    { transaction_id: 'T20', sender_id: 'SH6', receiver_id: 'E2', amount: 190000, timestamp: '2026-01-06 11:23:00' },
];

// Combine both scenarios
const allTransactions = [...exactPassThroughTxns, ...gradualDecayTxns];

// Run the engine
const engine = new ForensicsEngine(allTransactions);
const results = engine.analyze();

// ── Assertions ─────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(condition, label) {
    if (condition) {
        console.log(`  ✅ ${label}`);
        passed++;
    } else {
        console.error(`  ❌ ${label}`);
        failed++;
    }
}

console.log('\n═══════════════════════════════════════════');
console.log('  Shell Network Detection Tests');
console.log('═══════════════════════════════════════════\n');

// Check that shell network rings were detected
const shellRings = results.fraud_rings.filter(r => r.pattern_type === 'shell_network');
assert(shellRings.length >= 2, `Detected >= 2 shell network rings (got ${shellRings.length})`);

// Check Scenario 1: exact pass-through chain
const chain1Members = ['O1', 'SH1', 'SH2', 'SH3', 'E1'];
const ring1 = shellRings.find(r =>
    chain1Members.every(m => r.member_accounts.includes(m))
);
assert(!!ring1, 'Scenario 1 (exact pass-through) chain detected');
if (ring1) {
    assert(ring1.risk_score >= 60, `  Risk score >= 60 (got ${ring1.risk_score})`);
}

// Check Scenario 2: gradual decay chain
const chain2Members = ['O2', 'SH4', 'SH5', 'SH6', 'E2'];
const ring2 = shellRings.find(r =>
    chain2Members.every(m => r.member_accounts.includes(m))
);
assert(!!ring2, 'Scenario 2 (gradual decay) chain detected');
if (ring2) {
    assert(ring2.risk_score >= 60, `  Risk score >= 60 (got ${ring2.risk_score})`);
}

// Check suspicious accounts include shell intermediaries
const suspiciousIds = results.suspicious_accounts.map(a => a.account_id);
assert(suspiciousIds.includes('SH1'), 'SH1 flagged as suspicious');
assert(suspiciousIds.includes('SH2'), 'SH2 flagged as suspicious');
assert(suspiciousIds.includes('SH3'), 'SH3 flagged as suspicious');
assert(suspiciousIds.includes('SH4'), 'SH4 flagged as suspicious');
assert(suspiciousIds.includes('SH5'), 'SH5 flagged as suspicious');
assert(suspiciousIds.includes('SH6'), 'SH6 flagged as suspicious');

// Check pattern labels on suspicious shell accounts
const sh1 = results.suspicious_accounts.find(a => a.account_id === 'SH1');
if (sh1) {
    assert(sh1.detected_patterns.includes('shell_intermediary'), 'SH1 has shell_intermediary pattern');
}

console.log('\n───────────────────────────────────────────');
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('───────────────────────────────────────────\n');

// Print summary
console.log('Summary:');
console.log(`  Suspicious accounts: ${results.suspicious_accounts.length}`);
console.log(`  Fraud rings: ${results.fraud_rings.length}`);
console.log(`  Shell rings: ${shellRings.length}`);

if (failed > 0) {
    console.log('\n⚠️  Some tests failed. See above for details.');
    process.exit(1);
} else {
    console.log('\n🎉 All tests passed!');
}
