from __future__ import annotations

from unittest.mock import Mock

import snaptex_ml.model as model_module


def test_remote_checkpoint_uses_hugging_face_token(monkeypatch) -> None:
    monkeypatch.setenv("HF_TOKEN", "test-read-token")
    monkeypatch.setattr(model_module, "select_device", lambda: "cpu")

    processor_loader = Mock(return_value=object())
    loaded_model = Mock()
    model_loader = Mock(return_value=loaded_model)
    monkeypatch.setattr(
        model_module.TrOCRProcessor, "from_pretrained", processor_loader
    )
    monkeypatch.setattr(
        model_module.VisionEncoderDecoderModel, "from_pretrained", model_loader
    )

    recognizer = model_module.TrOCRFormulaRecognizer("owner/private-checkpoint")

    assert recognizer.model_id == "owner/private-checkpoint"
    processor_loader.assert_called_once_with(
        "owner/private-checkpoint", use_fast=False, token="test-read-token"
    )
    model_loader.assert_called_once_with(
        "owner/private-checkpoint", token="test-read-token"
    )
    loaded_model.to.assert_called_once_with("cpu")
    loaded_model.eval.assert_called_once_with()


def test_public_checkpoint_does_not_receive_empty_token(monkeypatch) -> None:
    monkeypatch.delenv("HF_TOKEN", raising=False)
    monkeypatch.setattr(model_module, "select_device", lambda: "cpu")

    processor_loader = Mock(return_value=object())
    loaded_model = Mock()
    model_loader = Mock(return_value=loaded_model)
    monkeypatch.setattr(
        model_module.TrOCRProcessor, "from_pretrained", processor_loader
    )
    monkeypatch.setattr(
        model_module.VisionEncoderDecoderModel, "from_pretrained", model_loader
    )

    model_module.TrOCRFormulaRecognizer("owner/public-checkpoint")

    processor_loader.assert_called_once_with("owner/public-checkpoint", use_fast=False)
    model_loader.assert_called_once_with("owner/public-checkpoint")


def test_phone_profile_uses_validation_decoding_and_rgb(monkeypatch) -> None:
    import torch
    from types import SimpleNamespace

    monkeypatch.setenv("SNAPTEX_INFERENCE_PROFILE", "phone-v05")
    monkeypatch.setattr(model_module, "select_device", lambda: "cpu")
    processor = Mock()
    processor.tokenizer = SimpleNamespace(bos_token_id=0, sep_token_id=2, pad_token_id=1)
    processor.image_processor.return_value = SimpleNamespace(pixel_values=torch.zeros(1, 3, 4, 4))
    processor.batch_decode.return_value = ["x^2"]
    loaded_model = Mock()
    monkeypatch.setattr(model_module.TrOCRProcessor, "from_pretrained", Mock(return_value=processor))
    monkeypatch.setattr(model_module.VisionEncoderDecoderModel, "from_pretrained", Mock(return_value=loaded_model))
    prepare = Mock(return_value=SimpleNamespace(image=object()))
    monkeypatch.setattr(model_module, "prepare_equation_image", prepare)
    recognizer = model_module.TrOCRFormulaRecognizer("owner/phone-model")
    crop = (0.1, 0.2, 0.5, 0.3)
    assert recognizer.recognize(b"image", crop) == "x^2"
    prepare.assert_called_once_with(b"image", crop, preserve_rgb=True)
    assert loaded_model.generate.call_args.kwargs == {
        "max_new_tokens": 256, "num_beams": 4, "decoder_start_token_id": 2,
        "bos_token_id": 0, "eos_token_id": 2, "pad_token_id": 1,
        "do_sample": False, "length_penalty": 1.0, "repetition_penalty": 1.0,
        "no_repeat_ngram_size": 0, "early_stopping": False, "use_cache": True,
    }


def test_invalid_inference_profile_fails_before_loading(monkeypatch) -> None:
    import pytest
    monkeypatch.setenv("SNAPTEX_INFERENCE_PROFILE", "typo")
    with pytest.raises(ValueError, match="SNAPTEX_INFERENCE_PROFILE"):
        model_module.TrOCRFormulaRecognizer("owner/phone-model")
