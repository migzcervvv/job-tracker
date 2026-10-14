"""Private resume parser: authenticated, bounded downloads from one configured storage host."""
import hmac
import io
import json
import multiprocessing
import os
import subprocess
import tempfile
import threading
import urllib.error
import urllib.parse
import urllib.request
import zipfile
import xml.etree.ElementTree as ET
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MAX_BYTES = 9_500_000
MAX_TEXT = 200_000
PARSER_SLOTS = threading.BoundedSemaphore(2)

class BoundedHTTPServer(ThreadingHTTPServer):
    def __init__(self, *args, **kwargs):
        self.request_slots = threading.BoundedSemaphore(8)
        super().__init__(*args, **kwargs)
    def process_request(self, request, client_address):
        if not self.request_slots.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self.request_slots.release()
            raise
    def process_request_thread(self, request, client_address):
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.request_slots.release()

def validate_url(value, allowed_host):
    url = urllib.parse.urlsplit(value)
    if not allowed_host or url.scheme != "https" or url.hostname != allowed_host or url.username or url.password or url.port not in (None, 443):
        raise ValueError("Invalid storage URL")
    if not url.path.startswith("/storage/v1/object/sign/resumes/"):
        raise ValueError("Invalid storage bucket")
    return value

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, newurl):
        raise ValueError("Storage redirects are disabled")

def download(url):
    opener = urllib.request.build_opener(NoRedirect())
    with opener.open(url, timeout=20) as response:
        data = response.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise ValueError("File is too large")
    return data

def parse_document(data):
    if len(data) > MAX_BYTES:
        raise ValueError("File is too large")
    if data.startswith(b"%PDF-"):
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(data), strict=True)
        if len(reader.pages) > 200:
            raise ValueError("Too many pages")
        text = "\n".join((page.extract_text() or "") for page in reader.pages)
    elif data.startswith(b"PK"):
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            if len(archive.infolist()) > 5000 or sum(item.file_size for item in archive.infolist()) > 50_000_000:
                raise ValueError("Archive expands beyond the limit")
            xml = archive.read("word/document.xml")
            if b"<!DOCTYPE" in xml:
                raise ValueError("Document types are disabled")
            root = ET.fromstring(xml)
            text = "\n".join("".join(paragraph.itertext()) for paragraph in root.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}p"))
    elif data.startswith(bytes.fromhex("d0cf11e0a1b11ae1")):
        with tempfile.NamedTemporaryFile(suffix=".doc") as file:
            file.write(data)
            file.flush()
            text = subprocess.run(["antiword", file.name], check=True, capture_output=True, timeout=20).stdout.decode("utf-8", errors="replace")
    else:
        raise ValueError("Unsupported document")
    text = text.strip()
    if not text or len(text) > MAX_TEXT:
        raise ValueError("Extracted text is empty or too large")
    return text

def parse_worker(data, connection):
    try:
        if os.name == "posix":
            import resource
            resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024, 512 * 1024 * 1024))
        connection.send({"text": parse_document(data)})
    except Exception:
        connection.send({"error": "Document parsing failed"})
    finally:
        connection.close()

def bounded_parse(data):
    parent, child = multiprocessing.Pipe(duplex=False)
    process = multiprocessing.Process(target=parse_worker, args=(data, child))
    process.start()
    child.close()
    try:
        if not parent.poll(25):
            raise ValueError("Document parsing timed out")
        result = parent.recv()
        if "error" in result:
            raise ValueError(result["error"])
        return result
    finally:
        process.terminate()
        process.join()
        parent.close()

class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(30)
    def log_message(self, format, *args):
        pass  # URLs contain signed tokens. Log only aggregate service health externally.
    def reply(self, status, body):
        encoded = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)
    def do_GET(self):
        self.reply(200 if self.path == "/health" else 404, {"status": "healthy"})
    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", "0"))
            # Drain small invalid requests before closing so clients receive the error.
            payload = self.rfile.read(min(max(length, 0), 4097))
        except Exception:
            self.reply(400, {"error": "Invalid request size"})
            return
        key = os.environ.get("PARSER_API_KEY", "")
        supplied = self.headers.get("X-Parser-Key", "")
        if not key or not hmac.compare_digest(key.encode(), supplied.encode()):
            self.reply(401, {"error": "Unauthorized"})
            return
        if self.path != "/extract":
            self.reply(404, {})
            return
        if not PARSER_SLOTS.acquire(blocking=False):
            self.reply(503, {"error": "Parser capacity reached"})
            return
        try:
            if length < 1 or length > 4096:
                raise ValueError("Invalid request size")
            body = json.loads(payload)
            url = validate_url(body["downloadUrl"], os.environ.get("RESUME_DOWNLOAD_HOST"))
            self.reply(200, bounded_parse(download(url)))
        except Exception:
            self.reply(400, {"error": "Invalid or unreadable resume"})
        finally:
            PARSER_SLOTS.release()

if __name__ == "__main__":
    if not os.environ.get("PARSER_API_KEY") or not os.environ.get("RESUME_DOWNLOAD_HOST"):
        raise SystemExit("Set PARSER_API_KEY and RESUME_DOWNLOAD_HOST")
    BoundedHTTPServer(("0.0.0.0", int(os.environ.get("PORT", "8000"))), Handler).serve_forever()
