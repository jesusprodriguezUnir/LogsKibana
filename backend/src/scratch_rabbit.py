import urllib.request
import json
import urllib.error

# Test /queues
try:
    req_q = urllib.request.Request('http://127.0.0.1:8000/api/queues')
    res_q = urllib.request.urlopen(req_q).read().decode('utf-8')
    print("Queues:", json.loads(res_q)['queues'][0:3])
except Exception as e:
    print("Error Queues:", e)

# Test /publish
payload = {
    'rabbit_name': 'MatriculaRealizada',
    'payload': {'key': 'value'}
}
req = urllib.request.Request(
    'http://127.0.0.1:8000/api/publish', 
    data=json.dumps(payload).encode('utf-8'), 
    headers={'Content-Type': 'application/json'}
)
try:
    res = urllib.request.urlopen(req).read().decode('utf-8')
    print('Publish:', res)
except urllib.error.HTTPError as e:
    print('HTTP Error:', e.read().decode('utf-8'))
except Exception as e:
    print('Error:', e)
