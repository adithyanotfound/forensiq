#!/usr/bin/env python3
"""Quick test script to check analysis results"""
import subprocess, json

result = subprocess.run(
    ['curl', '-s', '-X', 'POST', '-F', 'file=@/Users/adithya/Documents/tset/test_transactions.csv', 'http://localhost:3001/api/analyze'],
    capture_output=True, text=True
)

d = json.loads(result.stdout)
s = d['results']['summary']
print('=== SUMMARY ===')
print(json.dumps(s, indent=2))
print()

print('=== FRAUD RINGS ===')
for r in d['results']['fraud_rings']:
    members_str = ', '.join(r['member_accounts'][:8])
    extra = '...' if len(r['member_accounts']) > 8 else ''
    print(f"  {r['ring_id']}: {r['pattern_type']} ({len(r['member_accounts'])} members, score: {r['risk_score']})")
    print(f"    Members: {members_str}{extra}")
print()

# Check false positive traps
sus_ids = set(a['account_id'] for a in d['results']['suspicious_accounts'])
fp_traps = ['ACC_MERCHANT_0001', 'ACC_PAYROLL_0001', 'ACC_EXCHANGE_0001', 'ACC_CORPORATE_HQ_0001']
print('=== FALSE POSITIVE CHECK ===')
for trap in fp_traps:
    status = 'FLAGGED (BAD!)' if trap in sus_ids else 'NOT FLAGGED (GOOD!)'
    print(f'  {trap}: {status}')

cust_flagged = sum(1 for a in sus_ids if a.startswith('ACC_CUST_'))
emp_flagged = sum(1 for a in sus_ids if a.startswith('ACC_EMP_'))
dep_flagged = sum(1 for a in sus_ids if a.startswith('ACC_DEPOSITOR_'))
wdr_flagged = sum(1 for a in sus_ids if a.startswith('ACC_WITHDRAWER_'))
print(f'  Customers flagged: {cust_flagged}/55')
print(f'  Employees flagged: {emp_flagged}/25')
print(f'  Depositors flagged: {dep_flagged}/64')
print(f'  Withdrawers flagged: {wdr_flagged}/64')

# True positives
cycle_ids = ['ACC_CYCLE3_0001','ACC_CYCLE3_0002','ACC_CYCLE3_0003',
             'ACC_CYCLE4_0001','ACC_CYCLE4_0002','ACC_CYCLE4_0003','ACC_CYCLE4_0004',
             'ACC_CYCLE5_0001','ACC_CYCLE5_0002','ACC_CYCLE5_0003','ACC_CYCLE5_0004','ACC_CYCLE5_0005']
print()
print('=== TRUE POSITIVE CHECK ===')
for c in cycle_ids:
    status = 'DETECTED (GOOD!)' if c in sus_ids else 'MISSED (BAD!)'
    print(f'  {c}: {status}')

overlap_detected = all(f'ACC_OVERLAP_000{i}' in sus_ids for i in range(1,6))
print(f'  Overlapping cycles detected: {overlap_detected}')
print(f'  Rapid cycle detected: {all(f"ACC_RAPID_000{i}" in sus_ids for i in range(1,4))}')

# Shell networks
shell_detected = 'ACC_SHELL3_MID_0001' in sus_ids and 'ACC_SHELL3_MID_0002' in sus_ids
print(f'  Shell intermediaries detected: {shell_detected}')

fanin_hub = 'ACC_FANIN_AGG_0001' in sus_ids
print(f'  Fan-in aggregator detected: {fanin_hub}')

print(f'\nTotal suspicious: {len(sus_ids)}')
print(f'Total rings: {len(d["results"]["fraud_rings"])}')
