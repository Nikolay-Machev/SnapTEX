from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from xml.etree import ElementTree

INKML_NAMESPACE = "{http://www.w3.org/2003/InkML}"


@dataclass(frozen=True)
class Ink:
    strokes: list[list[tuple[float, float]]]
    annotations: dict[str, str]


def read_inkml(path: Path) -> Ink:
    root = ElementTree.fromstring(path.read_text(encoding="utf-8"))
    strokes: list[list[tuple[float, float]]] = []
    annotations: dict[str, str] = {}

    for element in root:
        tag = element.tag.removeprefix(INKML_NAMESPACE)
        if tag == "annotation" and element.text:
            annotation_type = element.attrib.get("type")
            if annotation_type:
                annotations[annotation_type] = element.text.strip()
        elif tag == "trace" and element.text:
            stroke = []
            for raw_point in element.text.split(","):
                values = raw_point.strip().split()
                if len(values) < 2:
                    raise ValueError(f"Malformed point in {path}: {raw_point!r}")
                stroke.append((float(values[0]), float(values[1])))
            if stroke:
                strokes.append(stroke)

    if not strokes:
        raise ValueError(f"No strokes found in {path}")
    return Ink(strokes=strokes, annotations=annotations)


def verified_label(ink: Ink, expected_split: str) -> str:
    required = {
        "normalizedLabel",
        "sampleId",
        "splitTagOriginal",
        "inkCreationMethod",
    }
    missing = sorted(required - ink.annotations.keys())
    if missing:
        raise ValueError(f"Missing required annotations: {', '.join(missing)}")
    if ink.annotations["splitTagOriginal"] != expected_split:
        raise ValueError("InkML split does not match its directory")
    if ink.annotations["inkCreationMethod"] != "human":
        raise ValueError("Only human-written samples are accepted")
    label = ink.annotations["normalizedLabel"].strip()
    if not label or len(label) > 512:
        raise ValueError("Normalized label is empty or unreasonably long")
    return label
