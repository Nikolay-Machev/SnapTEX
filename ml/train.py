from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import torch
from PIL import Image
from torch.utils.data import Dataset
from transformers import (
    Seq2SeqTrainer,
    Seq2SeqTrainingArguments,
    TrOCRProcessor,
    VisionEncoderDecoderModel,
)

DEFAULT_MODEL_ID = "tjoab/latex_finetuned"


class FormulaDataset(Dataset[dict[str, torch.Tensor]]):
    def __init__(self, manifest: Path, processor: TrOCRProcessor) -> None:
        self.root = manifest.parent
        self.processor = processor
        self.samples = [
            json.loads(line)
            for line in manifest.read_text().splitlines()
            if line.strip()
        ]

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, index: int) -> dict[str, torch.Tensor]:
        sample = self.samples[index]
        with Image.open(self.root / sample["image"]) as source:
            image = source.convert("RGB")
        pixel_values = self.processor.image_processor(
            images=image, return_tensors="pt"
        ).pixel_values.squeeze(0)
        labels = self.processor.tokenizer(
            sample["latex"], max_length=256, padding="max_length", truncation=True
        ).input_ids
        labels = [
            token if token != self.processor.tokenizer.pad_token_id else -100
            for token in labels
        ]
        return {"pixel_values": pixel_values, "labels": torch.tensor(labels)}


@dataclass
class FormulaCollator:
    def __call__(self, features: list[dict[str, torch.Tensor]]) -> dict[str, Any]:
        return {
            "pixel_values": torch.stack([item["pixel_values"] for item in features]),
            "labels": torch.stack([item["labels"] for item in features]),
        }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fine-tune the SnapTEX TrOCR model")
    parser.add_argument("--train", type=Path, required=True)
    parser.add_argument("--validation", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("checkpoints/snaptex-trocr"))
    parser.add_argument("--model", default=DEFAULT_MODEL_ID)
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=4)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    processor = TrOCRProcessor.from_pretrained(args.model)
    model = VisionEncoderDecoderModel.from_pretrained(args.model)
    model.config.decoder_start_token_id = processor.tokenizer.cls_token_id
    model.config.pad_token_id = processor.tokenizer.pad_token_id
    model.config.eos_token_id = processor.tokenizer.sep_token_id

    training_args = Seq2SeqTrainingArguments(
        output_dir=str(args.output),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        learning_rate=5e-5,
        eval_strategy="epoch",
        save_strategy="epoch",
        logging_steps=25,
        predict_with_generate=True,
        generation_max_length=256,
        load_best_model_at_end=True,
        report_to="none",
        fp16=torch.cuda.is_available(),
    )
    trainer = Seq2SeqTrainer(
        model=model,
        args=training_args,
        train_dataset=FormulaDataset(args.train, processor),
        eval_dataset=FormulaDataset(args.validation, processor),
        data_collator=FormulaCollator(),
        processing_class=processor,
    )
    trainer.train()
    trainer.save_model(args.output)
    processor.save_pretrained(args.output)


if __name__ == "__main__":
    main()
