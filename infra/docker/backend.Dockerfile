# Imagen de runtime del backend endurecida:
#  - solo dependencias de runtime (sin extras [dev], sin tests en la imagen)
#  - usuario no-root
#  - HEALTHCHECK contra /health usando solo la stdlib (sin curl)
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Usuario sin privilegios.
RUN adduser --disabled-password --gecos "" appuser

# Instalamos dependencias de runtime. README.md es necesario porque pyproject
# lo referencia como `readme`.
COPY backend/pyproject.toml backend/README.md /app/
COPY backend/src /app/src
RUN pip install -e . \
    && chown -R appuser:appuser /app

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import sys,urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health').status==200 else 1)"

CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000", "--app-dir", "src"]
