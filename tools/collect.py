# Serves the site's public/ and saves each POST to /__results as runs/<n>.json.
import http.server, json, os, sys, time
ROOT = sys.argv[1]; OUT = sys.argv[2]
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def __init__(self, *a, **k): super().__init__(*a, directory=ROOT, **k)
    def do_POST(self):
        if self.path == "/__log":
            print("log:", self.rfile.read(int(self.headers["Content-Length"])).decode(), flush=True)
            self.send_response(204); self.end_headers(); return
        body = self.rfile.read(int(self.headers["Content-Length"]))
        run = json.loads(body)
        path = os.path.join(OUT, f"{int(time.time())}.json")
        open(path, "w").write(json.dumps(run))
        print("saved", path, run.get("label"), flush=True)
        self.send_response(204); self.end_headers()
http.server.ThreadingHTTPServer(("127.0.0.1", 4345), H).serve_forever()
