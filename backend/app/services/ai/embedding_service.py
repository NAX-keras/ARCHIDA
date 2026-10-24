from app.core.config import settings


_TOKENIZER = None
_MODEL = None


def _get_model_name() -> str:
    return getattr(
        settings,
        "AI_MODEL_NAME",
        "cahya/distilbert-base-indonesian",
    )


def _get_embedding_dim() -> int:
    return int(getattr(settings, "AI_EMBEDDING_DIM", 768))


def _load_model():
    """
    Lazy loading model Hugging Face.

    Model tidak diload saat backend start.
    Model hanya diload saat generate_text_embedding() dipanggil.
    """

    global _TOKENIZER, _MODEL

    if _TOKENIZER is not None and _MODEL is not None:
        return _TOKENIZER, _MODEL

    from transformers import AutoTokenizer, AutoModel

    model_name = _get_model_name()

    print(f"Loading AI embedding model: {model_name}")

    _TOKENIZER = AutoTokenizer.from_pretrained(model_name)
    _MODEL = AutoModel.from_pretrained(model_name)
    _MODEL.eval()

    return _TOKENIZER, _MODEL


def _mean_pooling(last_hidden_state, attention_mask):
    """
    Mean pooling dari token embedding dengan attention mask.
    """

    import torch

    input_mask_expanded = (
        attention_mask
        .unsqueeze(-1)
        .expand(last_hidden_state.size())
        .float()
    )

    sum_embeddings = torch.sum(last_hidden_state * input_mask_expanded, dim=1)
    sum_mask = torch.clamp(input_mask_expanded.sum(dim=1), min=1e-9)

    return sum_embeddings / sum_mask


def generate_text_embedding(text: str) -> list[float]:
    """
    Generate embedding teks menggunakan pre-trained DistilBERT Hugging Face.

    Ketentuan:
    - Tidak training.
    - Tidak fine-tuning.
    - max_length=512.
    - Mean pooling.
    - Output list float.
    - Validasi dimensi 768.
    """

    if text is None or not str(text).strip():
        raise ValueError("Teks untuk embedding tidak boleh kosong.")

    import torch

    tokenizer, model = _load_model()

    encoded_input = tokenizer(
        str(text),
        padding=True,
        truncation=True,
        max_length=512,
        return_tensors="pt",
    )

    with torch.no_grad():
        output = model(**encoded_input)

    sentence_embedding = _mean_pooling(
        last_hidden_state=output.last_hidden_state,
        attention_mask=encoded_input["attention_mask"],
    )

    embedding = sentence_embedding[0].detach().cpu().tolist()

    expected_dim = _get_embedding_dim()

    if len(embedding) != expected_dim:
        raise ValueError(
            f"Dimensi embedding tidak sesuai. Expected {expected_dim}, got {len(embedding)}."
        )

    return [float(value) for value in embedding]


def get_embedding_model_info() -> dict:
    """
    Informasi model aktif untuk testing dan dokumentasi.
    """

    return {
        "model_type": getattr(settings, "AI_MODEL_TYPE", "huggingface"),
        "model_name": _get_model_name(),
        "embedding_dim": _get_embedding_dim(),
        "pooling": "mean_pooling",
        "max_length": 512,
        "fine_tuning": False,
    }