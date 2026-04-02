from celery import Celery
import os
import sys
sys.path.insert(0, "/app")

CELERY_BROKER_URL = os.getenv("CELERY_BROKER_URL", "redis://localhost:6379/0")

celery_app = Celery(
    "kokito",
    broker=CELERY_BROKER_URL,
    backend=CELERY_BROKER_URL,
    include=["tasks"]
)

celery_app.conf.update(
    result_backend=CELERY_BROKER_URL
)