import json
import os
import threading
import unittest
import urllib.error
import urllib.request
from unittest.mock import patch
from server import BoundedHTTPServer, Handler, PARSER_SLOTS

class ParserHttpTests(unittest.TestCase):
    def test_authentication_size_and_capacity_limits(self):
        with patch.dict(os.environ, {"PARSER_API_KEY": "local-parser-fixture", "RESUME_DOWNLOAD_HOST": "project.supabase.co"}):
            service = BoundedHTTPServer(("127.0.0.1", 0), Handler)
            thread = threading.Thread(target=service.serve_forever, daemon=True)
            thread.start()
            url = "http://127.0.0.1:" + str(service.server_address[1]) + "/extract"
            def status(data, key=None):
                headers = {"Content-Type": "application/json"}
                if key: headers["X-Parser-Key"] = key
                request = urllib.request.Request(url, data=data, headers=headers)
                with self.assertRaises(urllib.error.HTTPError) as error:
                    urllib.request.urlopen(request, timeout=3)
                return error.exception.code
            try:
                self.assertEqual(status(b"{}"), 401)
                self.assertEqual(status(b"x" * 4097, "local-parser-fixture"), 400)
                PARSER_SLOTS.acquire()
                PARSER_SLOTS.acquire()
                try:
                    self.assertEqual(status(b"{}", "local-parser-fixture"), 503)
                finally:
                    PARSER_SLOTS.release()
                    PARSER_SLOTS.release()
                self.assertEqual(status(json.dumps({"downloadUrl": "http://127.0.0.1/private"}).encode(), "local-parser-fixture"), 400)
            finally:
                service.shutdown()
                service.server_close()
                thread.join(timeout=3)

if __name__ == "__main__":
    unittest.main()
