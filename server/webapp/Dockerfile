
FROM python:3.10-slim

RUN apt-get update && apt-get install -y openssh-client && rm -rf /var/lib/apt/lists/*


WORKDIR /

COPY /install/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p uploads ansible-client

EXPOSE 8000

CMD ["python3", "app.py"]