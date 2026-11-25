import urllib.request
import json

def login(email, pwd):
    req = urllib.request.Request(
        'http://127.0.0.1:8000/api/auth/login',
        data=json.dumps({'email': email, 'password': pwd}).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode('utf-8'))['access_token']

def api_call(endpoint, token):
    req = urllib.request.Request(
        f'http://127.0.0.1:8000{endpoint}',
        headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode('utf-8'))

# Users:
# Super Admin: superadmin@ingage.com (Elizabeth Reed, id=3)
# Admin 1: admin@ingage.com (Alex Morgan, id=4)
# Admin 2: dhanusha130703@gmail.com (Dhanush A, id=1)
# Team Lead: teamlead@ingage.com (Sarah Jenkins, id=5, reports to Alex Morgan)
# Intern: priya.sharma@ingage.com (Priya Sharma, id=6, reports to Sarah Jenkins)

sa_tok = login('superadmin@ingage.com', 'admin123')
a1_tok = login('admin@ingage.com', 'admin123')
a2_tok = login('dhanusha130703@gmail.com', 'admin123')
tl_tok = login('teamlead@ingage.com', 'admin123')
int_tok = login('priya.sharma@ingage.com', 'admin123')

print("="*60)
print("TEST 1: Admin 1 (Alex Morgan) Hierarchy")
h1 = api_call('/api/team/hierarchy', a1_tok)
print("Predecessors:", [p['full_name'] for p in h1['predecessors']])
print("Peers:", [p['full_name'] for p in h1['peers']])
print("Successors:", [(s['full_name'], s['role'], f"rep_id={s['reporting_manager_id']}") for s in h1['successors']])

print("\n" + "="*60)
print("TEST 2: Admin 2 (Dhanush A) Hierarchy (Isolation Verification)")
h2 = api_call('/api/team/hierarchy', a2_tok)
print("Predecessors:", [p['full_name'] for p in h2['predecessors']])
print("Peers:", [p['full_name'] for p in h2['peers']])
print("Successors:", [(s['full_name'], s['role']) for s in h2['successors']])
sarah_in_a2 = any(s['full_name'] == 'Sarah Jenkins' for s in h2['successors'])
print(f"Is Sarah Jenkins visible to Admin 2? -> {sarah_in_a2} (EXPECTED: False)")

print("\n" + "="*60)
print("TEST 3: Assignees API Isolation")
ass1 = api_call('/api/team/assignees', a1_tok)
ass2 = api_call('/api/team/assignees', a2_tok)
print("Admin 1 Successors count:", len(ass1['successors']))
print("Admin 2 Successors count:", len(ass2['successors']))
sarah_in_ass2 = any(s['full_name'] == 'Sarah Jenkins' for s in ass2['successors'])
print(f"Is Sarah Jenkins in Admin 2 assignees? -> {sarah_in_ass2} (EXPECTED: False)")

print("\n" + "="*60)
print("TEST 4: Team Lead (Sarah Jenkins) Hierarchy")
htl = api_call('/api/team/hierarchy', tl_tok)
print("Predecessors:", [p['full_name'] for p in htl['predecessors']])
print("Successors:", [s['full_name'] for s in htl['successors']])
print(f"Direct Lead Officer for Sarah: {htl['predecessors'][0]['full_name']} (EXPECTED: Alex Morgan)")
dhanush_in_tl_pred = any(p['full_name'] == 'Dhanush A' for p in htl['predecessors'])
print(f"Is Admin 2 (Dhanush A) in Sarah's predecessors? -> {dhanush_in_tl_pred} (EXPECTED: False)")

print("\n" + "="*60)
print("TEST 5: Intern (Priya Sharma) Hierarchy")
hint = api_call('/api/team/hierarchy', int_tok)
print("Predecessors:", [p['full_name'] for p in hint['predecessors']])
dhanush_in_int_pred = any(p['full_name'] == 'Dhanush A' for p in hint['predecessors'])
print(f"Is Admin 2 in Intern's predecessors? -> {dhanush_in_int_pred} (EXPECTED: False)")
print("="*60)
