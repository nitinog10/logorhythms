"""
Main API Router - Combines all route modules
"""

from fastapi import APIRouter

from app.api.endpoints import auth, repositories, files, walkthroughs, diagrams, sandbox, documentation, github, upload, provenance, signal, explain, billing

router = APIRouter()

# Include all endpoint routers
router.include_router(
    auth.router,
    prefix="/auth",
    tags=["Authentication"]
)

router.include_router(
    repositories.router,
    prefix="/repositories",
    tags=["Repositories"]
)

router.include_router(
    files.router,
    prefix="/files",
    tags=["Files"]
)

router.include_router(
    walkthroughs.router,
    prefix="/walkthroughs",
    tags=["Walkthroughs"]
)

router.include_router(
    diagrams.router,
    prefix="/diagrams",
    tags=["Diagrams"]
)

router.include_router(
    sandbox.router,
    prefix="/sandbox",
    tags=["Sandbox"]
)

router.include_router(
    documentation.router,
    prefix="/documentation",
    tags=["Documentation"]
)

router.include_router(
    github.router,
    prefix="/github",
    tags=["GitHub Integration"]
)

router.include_router(
    upload.router,
    prefix="/project",
    tags=["Manual Upload"]
)

router.include_router(
    provenance.router,
    prefix="/provenance",
    tags=["Provenance"]
)

router.include_router(
    signal.router,
    prefix="/signal",
    tags=["Signal"]
)

router.include_router(
    explain.router,
    prefix="/explain",
    tags=["Inline Explain"]
)

router.include_router(
    billing.router,
    prefix="/billing",
    tags=["Billing"]
)
