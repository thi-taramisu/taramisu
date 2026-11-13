FROM python:3.13-alpine
RUN pip install --no-cache-dir boto3==1.40.64
WORKDIR /app
COPY bootstrap.py /app/bootstrap.py
ENTRYPOINT ["python", "/app/bootstrap.py"]
