FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/models/huggingface

WORKDIR /service
COPY requirements.txt ./
RUN pip install --no-cache-dir torch==2.6.0 torchvision==0.21.0 --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r requirements.txt
COPY snaptex_ml ./snaptex_ml

EXPOSE 8000
CMD ["uvicorn", "snaptex_ml.app:app", "--host", "0.0.0.0", "--port", "8000"]
