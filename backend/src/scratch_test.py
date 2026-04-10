import urllib.request
import urllib.parse
import json
import uuid

# 1. Upload CSV
with open('../../test_logs_sample.csv', 'rb') as f:
    csv_data = f.read()

boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW'
body = (
    f'--{boundary}\r\n'
    f'Content-Disposition: form-data; name="file"; filename="test_logs_sample.csv"\r\n'
    f'Content-Type: text/csv\r\n\r\n'
).encode('utf-8') + csv_data + f'\r\n--{boundary}--\r\n'.encode('utf-8')

req = urllib.request.Request('http://127.0.0.1:8000/api/upload', data=body, headers={'Content-Type': f'multipart/form-data; boundary={boundary}'})

try:
    res = urllib.request.urlopen(req).read().decode('utf-8')
    data = json.loads(res)
    print("Upload response:", data)
    session_id = data.get('session_id')
    
    if session_id:
        # 2. Search
        req2 = urllib.request.Request(f'http://127.0.0.1:8000/api/search?session_id={session_id}&page=1&page_size=500')
        res2 = urllib.request.urlopen(req2).read().decode('utf-8')
        items = json.loads(res2).get('items', [])
        print("Search items returned:", len(items))
        if items:
            print("First item message:", items[0]['message'])
except urllib.error.URLError as e:
    print("URL Error:", e)
except Exception as e:
    print("Exception:", e)
