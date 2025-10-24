import json

def test_parse_html_extracts_meta(tmp_path):
    sample_html = tmp_path / "sample.html"
    sample_html.write_text(
        """
        <html lang="en">
          <head>
            <title>Credit Report</title>
            <meta name="description" content="Sample credit report" />
            <meta name="author" content="Metro2 Parser" />
          </head>
          <body>
            <h1>Summary</h1>
            <h2>Accounts</h2>
            <a href="https://example.com" rel="nofollow">Example</a>
          </body>
        </html>
        """,
        encoding="utf-8",
    )

    from scripts.html_ingest.ingest import parse_html

    parsed = parse_html(sample_html)

    assert parsed.title == "Credit Report"
    assert parsed.meta_description == "Sample credit report"
    assert parsed.language == "en"
    assert parsed.meta["author"] == "Metro2 Parser"
    assert len(parsed.headings) == 2
    assert parsed.headings[0].level == "h1"
    assert parsed.headings[0].text == "Summary"
    assert parsed.links[0].href == "https://example.com"
    assert parsed.links[0].rel == "nofollow"

    normalized = json.loads(json.dumps(parsed.meta))
    assert normalized == {"description": "Sample credit report", "author": "Metro2 Parser"}
