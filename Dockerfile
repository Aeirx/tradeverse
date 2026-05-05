FROM python:3.10-slim

# Create a non-root user that Hugging Face requires
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user \
    PATH=/home/user/.local/bin:$PATH

WORKDIR $HOME/app

# Copy requirements from the AI folder
COPY --chown=user:user Tradeverse-AI/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the AI code
COPY --chown=user:user Tradeverse-AI/ .

# Hugging Face Spaces mandates port 7860
EXPOSE 7860

# Run the FastAPI app
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
