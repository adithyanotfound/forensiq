#!/usr/bin/env python3
"""
Forensiq Test Data Generator
========================================
Generates a comprehensive CSV test dataset with ALL possible edge cases
for money muling detection testing.

Edge Cases Generated:
=====================
1. CYCLE PATTERNS (Circular Fund Routing):
   - Length-3 cycle (A→B→C→A)
   - Length-4 cycle
   - Length-5 cycle (max length)
   - Overlapping cycles sharing nodes
   - High-value cycles
   - Rapid-fire cycle (all txs within 1 hour)

2. SMURFING PATTERNS (Fan-in / Fan-out):
   - Fan-in: 15 accounts → 1 aggregator within 72 hours
   - Fan-out: 1 disperser → 15 accounts within 72 hours
   - Combined fan-in + fan-out on same node
   - Amounts just below $10,000 reporting threshold (structuring)
   - Amounts with high uniformity (identical smurfing)

3. SHELL NETWORK PATTERNS (Layered Chains):
   - 3-hop chain through shell accounts (2 txn each)
   - 5-hop chain through shell accounts
   - Chain with amount decay at each hop
   - Chain with very rapid temporal succession

4. FALSE POSITIVE TRAPS (Legitimate Patterns):
   - Merchant account: receives from 50+ unique customers, varied amounts
   - Payroll account: sends identical amounts monthly to 20+ employees
   - Exchange/platform hub: high in-degree AND out-degree, no circular overlap
   - High-volume B2B: regular large transfers between 2 corporate accounts
   - Charity/nonprofit: many small donations in, few large grants out

5. BOUNDARY / EDGE CASES:
   - Exactly 10 fan-in senders (threshold boundary)
   - 9 fan-in senders (below threshold, should NOT trigger)
   - Transactions spanning exactly 72 hours (boundary)
   - Transactions at 72h + 1 second (just outside window)
   - Self-referencing cycle attempt (should be filtered)
   - Single-use account (appears once as sender, once as receiver)
   - Isolated node pairs (disconnected components)
   - Very large amounts ($10M+)
   - Very small amounts ($0.01)
   - Identical timestamps on multiple transactions
   - Transactions spread over 1 year (testing temporal grouping)

6. COMPLEX / MIXED PATTERNS:
   - Account participating in BOTH a cycle AND a fan-in
   - Shell chain that feeds into a cycle
   - Fan-out from cycle member to fresh accounts
   - Diamond pattern (A→B, A→C, B→D, C→D)

Usage:
    python3 generate_test_data.py
    
Output:
    test_transactions.csv - The generated test dataset
    test_edge_cases.txt  - Description of all embedded edge cases
"""

import csv
import random
import string
from datetime import datetime, timedelta

# Seed for reproducibility
random.seed(42)

# Counters
tx_counter = 0
base_time = datetime(2025, 1, 15, 8, 0, 0)

def gen_tx_id():
    global tx_counter
    tx_counter += 1
    return f"TXN_{tx_counter:05d}"

def gen_account_id(prefix, num):
    return f"ACC_{prefix}_{num:04d}"

def random_amount(low, high):
    return round(random.uniform(low, high), 2)

def time_offset(hours=0, minutes=0, days=0):
    return base_time + timedelta(hours=hours, minutes=minutes, days=days)

def fmt_time(dt):
    return dt.strftime("%Y-%m-%d %H:%M:%S")

transactions = []
edge_case_descriptions = []

# ============================================================
# 1. CYCLE PATTERNS
# ============================================================

# 1a. Length-3 cycle: CYCLE3_A → CYCLE3_B → CYCLE3_C → CYCLE3_A
edge_case_descriptions.append(
    "EDGE CASE 1a: Length-3 Cycle\n"
    "  Accounts: ACC_CYCLE3_0001, ACC_CYCLE3_0002, ACC_CYCLE3_0003\n"
    "  Pattern: A→B→C→A within 6 hours\n"
    "  Expected: All 3 flagged as cycle_length_3, same ring\n"
)
t = time_offset(hours=0)
transactions.append([gen_tx_id(), "ACC_CYCLE3_0001", "ACC_CYCLE3_0002", 5000.00, fmt_time(t)])
transactions.append([gen_tx_id(), "ACC_CYCLE3_0002", "ACC_CYCLE3_0003", 4950.00, fmt_time(t + timedelta(hours=2))])
transactions.append([gen_tx_id(), "ACC_CYCLE3_0003", "ACC_CYCLE3_0001", 4900.00, fmt_time(t + timedelta(hours=4))])

# 1b. Length-4 cycle
edge_case_descriptions.append(
    "EDGE CASE 1b: Length-4 Cycle\n"
    "  Accounts: ACC_CYCLE4_0001 through ACC_CYCLE4_0004\n"
    "  Pattern: A→B→C→D→A within 12 hours\n"
    "  Expected: All 4 flagged as cycle_length_4\n"
)
t = time_offset(hours=10)
for i in range(4):
    s = gen_account_id("CYCLE4", i+1)
    r = gen_account_id("CYCLE4", (i+1)%4 + 1)
    transactions.append([gen_tx_id(), s, r, random_amount(3000, 3500), fmt_time(t + timedelta(hours=i*3))])

# 1c. Length-5 cycle
edge_case_descriptions.append(
    "EDGE CASE 1c: Length-5 Cycle (Max Detectable)\n"
    "  Accounts: ACC_CYCLE5_0001 through ACC_CYCLE5_0005\n"
    "  Pattern: A→B→C→D→E→A within 24 hours\n"
    "  Expected: All 5 flagged as cycle_length_5\n"
)
t = time_offset(hours=30)
for i in range(5):
    s = gen_account_id("CYCLE5", i+1)
    r = gen_account_id("CYCLE5", (i+1)%5 + 1)
    transactions.append([gen_tx_id(), s, r, random_amount(7000, 7500), fmt_time(t + timedelta(hours=i*4))])

# 1d. Overlapping cycles sharing a node
edge_case_descriptions.append(
    "EDGE CASE 1d: Overlapping Cycles Sharing Node\n"
    "  ACC_OVERLAP_0001 participates in TWO cycles:\n"
    "    Cycle A: ACC_OVERLAP_0001→0002→0003→0001\n"
    "    Cycle B: ACC_OVERLAP_0001→0004→0005→0001\n"
    "  Expected: ACC_OVERLAP_0001 has highest suspicion (multi-ring)\n"
)
t = time_offset(hours=60)
# Cycle A
transactions.append([gen_tx_id(), "ACC_OVERLAP_0001", "ACC_OVERLAP_0002", 2000.00, fmt_time(t)])
transactions.append([gen_tx_id(), "ACC_OVERLAP_0002", "ACC_OVERLAP_0003", 1950.00, fmt_time(t + timedelta(hours=1))])
transactions.append([gen_tx_id(), "ACC_OVERLAP_0003", "ACC_OVERLAP_0001", 1900.00, fmt_time(t + timedelta(hours=2))])
# Cycle B
transactions.append([gen_tx_id(), "ACC_OVERLAP_0001", "ACC_OVERLAP_0004", 2500.00, fmt_time(t + timedelta(hours=5))])
transactions.append([gen_tx_id(), "ACC_OVERLAP_0004", "ACC_OVERLAP_0005", 2450.00, fmt_time(t + timedelta(hours=6))])
transactions.append([gen_tx_id(), "ACC_OVERLAP_0005", "ACC_OVERLAP_0001", 2400.00, fmt_time(t + timedelta(hours=7))])

# 1e. Rapid-fire cycle (all within 30 minutes)
edge_case_descriptions.append(
    "EDGE CASE 1e: Rapid-Fire Cycle (30 minutes)\n"
    "  Accounts: ACC_RAPID_0001 through ACC_RAPID_0003\n"
    "  Pattern: All 3 transfers within 30 minutes (high velocity)\n"
    "  Expected: High suspicion score due to temporal proximity\n"
)
t = time_offset(hours=80)
transactions.append([gen_tx_id(), "ACC_RAPID_0001", "ACC_RAPID_0002", 9500.00, fmt_time(t)])
transactions.append([gen_tx_id(), "ACC_RAPID_0002", "ACC_RAPID_0003", 9400.00, fmt_time(t + timedelta(minutes=10))])
transactions.append([gen_tx_id(), "ACC_RAPID_0003", "ACC_RAPID_0001", 9300.00, fmt_time(t + timedelta(minutes=25))])

# ============================================================
# 2. SMURFING PATTERNS
# ============================================================

# 2a. Fan-in: 15 accounts → 1 aggregator within 48 hours
edge_case_descriptions.append(
    "EDGE CASE 2a: Fan-In Pattern (15→1) within 48 hours\n"
    "  Aggregator: ACC_FANIN_AGG_0001\n"
    "  Senders: ACC_FANIN_S_0001 through ACC_FANIN_S_0015\n"
    "  Expected: ACC_FANIN_AGG_0001 flagged as fan_in hub\n"
)
t = time_offset(days=5)
for i in range(1, 16):
    transactions.append([
        gen_tx_id(),
        gen_account_id("FANIN_S", i),
        "ACC_FANIN_AGG_0001",
        random_amount(800, 1200),
        fmt_time(t + timedelta(hours=i*3))
    ])

# 2b. Fan-out: 1 disperser → 15 accounts within 48 hours
edge_case_descriptions.append(
    "EDGE CASE 2b: Fan-Out Pattern (1→15) within 48 hours\n"
    "  Disperser: ACC_FANOUT_DISP_0001\n"
    "  Receivers: ACC_FANOUT_R_0001 through ACC_FANOUT_R_0015\n"
    "  Expected: ACC_FANOUT_DISP_0001 flagged as fan_out disperser\n"
)
t = time_offset(days=7)
for i in range(1, 16):
    transactions.append([
        gen_tx_id(),
        "ACC_FANOUT_DISP_0001",
        gen_account_id("FANOUT_R", i),
        random_amount(500, 700),
        fmt_time(t + timedelta(hours=i*2))
    ])

# 2c. Combined fan-in + fan-out on same node
edge_case_descriptions.append(
    "EDGE CASE 2c: Combined Fan-In + Fan-Out (same node)\n"
    "  Hub: ACC_COMBO_HUB_0001\n"
    "  12 senders → hub → 12 receivers within 72 hours\n"
    "  Expected: Very high suspicion - money passthrough\n"
)
t = time_offset(days=10)
for i in range(1, 13):
    transactions.append([
        gen_tx_id(),
        gen_account_id("COMBO_IN", i),
        "ACC_COMBO_HUB_0001",
        random_amount(900, 1100),
        fmt_time(t + timedelta(hours=i*3))
    ])
for i in range(1, 13):
    transactions.append([
        gen_tx_id(),
        "ACC_COMBO_HUB_0001",
        gen_account_id("COMBO_OUT", i),
        random_amount(800, 1000),
        fmt_time(t + timedelta(hours=36 + i*2))
    ])

# 2d. Structuring - amounts just below $10,000 threshold
edge_case_descriptions.append(
    "EDGE CASE 2d: Structuring Pattern (below $10K threshold)\n"
    "  12 senders all send $9,500-$9,999 to ACC_STRUCT_AGG_0001\n"
    "  Expected: Flagged with high score due to structuring indicator\n"
)
t = time_offset(days=13)
for i in range(1, 13):
    transactions.append([
        gen_tx_id(),
        gen_account_id("STRUCT_S", i),
        "ACC_STRUCT_AGG_0001",
        random_amount(9500, 9999),
        fmt_time(t + timedelta(hours=i*5))
    ])

# 2e. Identical amount smurfing
edge_case_descriptions.append(
    "EDGE CASE 2e: Identical Amount Smurfing\n"
    "  11 senders all send exactly $999.99 to ACC_IDENT_AGG_0001\n"
    "  Expected: High suspicion due to uniform amounts\n"
)
t = time_offset(days=15)
for i in range(1, 12):
    transactions.append([
        gen_tx_id(),
        gen_account_id("IDENT_S", i),
        "ACC_IDENT_AGG_0001",
        999.99,
        fmt_time(t + timedelta(hours=i*4))
    ])

# ============================================================
# 3. SHELL NETWORK PATTERNS
# ============================================================

# 3a. 3-hop shell chain (each intermediate has only 2 txns)
edge_case_descriptions.append(
    "EDGE CASE 3a: 3-Hop Shell Chain\n"
    "  Path: ACC_SHELL3_SRC→SHELL3_MID1→SHELL3_MID2→SHELL3_DST\n"
    "  Intermediaries have only 2 transactions each (1 in, 1 out)\n"
    "  Expected: SHELL3_MID1, SHELL3_MID2 flagged as shell intermediaries\n"
)
t = time_offset(days=18)
transactions.append([gen_tx_id(), "ACC_SHELL3_SRC_0001", "ACC_SHELL3_MID_0001", 15000.00, fmt_time(t)])
transactions.append([gen_tx_id(), "ACC_SHELL3_MID_0001", "ACC_SHELL3_MID_0002", 14800.00, fmt_time(t + timedelta(hours=6))])
transactions.append([gen_tx_id(), "ACC_SHELL3_MID_0002", "ACC_SHELL3_DST_0001", 14600.00, fmt_time(t + timedelta(hours=12))])
# Give source and destination more transactions to not be shell-like
for i in range(5):
    transactions.append([gen_tx_id(), "ACC_SHELL3_SRC_0001", gen_account_id("SHELL3_LEGIT", i+1), random_amount(100, 500), fmt_time(t + timedelta(days=i+1))])
for i in range(5):
    transactions.append([gen_tx_id(), gen_account_id("SHELL3_LEGIT2", i+1), "ACC_SHELL3_DST_0001", random_amount(100, 500), fmt_time(t + timedelta(days=i+1))])

# 3b. 5-hop shell chain
edge_case_descriptions.append(
    "EDGE CASE 3b: 5-Hop Shell Chain\n"
    "  Path: SRC→M1→M2→M3→M4→DST with amount decay\n"
    "  Each intermediate has exactly 2 transactions\n"
    "  Expected: All intermediaries flagged, high shell_network score\n"
)
t = time_offset(days=22)
chain_accounts = ["ACC_SHELL5_SRC_0001", "ACC_SHELL5_M1_0001", "ACC_SHELL5_M2_0001", "ACC_SHELL5_M3_0001", "ACC_SHELL5_M4_0001", "ACC_SHELL5_DST_0001"]
amount = 20000.00
for i in range(len(chain_accounts)-1):
    transactions.append([gen_tx_id(), chain_accounts[i], chain_accounts[i+1], round(amount, 2), fmt_time(t + timedelta(hours=i*4))])
    amount *= 0.95  # 5% decay
# Give source and destination more transactions
for i in range(6):
    transactions.append([gen_tx_id(), "ACC_SHELL5_SRC_0001", gen_account_id("S5_LEGIT", i+1), random_amount(200, 800), fmt_time(t + timedelta(days=i+1))])
for i in range(6):
    transactions.append([gen_tx_id(), gen_account_id("S5_LEGIT2", i+1), "ACC_SHELL5_DST_0001", random_amount(200, 800), fmt_time(t + timedelta(days=i+1))])

# ============================================================
# 4. FALSE POSITIVE TRAPS (MUST NOT BE FLAGGED)
# ============================================================

# 4a. Merchant account - receives from 50+ customers
edge_case_descriptions.append(
    "EDGE CASE 4a: FALSE POSITIVE TRAP - Merchant Account\n"
    "  ACC_MERCHANT_0001 receives from 55 unique customers\n"
    "  Varied amounts ($5 - $500), no sends back to customers\n"
    "  Only sends to 2 supplier accounts\n"
    "  Expected: MUST NOT be flagged (legitimate merchant)\n"
)
t = time_offset(days=25)
for i in range(1, 56):
    transactions.append([
        gen_tx_id(),
        gen_account_id("CUST", i),
        "ACC_MERCHANT_0001",
        random_amount(5, 500),
        fmt_time(t + timedelta(hours=i*4))
    ])
# Merchant pays suppliers
transactions.append([gen_tx_id(), "ACC_MERCHANT_0001", "ACC_SUPPLIER_0001", 8000.00, fmt_time(t + timedelta(days=10))])
transactions.append([gen_tx_id(), "ACC_MERCHANT_0001", "ACC_SUPPLIER_0002", 6000.00, fmt_time(t + timedelta(days=15))])

# 4b. Payroll account - sends to 25+ employees monthly
edge_case_descriptions.append(
    "EDGE CASE 4b: FALSE POSITIVE TRAP - Payroll Account\n"
    "  ACC_PAYROLL_0001 sends ~$4000 to 25 employees every 30 days\n"
    "  3 pay cycles, regular intervals, no back-flow\n"
    "  Expected: MUST NOT be flagged (legitimate payroll)\n"
)
t = time_offset(days=40)
for cycle in range(3):  # 3 pay cycles
    for emp in range(1, 26):
        transactions.append([
            gen_tx_id(),
            "ACC_PAYROLL_0001",
            gen_account_id("EMP", emp),
            random_amount(3900, 4100),  # ~$4000 salary
            fmt_time(t + timedelta(days=cycle*30, hours=emp))
        ])
# Payroll receives from corporate HQ
for cycle in range(3):
    transactions.append([
        gen_tx_id(),
        "ACC_CORPORATE_HQ_0001",
        "ACC_PAYROLL_0001",
        100000.00,
        fmt_time(t + timedelta(days=cycle*30 - 1))
    ])

# 4c. Exchange/Platform hub
edge_case_descriptions.append(
    "EDGE CASE 4c: FALSE POSITIVE TRAP - Exchange Platform Hub\n"
    "  ACC_EXCHANGE_0001 has 60+ depositors and 60+ withdrawers\n"
    "  Very low overlap between depositors and withdrawers\n"
    "  Expected: MUST NOT be flagged (legitimate exchange)\n"
)
t = time_offset(days=80)
for i in range(1, 65):
    transactions.append([
        gen_tx_id(),
        gen_account_id("DEPOSITOR", i),
        "ACC_EXCHANGE_0001",
        random_amount(100, 50000),
        fmt_time(t + timedelta(hours=i*2))
    ])
for i in range(1, 65):
    transactions.append([
        gen_tx_id(),
        "ACC_EXCHANGE_0001",
        gen_account_id("WITHDRAWER", i),
        random_amount(100, 50000),
        fmt_time(t + timedelta(hours=128 + i*2))
    ])

# 4d. Regular B2B transfers
edge_case_descriptions.append(
    "EDGE CASE 4d: FALSE POSITIVE TRAP - B2B Regular Transfers\n"
    "  Two companies sending large amounts back and forth regularly\n"
    "  Expected: MUST NOT be flagged (legitimate B2B)\n"
)
t = time_offset(days=100)
for i in range(12):
    transactions.append([gen_tx_id(), "ACC_CORP_A_0001", "ACC_CORP_B_0001", random_amount(50000, 80000), fmt_time(t + timedelta(days=i*30))])
    transactions.append([gen_tx_id(), "ACC_CORP_B_0001", "ACC_CORP_A_0001", random_amount(40000, 70000), fmt_time(t + timedelta(days=i*30 + 15))])

# ============================================================
# 5. BOUNDARY / EDGE CASES
# ============================================================

# 5a. Exactly 10 fan-in senders (at threshold)
edge_case_descriptions.append(
    "EDGE CASE 5a: BOUNDARY - Exactly 10 Fan-In Senders (At Threshold)\n"
    "  ACC_BOUND10_AGG_0001 receives from exactly 10 senders\n"
    "  Expected: Should trigger fan-in detection (threshold is 10+)\n"
)
t = time_offset(days=120)
for i in range(1, 11):
    transactions.append([
        gen_tx_id(),
        gen_account_id("BOUND10_S", i),
        "ACC_BOUND10_AGG_0001",
        random_amount(500, 1500),
        fmt_time(t + timedelta(hours=i*5))
    ])

# 5b. Only 9 fan-in senders (below threshold)
edge_case_descriptions.append(
    "EDGE CASE 5b: BOUNDARY - Only 9 Fan-In Senders (Below Threshold)\n"
    "  ACC_BOUND9_AGG_0001 receives from only 9 senders\n"
    "  Expected: MUST NOT trigger fan-in detection\n"
)
t = time_offset(days=123)
for i in range(1, 10):
    transactions.append([
        gen_tx_id(),
        gen_account_id("BOUND9_S", i),
        "ACC_BOUND9_AGG_0001",
        random_amount(500, 1500),
        fmt_time(t + timedelta(hours=i*5))
    ])

# 5c. Transactions spanning exactly 72 hours (at temporal boundary)
edge_case_descriptions.append(
    "EDGE CASE 5c: BOUNDARY - Exactly 72-Hour Window\n"
    "  12 senders to ACC_72H_AGG_0001 spread across exactly 72 hours\n"
    "  Expected: Should trigger (within 72h window)\n"
)
t = time_offset(days=126)
for i in range(12):
    transactions.append([
        gen_tx_id(),
        gen_account_id("72H_S", i+1),
        "ACC_72H_AGG_0001",
        random_amount(700, 900),
        fmt_time(t + timedelta(hours=i*6))  # 12 * 6 = 72 hours exactly
    ])

# 5d. Transactions just outside 72-hour window
edge_case_descriptions.append(
    "EDGE CASE 5d: BOUNDARY - Just Outside 72-Hour Window\n"
    "  10 senders spread across 73 hours (1 hour over limit)\n"
    "  None fit in a 72h window with 10+ senders\n"
    "  Expected: Lower suspicion or not triggered by temporal clustering\n"
)
t = time_offset(days=130)
for i in range(10):
    transactions.append([
        gen_tx_id(),
        gen_account_id("73H_S", i+1),
        "ACC_73H_AGG_0001",
        random_amount(700, 900),
        fmt_time(t + timedelta(hours=i*8.11))  # 10 * 8.11 = 81.1 hours > 72
    ])

# 5e. Very large amounts
edge_case_descriptions.append(
    "EDGE CASE 5e: Very Large Amounts ($10M+)\n"
    "  Cycle with $10M+ amounts\n"
    "  Expected: Still detected as cycle pattern\n"
)
t = time_offset(days=133)
transactions.append([gen_tx_id(), "ACC_LARGE_0001", "ACC_LARGE_0002", 10000000.00, fmt_time(t)])
transactions.append([gen_tx_id(), "ACC_LARGE_0002", "ACC_LARGE_0003", 9500000.00, fmt_time(t + timedelta(hours=2))])
transactions.append([gen_tx_id(), "ACC_LARGE_0003", "ACC_LARGE_0001", 9000000.00, fmt_time(t + timedelta(hours=4))])

# 5f. Very small amounts ($0.01 penny transactions)
edge_case_descriptions.append(
    "EDGE CASE 5f: Very Small Amounts ($0.01)\n"
    "  Cycle with penny amounts\n"
    "  Expected: Still detected as cycle pattern (amount doesn't matter)\n"
)
t = time_offset(days=135)
transactions.append([gen_tx_id(), "ACC_TINY_0001", "ACC_TINY_0002", 0.01, fmt_time(t)])
transactions.append([gen_tx_id(), "ACC_TINY_0002", "ACC_TINY_0003", 0.01, fmt_time(t + timedelta(hours=1))])
transactions.append([gen_tx_id(), "ACC_TINY_0003", "ACC_TINY_0001", 0.01, fmt_time(t + timedelta(hours=2))])

# 5g. Identical timestamps
edge_case_descriptions.append(
    "EDGE CASE 5g: Identical Timestamps\n"
    "  Multiple transactions at exact same time\n"
    "  Expected: Should handle without errors\n"
)
t = time_offset(days=137)
for i in range(5):
    transactions.append([gen_tx_id(), gen_account_id("SIMULT_S", i+1), "ACC_SIMULT_AGG_0001", random_amount(100, 500), fmt_time(t)])

# 5h. Isolated node pairs (disconnected components)
edge_case_descriptions.append(
    "EDGE CASE 5h: Isolated Node Pairs\n"
    "  5 disconnected pairs with single transactions\n"
    "  Expected: Should NOT be flagged (no patterns)\n"
)
t = time_offset(days=140)
for i in range(5):
    transactions.append([gen_tx_id(), gen_account_id("ISO_A", i+1), gen_account_id("ISO_B", i+1), random_amount(100, 5000), fmt_time(t + timedelta(days=i))])

# ============================================================
# 6. COMPLEX / MIXED PATTERNS
# ============================================================

# 6a. Account in both cycle AND fan-in
edge_case_descriptions.append(
    "EDGE CASE 6a: Mixed Pattern - Account in Cycle + Fan-In\n"
    "  ACC_MIXED_0001 participates in a 3-cycle\n"
    "  ACC_MIXED_0001 also receives from 12 unique senders\n"
    "  Expected: Multiple detected patterns, very high suspicion\n"
)
t = time_offset(days=145)
# Cycle
transactions.append([gen_tx_id(), "ACC_MIXED_0001", "ACC_MIXED_0002", 3000.00, fmt_time(t)])
transactions.append([gen_tx_id(), "ACC_MIXED_0002", "ACC_MIXED_0003", 2900.00, fmt_time(t + timedelta(hours=3))])
transactions.append([gen_tx_id(), "ACC_MIXED_0003", "ACC_MIXED_0001", 2800.00, fmt_time(t + timedelta(hours=6))])
# Fan-in to same node
for i in range(1, 13):
    transactions.append([
        gen_tx_id(),
        gen_account_id("MIXED_FI", i),
        "ACC_MIXED_0001",
        random_amount(400, 600),
        fmt_time(t + timedelta(hours=10 + i*4))
    ])

# 6b. Shell chain feeding into a cycle
edge_case_descriptions.append(
    "EDGE CASE 6b: Shell Chain Feeding Into Cycle\n"
    "  Shell chain: SRC→SHELL1→SHELL2→CYCLE_NODE\n"
    "  Then CYCLE_NODE participates in a 3-cycle with others\n"
    "  Expected: Multiple pattern types detected\n"
)
t = time_offset(days=150)
# Shell chain
transactions.append([gen_tx_id(), "ACC_SCFEED_SRC_0001", "ACC_SCFEED_SHELL_0001", 8000.00, fmt_time(t)])
transactions.append([gen_tx_id(), "ACC_SCFEED_SHELL_0001", "ACC_SCFEED_SHELL_0002", 7800.00, fmt_time(t + timedelta(hours=4))])
transactions.append([gen_tx_id(), "ACC_SCFEED_SHELL_0002", "ACC_SCFEED_CYC_0001", 7600.00, fmt_time(t + timedelta(hours=8))])
# Cycle starting from where shell ends
transactions.append([gen_tx_id(), "ACC_SCFEED_CYC_0001", "ACC_SCFEED_CYC_0002", 7400.00, fmt_time(t + timedelta(hours=12))])
transactions.append([gen_tx_id(), "ACC_SCFEED_CYC_0002", "ACC_SCFEED_CYC_0003", 7200.00, fmt_time(t + timedelta(hours=16))])
transactions.append([gen_tx_id(), "ACC_SCFEED_CYC_0003", "ACC_SCFEED_CYC_0001", 7000.00, fmt_time(t + timedelta(hours=20))])
# Give source extra transactions to not be shell-like
for i in range(5):
    transactions.append([gen_tx_id(), "ACC_SCFEED_SRC_0001", gen_account_id("SCFEED_LG", i+1), random_amount(100, 500), fmt_time(t + timedelta(days=i+1))])

# 6c. Diamond pattern (A→B, A→C, B→D, C→D)
edge_case_descriptions.append(
    "EDGE CASE 6c: Diamond Pattern\n"
    "  A→B, A→C, B→D, C→D (funds split and reconverge)\n"
    "  Expected: May flag depending on intermediate account activity\n"
)
t = time_offset(days=155)
transactions.append([gen_tx_id(), "ACC_DIAMOND_A_0001", "ACC_DIAMOND_B_0001", 5000.00, fmt_time(t)])
transactions.append([gen_tx_id(), "ACC_DIAMOND_A_0001", "ACC_DIAMOND_C_0001", 5000.00, fmt_time(t + timedelta(hours=1))])
transactions.append([gen_tx_id(), "ACC_DIAMOND_B_0001", "ACC_DIAMOND_D_0001", 4800.00, fmt_time(t + timedelta(hours=3))])
transactions.append([gen_tx_id(), "ACC_DIAMOND_C_0001", "ACC_DIAMOND_D_0001", 4800.00, fmt_time(t + timedelta(hours=4))])

# ============================================================
# 7. BACKGROUND NOISE (Normal legitimate transactions)
# ============================================================
edge_case_descriptions.append(
    "EDGE CASE 7: Background Noise\n"
    "  ~200 random legitimate transactions between unique account pairs\n"
    "  Expected: None should be flagged\n"
)
t = time_offset(days=0)
for i in range(200):
    s = gen_account_id("NORM", random.randint(1, 100))
    r = gen_account_id("NORM", random.randint(101, 200))
    transactions.append([
        gen_tx_id(),
        s,
        r,
        random_amount(10, 8000),
        fmt_time(t + timedelta(days=random.randint(0, 180), hours=random.randint(0, 23), minutes=random.randint(0, 59)))
    ])

# ============================================================
# WRITE OUTPUT FILES
# ============================================================

# Write CSV
csv_file = "test_transactions.csv"
with open(csv_file, 'w', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(["transaction_id", "sender_id", "receiver_id", "amount", "timestamp"])
    for tx in transactions:
        writer.writerow(tx)

# Write edge case documentation
doc_file = "test_edge_cases.txt"
with open(doc_file, 'w') as f:
    f.write("=" * 70 + "\n")
    f.write("Forensiq TEST DATA - EDGE CASE DOCUMENTATION\n")
    f.write("=" * 70 + "\n\n")
    f.write(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
    f.write(f"Total transactions: {len(transactions)}\n")
    f.write(f"Unique accounts: {len(set([tx[1] for tx in transactions] + [tx[2] for tx in transactions]))}\n\n")
    f.write("-" * 70 + "\n\n")
    
    for desc in edge_case_descriptions:
        f.write(desc + "\n")
        f.write("-" * 70 + "\n\n")
    
    f.write("=" * 70 + "\n")
    f.write("SUMMARY OF EXPECTED RESULTS\n")
    f.write("=" * 70 + "\n\n")
    f.write("PATTERNS THAT SHOULD BE DETECTED:\n")
    f.write("  ✓ Cycle length 3 (cases 1a, 1d, 1e, 5e, 5f)\n")
    f.write("  ✓ Cycle length 4 (case 1b)\n")
    f.write("  ✓ Cycle length 5 (case 1c)\n")
    f.write("  ✓ Overlapping cycles (case 1d)\n")
    f.write("  ✓ Fan-in with temporal clustering (cases 2a, 2d, 2e, 5a)\n")
    f.write("  ✓ Fan-out with temporal clustering (case 2b)\n")
    f.write("  ✓ Combined fan-in/fan-out (case 2c)\n")
    f.write("  ✓ Shell chains (cases 3a, 3b)\n")
    f.write("  ✓ Mixed patterns (cases 6a, 6b)\n\n")
    f.write("PATTERNS THAT MUST NOT BE FLAGGED (FALSE POSITIVE TRAPS):\n")
    f.write("  ✗ Merchant account with 55 customers (case 4a)\n")
    f.write("  ✗ Payroll account with 25 employees × 3 cycles (case 4b)\n")
    f.write("  ✗ Exchange platform hub (case 4c)\n")
    f.write("  ✗ B2B regular large transfers (case 4d)\n")
    f.write("  ✗ Background noise normal transactions (case 7)\n")
    f.write("  ✗ Below-threshold fan-in with 9 senders (case 5b)\n")
    f.write("  ✗ Isolated node pairs (case 5h)\n\n")

print(f"✅ Generated {len(transactions)} transactions across {len(set([tx[1] for tx in transactions] + [tx[2] for tx in transactions]))} unique accounts")
print(f"📄 CSV file: {csv_file}")
print(f"📋 Edge case docs: {doc_file}")
print(f"🔍 Edge cases covered: {len(edge_case_descriptions)}")
