import importlib.util
import io
import tempfile
import unittest
import urllib.parse
from pathlib import Path

from pypdf import PdfWriter

MODULE = Path(__file__).resolve().parents[2] / "scripts" / "download-tesda-tr.py"
spec = importlib.util.spec_from_file_location("download_tesda_tr", MODULE)
downloader = importlib.util.module_from_spec(spec)
spec.loader.exec_module(downloader)


class Response(io.BytesIO):
    def __init__(self, content):
        super().__init__(content)

    def geturl(self):
        return downloader.FORM


class Opener:
    def __init__(self, content):
        self.content = content
        self.calls = 0

    def open(self, request, timeout):
        self.calls += 1
        values = urllib.parse.parse_qs(request.data.decode())
        assert values["Purpose"] == ["Dev"]
        assert values["CountryId"] == ["139"]
        assert values["D_id"] == ["123"]
        return Response(self.content)


class DownloadTests(unittest.TestCase):
    def test_pdf_is_saved_and_resumed_without_second_post(self):
        writer = PdfWriter()
        for _ in range(20):
            writer.add_blank_page(width=72, height=72)
        stream = io.BytesIO()
        writer.write(stream)
        opener = Opener(stream.getvalue())
        item = {"download_id": "123", "title": "Test regulation",
                "status": "listed_current_unverified"}
        with tempfile.TemporaryDirectory() as dirname:
            folder = Path(dirname)
            first = downloader.download(opener, "token", "139", "dev@example.test", item, folder)
            second = downloader.download(opener, "token", "139", "dev@example.test", item, folder)
            self.assertEqual(first, second)
            self.assertEqual(opener.calls, 1)
            self.assertEqual(first["bytes"], len(stream.getvalue()))

    def test_html_response_is_rejected(self):
        opener = Opener(b"<html>not a pdf</html>" * 100)
        item = {"download_id": "123", "title": "Test regulation",
                "status": "listed_current_unverified"}
        with tempfile.TemporaryDirectory() as dirname:
            with self.assertRaisesRegex(RuntimeError, "not a PDF"):
                downloader.download(opener, "token", "139", "dev@example.test", item, Path(dirname))
            self.assertEqual(list(Path(dirname).iterdir()), [])


if __name__ == "__main__":
    unittest.main()
