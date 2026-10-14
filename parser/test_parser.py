import io
import unittest
import zipfile
from server import parse_document, validate_url

class ParserTests(unittest.TestCase):
    def test_pdf_text_extraction(self):
        from pypdf import PdfWriter
        from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject
        writer = PdfWriter()
        page = writer.add_blank_page(width=600, height=800)
        font = DictionaryObject({NameObject('/Type'): NameObject('/Font'), NameObject('/Subtype'): NameObject('/Type1'), NameObject('/BaseFont'): NameObject('/Helvetica')})
        page[NameObject('/Resources')] = DictionaryObject({NameObject('/Font'): DictionaryObject({NameObject('/F1'): writer._add_object(font)})})
        content = DecodedStreamObject()
        content.set_data(b'BT /F1 12 Tf 50 700 Td (Docker deployments) Tj ET')
        page[NameObject('/Contents')] = writer._add_object(content)
        stream = io.BytesIO()
        writer.write(stream)
        self.assertIn('Docker deployments', parse_document(stream.getvalue()))
    def test_storage_urls_require_exact_host_scheme_and_private_resume_path(self):
        host = "project.supabase.co"
        valid = "https://project.supabase.co/storage/v1/object/sign/resumes/user/file.pdf?token=fixture"
        self.assertEqual(validate_url(valid, host), valid)
        for url in ["http://project.supabase.co/storage/v1/object/sign/resumes/a", "https://evil.test/storage/v1/object/sign/resumes/a", "https://project.supabase.co@127.0.0.1/storage/v1/object/sign/resumes/a", "https://project.supabase.co/storage/v1/object/public/resumes/a", "https://project.supabase.co:8443/storage/v1/object/sign/resumes/a"]:
            with self.assertRaises(ValueError):
                validate_url(url, host)

    def test_docx_extracts_paragraphs_from_memory(self):
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, "w") as archive:
            archive.writestr("word/document.xml", '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Docker deployments</w:t></w:r></w:p></w:body></w:document>')
        self.assertEqual(parse_document(stream.getvalue()), "Docker deployments")

    def test_unknown_content_and_large_downloads_are_rejected(self):
        with self.assertRaises(ValueError):
            parse_document(b"not a document")
        with self.assertRaises(ValueError):
            parse_document(b"x" * 9_500_001)

    def test_xml_document_type_is_rejected(self):
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, "w") as archive:
            archive.writestr("word/document.xml", '<!DOCTYPE test><document/>')
        with self.assertRaises(ValueError):
            parse_document(stream.getvalue())

if __name__ == "__main__":
    unittest.main()
