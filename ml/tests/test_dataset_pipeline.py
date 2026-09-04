from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from prepare_mathwriting import prepare_split, write_jsonl
from snaptex_ml.inkml import read_inkml, verified_label


class DatasetPipelineTest(unittest.TestCase):
    def test_prepares_ten_verified_records(self) -> None:
        source = Path(__file__).parent / "fixtures/mathwriting"
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory)
            train = prepare_split(source, output, "train", 8, 7)
            validation = prepare_split(source, output, "valid", 2, 8)
            write_jsonl(output / "train.jsonl", train)
            write_jsonl(output / "validation.jsonl", validation)

            self.assertEqual(len(train) + len(validation), 10)
            self.assertEqual(
                len(list((output / "images").glob("**/*.png"))), 10
            )
            for manifest in ("train.jsonl", "validation.jsonl"):
                for line in (output / manifest).read_text().splitlines():
                    record = json.loads(line)
                    image = output / record["image"]
                    self.assertEqual(image.read_bytes()[:8], b"\x89PNG\r\n\x1a\n")

    def test_rejects_unverified_nonhuman_records(self) -> None:
        path = Path(__file__).parent / "fixtures/mathwriting/train/0000000000000001.inkml"
        ink = read_inkml(path)
        ink.annotations["inkCreationMethod"] = "boundingBoxes"
        with self.assertRaisesRegex(ValueError, "human-written"):
            verified_label(ink, "train")


if __name__ == "__main__":
    unittest.main()
