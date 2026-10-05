# CPU image for local development and CI.
# For the AMD deployment, swap the base image for a ROCm PyTorch image and add the
# trained model; the HTTP interface stays the same.
FROM python:3.12-slim
WORKDIR /srv
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app ./app
EXPOSE 8100
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8100"]
