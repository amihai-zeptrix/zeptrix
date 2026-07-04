import csv
import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "cloudprune_growth_shortlist.py"
SPEC = importlib.util.spec_from_file_location("cloudprune_growth_shortlist", SCRIPT_PATH)
growth = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = growth
SPEC.loader.exec_module(growth)


class CloudPruneGrowthShortlistTest(unittest.TestCase):
    def test_ranked_opportunities_include_register_url_and_scores(self):
        opportunities = growth.ranked_opportunities()

        self.assertGreaterEqual(len(opportunities), 8)
        self.assertGreaterEqual(opportunities[0].priority_score, opportunities[-1].priority_score)
        self.assertTrue(all(growth.REGISTER_URL in item.primary_cta for item in opportunities))

    def test_markdown_contains_source_links_and_outline(self):
        markdown = growth.markdown_brief(growth.ranked_opportunities()[:1])

        self.assertIn("CloudPrune Pain-Search Growth Shortlist", markdown)
        self.assertIn("Suggested outline", markdown)
        self.assertIn(growth.REGISTER_URL, markdown)

    def test_csv_writer_includes_priority_score(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "shortlist.csv"
            growth.write_csv(path, growth.ranked_opportunities()[:2])

            with path.open(encoding="utf-8") as handle:
                rows = list(csv.DictReader(handle))

        self.assertEqual(len(rows), 2)
        self.assertIn("priority_score", rows[0])
        self.assertTrue(rows[0]["source_url"].startswith("https://"))


if __name__ == "__main__":
    unittest.main()
