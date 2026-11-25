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

def api_call(endpoint, token, method='GET', data=None):
    req = urllib.request.Request(
        f'http://127.0.0.1:8000{endpoint}',
        data=json.dumps(data).encode('utf-8') if data else None,
        headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
        method=method
    )
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read().decode('utf-8'))

admin_tok = login('admin@tasktrack.com', 'admin123')
intern_tok = login('ananya.rao@tasktrack.com', 'intern123')
sa_tok = login('superadmin@tasktrack.com', 'superadmin123')

print('--- Test 1: Today Attendance ---')
s, r = api_call('/api/attendance/today', intern_tok)
print(f"Intern today: status={s}, user={r['user_name']}, active_session={r['active_session']['session_name']}")

print('\n--- Test 2: Superadmin Punch Exemption ---')
s, r = api_call('/api/attendance/mark', sa_tok, 'POST', {'action': 'check_in'})
print(f"Superadmin mark: status={s}, response={r}")

print('\n--- Test 3: Intern Punch Check-in ---')
s, r = api_call('/api/attendance/mark', intern_tok, 'POST', {'action': 'check_in'})
print(f"Intern mark check-in: status={s}, response={r['message']}")

print('\n--- Test 4: My Attendance (Reverse Order & Pagination) ---')
s, r = api_call('/api/attendance/my?page=1&page_size=5', intern_tok)
print(f"My Attendance: total={r['total']}, page={r['page']}, count={len(r['items'])}")
dates = [item['date'] for item in r['items']]
print(f"Dates (newest first): {dates}")

print('\n--- Test 5: Team Attendance (A->Z sort) ---')
s, r = api_call('/api/attendance/team', admin_tok)
names = [emp['name'] for emp in r['employees']]
print(f"Admin team attendance: status={s}, total={len(names)}")
print(f"Names order: {names}")

print('\n--- Test 6: Team Attendance 403 on Intern ---')
s, r = api_call('/api/attendance/team', intern_tok)
print(f"Intern team attendance attempt: status={s}, detail={r.get('detail')}")

print('\n--- Test 7: Saturday Toggle (Admin / Superadmin) ---')
s, r = api_call('/api/attendance/saturday-toggle', admin_tok, 'POST', {'is_working': True})
print(f"Saturday toggle to True: status={s}, message={r['message']}")
s, r = api_call('/api/attendance/saturday-toggle', admin_tok, 'POST', {'is_working': False})
print(f"Saturday toggle to False: status={s}, message={r['message']}")
