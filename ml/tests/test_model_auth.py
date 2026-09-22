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
        "owner/private-checkpoint", token="test-read-token"
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

    processor_loader.assert_called_once_with("owner/public-checkpoint")
    model_loader.assert_called_once_with("owner/public-checkpoint")
