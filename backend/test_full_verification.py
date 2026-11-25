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

print("=== 1. SUPER ADMIN ===")
sa_h = api_call('/api/team/hierarchy', sa_tok)
print("Predecessors count (must be 0):", len(sa_h['predecessors']))
sa_admins = [s['full_name'] for s in sa_h['successors'] if s['role'].lower() == 'admin']
print("Admins in successors:", sa_admins)
assert len(sa_h['predecessors']) == 0, "Super Admin should have 0 predecessors"
assert 'Alex Morgan' in sa_admins and 'Dhanush A' in sa_admins, "Super Admin should see both Admins"

print("\n=== 2. ADMIN 1 (ALEX MORGAN) ===")
a1_h = api_call('/api/team/hierarchy', a1_tok)
print("Predecessors (must be 1):", [p['full_name'] for p in a1_h['predecessors']])
print("Successors:", [s['full_name'] for s in a1_h['successors']])
assert len(a1_h['predecessors']) == 1, "Admin 1 should have exactly 1 predecessor"
assert a1_h['predecessors'][0]['full_name'] == 'Elizabeth Reed', "Admin 1 predecessor must be Super Admin"
assert any(s['full_name'] == 'Sarah Jenkins' for s in a1_h['successors']), "Sarah Jenkins must be in Admin 1 successors"

print("\n=== 3. ADMIN 2 (DHANUSH A) - BRANCH ISOLATION ===")
a2_h = api_call('/api/team/hierarchy', a2_tok)
print("Predecessors (must be 1):", [p['full_name'] for p in a2_h['predecessors']])
print("Successors (must NOT have Sarah Jenkins or her interns):", [s['full_name'] for s in a2_h['successors']])
assert len(a2_h['predecessors']) == 1, "Admin 2 should have exactly 1 predecessor"
assert a2_h['predecessors'][0]['full_name'] == 'Elizabeth Reed', "Admin 2 predecessor must be Super Admin"
assert not any(s['full_name'] == 'Sarah Jenkins' for s in a2_h['successors']), "Sarah Jenkins must NOT be in Admin 2 successors"
assert len(a2_h['successors']) == 0, "Admin 2 should have 0 successors from Admin 1's branch"

print("\n=== 4. TEAM LEAD (SARAH JENKINS) ===")
tl_h = api_call('/api/team/hierarchy', tl_tok)
print("Predecessors (must be 1, Alex Morgan only):", [p['full_name'] for p in tl_h['predecessors']])
print("Successors (interns only):", [s['full_name'] for s in tl_h['successors']])
assert len(tl_h['predecessors']) == 1, "Team Lead should have exactly 1 predecessor"
assert tl_h['predecessors'][0]['full_name'] == 'Alex Morgan', "Sarah Jenkins' predecessor must be Alex Morgan"
assert not any(p['full_name'] == 'Dhanush A' for p in tl_h['predecessors']), "Admin 2 must NOT be in Sarah's predecessors"
assert all(s['role'].lower() == 'intern' for s in tl_h['successors']), "All successors of TL must be interns"

print("\n=== 5. INTERN (PRIYA SHARMA) ===")
int_h = api_call('/api/team/hierarchy', int_tok)
print("Predecessors (must be 1, Sarah Jenkins only):", [p['full_name'] for p in int_h['predecessors']])
print("Successors count (must be 0):", len(int_h['successors']))
print("Peers (fellow interns):", [p['full_name'] for p in int_h['peers']])
assert len(int_h['predecessors']) == 1, "Intern should have exactly 1 predecessor"
assert int_h['predecessors'][0]['full_name'] == 'Sarah Jenkins', "Intern's predecessor must be Sarah Jenkins"
assert len(int_h['successors']) == 0, "Intern must have 0 successors"

print("\n=== 6. ASSIGNEES API ISOLATION ===")
a1_ass = api_call('/api/team/assignees', a1_tok)
a2_ass = api_call('/api/team/assignees', a2_tok)
print("Admin 1 Assignees count:", len(a1_ass['successors']))
print("Admin 2 Assignees count:", len(a2_ass['successors']))
assert len(a1_ass['successors']) == 5, "Admin 1 should have 5 assignees (1 TL + 4 Interns)"
assert len(a2_ass['successors']) == 0, "Admin 2 should have 0 assignees from Admin 1"

print("\n=== 7. DASHBOARD STATS TEAM ISOLATION ===")
a1_dash = api_call('/api/dashboard/stats', a1_tok)
a2_dash = api_call('/api/dashboard/stats', a2_tok)
tl_dash = api_call('/api/dashboard/stats', tl_tok)
int_dash = api_call('/api/dashboard/stats', int_tok)

print("Admin 1 Dashboard team members:", [m['full_name'] for m in a1_dash.get('team_members', [])])
print("Admin 2 Dashboard team members:", [m['full_name'] for m in a2_dash.get('team_members', [])])
print("Team Lead Dashboard predecessor:", tl_dash.get('predecessor_name'))
print("Intern Dashboard predecessor:", int_dash.get('predecessor_name'))

assert any(m['full_name'] == 'Sarah Jenkins' for m in a1_dash.get('team_members', [])), "Sarah must be in Admin 1 dashboard"
assert not any(m['full_name'] == 'Sarah Jenkins' for m in a2_dash.get('team_members', [])), "Sarah must NOT be in Admin 2 dashboard"
assert tl_dash.get('predecessor_name') == 'Alex Morgan', "TL dashboard predecessor must be Alex Morgan"
assert int_dash.get('predecessor_name') == 'Sarah Jenkins', "Intern dashboard predecessor must be Sarah Jenkins"

print("\n>>> ALL TESTS PASSED SUCCESSFULLY! 100% COMPLIANT WITH USER REQUIREMENTS <<<")
