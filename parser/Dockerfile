FROM python:3.12.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends antiword && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY parser/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY parser/server.py .
RUN useradd --uid 10001 --create-home parser
USER 10001
EXPOSE 8000
CMD ["python", "server.py"]
