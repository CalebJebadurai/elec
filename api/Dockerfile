FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["python", "-c", "import os; os.execlp('uvicorn', 'uvicorn', 'main:app', '--host', '0.0.0.0', '--port', os.environ.get('PORT', '8000'), '--workers', os.environ.get('WEB_CONCURRENCY', '2'), '--proxy-headers', '--forwarded-allow-ips', '*')"]
