# IsraMarket API
#
# SQLite + on-disk card images mean this service is STATEFUL: it needs a persistent
# volume at /app/data and must run as a single instance. See DEPLOY.md.
FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# lxml needs libxml2/libxslt at build time; the wheels cover runtime for most
# platforms but installing build deps keeps this working on the ones that lack them.
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libxml2-dev libxslt1-dev curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

# Data lives on a volume; create it owned by the runtime user so a fresh volume works.
RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /app/data \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/health || exit 1

# No --reload in production. Binds to all interfaces because the container is the
# network boundary; do NOT publish this port publicly — put it behind the web tier.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
