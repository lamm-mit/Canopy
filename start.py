"""Start the fully local Canopy app using only Python's standard library."""
import functools
import http.server
import pathlib
import socketserver
import webbrowser
import threading
import os

class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript'}

root = pathlib.Path(__file__).resolve().parent / 'dist'
port = int(os.environ.get('CANOPY_PORT', '8080'))
handler = functools.partial(Handler, directory=str(root))
socketserver.TCPServer.allow_reuse_address = True
with http.server.ThreadingHTTPServer(('127.0.0.1', port), handler) as server:
    url = f'http://localhost:{port}'
    print(f'Canopy studio: {url}\nKeep this terminal open. Press Ctrl+C to stop.', flush=True)
    threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
