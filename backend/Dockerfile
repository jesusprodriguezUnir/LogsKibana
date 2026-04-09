FROM python:3.11-slim

WORKDIR /app

# Instalar dependencias del sistema mínimas requeridas por Pandas o compilaciones C++
RUN apt-get update && apt-get install -y --no-install-recommends gcc && rm -rf /var/lib/apt/lists/*

# Copiar el gestor de paquetes
COPY pyproject.toml ./

# Copiar el código fuente
COPY src/ src/

# Instalar el proyecto (esto instalará FastAPI, Pandas, Uvicorn, etc.)
RUN pip install --no-cache-dir .

# Render expone la variable interna PORT automáticamente. 
# La leemos e inyectamos a Uvicorn
ENV PORT=8000

CMD ["sh", "-c", "uvicorn api.main:app --host 0.0.0.0 --port ${PORT}"]
