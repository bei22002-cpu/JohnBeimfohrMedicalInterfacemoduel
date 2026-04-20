# ── Cardiac MRI 3D Service ───────────────────────────────────────────────────
# GPU recommended (TotalSegmentator uses it automatically if available).
# CPU-only works but segmentation will take 5-15 min per case.
#
# Build:  docker build -t cardiac-mri-service .
# Run:    docker run -p 8000:8000 -v $(pwd)/data:/app/data cardiac-mri-service
# GPU:    docker run --gpus all -p 8000:8000 -v $(pwd)/data:/app/data cardiac-mri-service
# ─────────────────────────────────────────────────────────────────────────────

FROM python:3.11-slim

# system deps: dcm2niix (DICOM converter), libgomp (OpenMP for scikit-image)
RUN apt-get update && apt-get install -y --no-install-recommends \
    dcm2niix \
    libgomp1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# data dirs are mounted at runtime
RUN mkdir -p data/uploads data/meshes

EXPOSE 8000

# ⚠️  Physician-initiated visualization only — NOT for clinical diagnosis
ENV DISCLAIMER="Visualization only. Not approved for clinical diagnosis."

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
