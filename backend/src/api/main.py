from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routes.query import router as query_router
from api.routes.upload import router as upload_router
from api.routes.publish import router as publish_router


app = FastAPI(title="Kibana Logs Processor API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload_router, prefix="/api", tags=["upload"])
app.include_router(query_router, prefix="/api", tags=["query"])
app.include_router(publish_router, prefix="/api", tags=["publish"])


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
