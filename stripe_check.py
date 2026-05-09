import json
import urllib.request
import urllib.error

BASE = 'http://127.0.0.1:8000/api'


def req(path: str, method: str = 'GET', body=None, token: str | None = None):
    data = json.dumps(body).encode() if body is not None else None
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f'Bearer {token}'
    request = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            payload = response.read().decode()
            return response.status, json.loads(payload) if payload else {}
    except urllib.error.HTTPError as error:
        payload = error.read().decode() if error.fp else ''
        try:
            body_json = json.loads(payload) if payload else {'raw': ''}
        except Exception:
            body_json = {'raw': payload}
        return error.code, body_json


if __name__ == '__main__':
    health_status, _ = req('/health/')
    print(f'HEALTH_HTTP={health_status}')

    login_status, login_data = req('/auth/token/', 'POST', {
        'email': 'investor@demo.local',
        'password': 'DemoPass123!'
    })
    print(f'LOGIN_HTTP={login_status}')
    token = login_data.get('access')
    if not token:
        print('LOGIN_FAILED_NO_TOKEN')
        print(login_data)
        raise SystemExit(1)

    proposals_status, proposals_data = req('/proposals/', token=token)
    print(f'PROPOSALS_HTTP={proposals_status}')
    proposals = proposals_data.get('results') or proposals_data.get('data') or proposals_data
    approved = next((proposal for proposal in proposals if proposal.get('status') == 'approved'), None)
    print(f'APPROVED_PROPOSAL_ID={approved.get("id") if approved else None}')
    if not approved:
        raise SystemExit(0)

    create_status, create_data = req('/payments/create-intent/', 'POST', {
        'proposal': int(approved['id']),
        'amount': 1000,
    }, token=token)
    print(f'CREATE_INTENT_HTTP={create_status}')
    print(f'CREATE_INTENT_BODY={json.dumps(create_data)[:400]}')
    intent_id = create_data.get('intent_id')
    if not intent_id:
        raise SystemExit(0)

    status_status, status_data = req(f'/payments/status/{intent_id}/', token=token)
    print(f'STATUS_HTTP={status_status}')
    print(f'STATUS_BODY={json.dumps(status_data)[:400]}')
