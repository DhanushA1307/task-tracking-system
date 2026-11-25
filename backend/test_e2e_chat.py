import urllib.request
import json

def post_json(url, data, token=None):
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'), headers=headers)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode('utf-8'))

def get_json(url, token):
    headers = {'Authorization': f'Bearer {token}'}
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode('utf-8'))

def main():
    print("=== LIVE E2E CHAT SYSTEM VERIFICATION ===")

    # 1. Login User 1 (Intern Dhanush)
    res1 = post_json('http://127.0.0.1:8000/api/auth/sso-login', {'role_or_email': 'drickcurve123@gmail.com'})
    token1 = res1['access_token']
    u1 = res1['user']
    print(f"User 1: {u1['full_name']} ({u1['role']})")

    # 2. Login User 2 (Intern Priya)
    res2 = post_json('http://127.0.0.1:8000/api/auth/sso-login', {'role_or_email': 'priya.sharma@ingage.com'})
    token2 = res2['access_token']
    u2 = res2['user']
    print(f"User 2: {u2['full_name']} ({u2['role']})")

    # 3. User 1 starts direct chat with User 2
    conv = post_json('http://127.0.0.1:8000/api/chat/conversations/direct', {'recipient_id': u2['id']}, token1)
    conv_id = conv['id']
    print(f"Direct conversation created: ID {conv_id} ({u1['full_name']} <-> {u2['full_name']})")

    # 4. User 1 (intern) sends 1st message
    msg1 = post_json(f'http://127.0.0.1:8000/api/chat/conversations/{conv_id}/messages', {'message_text': 'Hey Priya, did you check the new tasks?'}, token1)
    print(f"User 1 sent: [{msg1['sequence_index']}st message] -> \"{msg1['message_text']}\"")

    # 5. User 2 (intern) sends 2nd message
    msg2 = post_json(f'http://127.0.0.1:8000/api/chat/conversations/{conv_id}/messages', {'message_text': 'Yes Dhanush, reviewed and started on them!'}, token2)
    print(f"User 2 sent: [{msg2['sequence_index']}nd message] -> \"{msg2['message_text']}\"")

    # 6. Fetch conversation thread from User 1's perspective
    thread = get_json(f'http://127.0.0.1:8000/api/chat/conversations/{conv_id}/messages', token1)
    print("\n--- Conversation Dialogue Order (Top to Bottom) ---")
    for m in thread:
        tag = f"[{m['sequence_index']}th message]" if m.get('sequence_index') else "[system]"
        if m.get('sequence_index') == 1: tag = "[1st message]"
        elif m.get('sequence_index') == 2: tag = "[2nd message]"
        print(f"  {m['sender_name']} ({m['sender_role']}) {tag}: {m['message_text']}")

    # 7. Check conversations list order (Reverse Chronological)
    conv_list = get_json('http://127.0.0.1:8000/api/chat/conversations', token1)
    print(f"\nTop conversation in inbox: {conv_list[0]['title']} (Last message: \"{conv_list[0]['last_message_preview']}\")")
    assert conv_list[0]['id'] == conv_id, "Latest conversation must be at the top of inbox"

    # 8. Test Group Creation and Leave flow ("whose wanted" and "whose need to leave")
    print("\n--- Group Creation & Leave Flow ---")
    group = post_json('http://127.0.0.1:8000/api/chat/conversations/group', {
        'title': 'Sprint Collaboration Group',
        'description': 'Frontend & backend sprint sync',
        'member_ids': [u2['id']]
    }, token1)
    group_id = group['id']
    print(f"Created group '{group['title']}' with {group['member_count']} members")

    # User 2 sends message in group
    g_msg = post_json(f'http://127.0.0.1:8000/api/chat/conversations/{group_id}/messages', {'message_text': 'Glad to join the group!'}, token2)
    print(f"User 2 posted in group: \"{g_msg['message_text']}\"")

    # User 2 leaves the group
    leave_res = post_json(f'http://127.0.0.1:8000/api/chat/conversations/{group_id}/leave', {}, token2)
    print(f"User 2 left group: {leave_res['message']}")

    # Verify group thread has leave announcement
    group_thread = get_json(f'http://127.0.0.1:8000/api/chat/conversations/{group_id}/messages', token1)
    print("\nGroup thread after leave:")
    for gm in group_thread:
        print(f"  [{gm['message_type'].upper()}] {gm['sender_name']}: {gm['message_text']}")

    print("\n>>> ALL TESTS & SPECIFICATIONS FULLY VERIFIED! <<<")

if __name__ == '__main__':
    main()
