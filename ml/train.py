from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import torch
from PIL import Image
from torch.utils.data import Dataset
from torch.nn.utils.rnn import pad_sequence
from transformers import (
    EarlyStoppingCallback,
    EvalPrediction,
    Seq2SeqTrainer,
    Seq2SeqTrainingArguments,
    TrOCRProcessor,
    VisionEncoderDecoderModel,
)

from snaptex_ml.augmentation import phone_photo_augmentation
from snaptex_ml.benchmark import character_error_rate
from snaptex_ml.data_validation import assert_disjoint, assert_not_in_holdout, read_manifest

DEFAULT_MODEL_ID = "tjoab/latex_finetuned"


class FormulaDataset(Dataset[dict[str, torch.Tensor]]):
    def __init__(
        self, manifest: Path, processor: TrOCRProcessor, *, augment: bool = False
    ) -> None:
        self.root = manifest.parent
        self.processor = processor
        self.augment = augment
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
        if self.augment:
            image = phone_photo_augmentation(image)
        pixel_values = self.processor.image_processor(
            images=image, return_tensors="pt"
        ).pixel_values.squeeze(0)
        labels = self.processor.tokenizer(
            sample["latex"], max_length=256, truncation=True
        ).input_ids
        return {"pixel_values": pixel_values, "labels": torch.tensor(labels)}


@dataclass
class FormulaCollator:
    def __call__(self, features: list[dict[str, torch.Tensor]]) -> dict[str, Any]:
        return {
            "pixel_values": torch.stack([item["pixel_values"] for item in features]),
            # Pad only to the longest target in this batch. Padding every short
            # equation to 256 tokens wastes most decoder compute on CPU.
            "labels": pad_sequence(
                [item["labels"] for item in features],
                batch_first=True,
                padding_value=-100,
            ),
        }


def build_metrics(processor: TrOCRProcessor):
    def compute_metrics(prediction: EvalPrediction) -> dict[str, float]:
        predictions = prediction.predictions
        if isinstance(predictions, tuple):
            predictions = predictions[0]
        labels = prediction.label_ids.copy()
        labels[labels == -100] = processor.tokenizer.pad_token_id
        predicted_latex = processor.batch_decode(predictions, skip_special_tokens=True)
        expected_latex = processor.batch_decode(labels, skip_special_tokens=True)
        rates = [
            character_error_rate(expected, predicted)
            for expected, predicted in zip(expected_latex, predicted_latex)
        ]
        return {
            "cer": sum(rates) / max(len(rates), 1),
            "exact_match": sum(rate == 0 for rate in rates) / max(len(rates), 1),
        }

    return compute_metrics


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Fine-tune the SnapTEX TrOCR model")
    parser.add_argument("--train", type=Path, required=True)
    parser.add_argument("--validation", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=Path("checkpoints/snaptex-trocr"))
    parser.add_argument("--model", default=DEFAULT_MODEL_ID)
    parser.add_argument("--epochs", type=int, default=3)
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--gradient-accumulation", type=int, default=4)
    parser.add_argument("--learning-rate", type=float, default=1e-5)
    parser.add_argument("--warmup-ratio", type=float, default=0.05)
    parser.add_argument("--weight-decay", type=float, default=0.01)
    parser.add_argument("--max-gradient-norm", type=float, default=1.0)
    parser.add_argument("--num-beams", type=int, default=4)
    parser.add_argument(
        "--freeze-encoder",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Freeze the vision encoder for conservative domain adaptation.",
    )
    parser.add_argument("--seed", type=int, default=20260904)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    train_records = read_manifest(args.train.resolve())
    validation_records = read_manifest(args.validation.resolve())
    assert_disjoint({"train": train_records, "validation": validation_records})
    protected = Path(__file__).resolve().parent.parent / "tests/fixtures/equations"
    assert_not_in_holdout([*train_records, *validation_records], protected)
    processor = TrOCRProcessor.from_pretrained(args.model)
    model = VisionEncoderDecoderModel.from_pretrained(args.model)
    model.config.decoder_start_token_id = processor.tokenizer.cls_token_id
    model.config.pad_token_id = processor.tokenizer.pad_token_id
    model.config.eos_token_id = processor.tokenizer.sep_token_id
    if args.freeze_encoder:
        for parameter in model.encoder.parameters():
            parameter.requires_grad = False

    training_args = Seq2SeqTrainingArguments(
        output_dir=str(args.output),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        gradient_accumulation_steps=args.gradient_accumulation,
        learning_rate=args.learning_rate,
        warmup_ratio=args.warmup_ratio,
        weight_decay=args.weight_decay,
        max_grad_norm=args.max_gradient_norm,
        eval_strategy="epoch",
        save_strategy="epoch",
        save_total_limit=1,
        logging_steps=25,
        predict_with_generate=True,
        generation_max_length=256,
        generation_num_beams=args.num_beams,
        load_best_model_at_end=True,
        metric_for_best_model="cer",
        greater_is_better=False,
        report_to="none",
        fp16=torch.cuda.is_available(),
        seed=args.seed,
        data_seed=args.seed,
        dataloader_num_workers=0,
        dataloader_pin_memory=torch.cuda.is_available(),
    )
    trainer = Seq2SeqTrainer(
        model=model,
        args=training_args,
        train_dataset=FormulaDataset(args.train, processor, augment=True),
        eval_dataset=FormulaDataset(args.validation, processor),
        data_collator=FormulaCollator(),
        processing_class=processor,
        compute_metrics=build_metrics(processor),
        callbacks=[EarlyStoppingCallback(early_stopping_patience=1)],
    )
    trainer.train()
    trainer.save_model(args.output)
    processor.save_pretrained(args.output)


if __name__ == "__main__":
    main()
