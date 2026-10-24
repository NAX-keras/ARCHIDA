from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.services.search_service import semantic_search
from app.models.user import User
from app.services.auth.dependencies import get_current_user
from app.services.auth.security import ADMIN


router = APIRouter(prefix="/search", tags=["Search"])


@router.get("")
def search_documents(
    query: str = Query(..., min_length=1),
    limit: int = Query(default=5, ge=1, le=50),
    category_id: int | None = Query(default=None, ge=1),
    year: int | None = Query(default=None, ge=1900, le=2100),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Semantic search dokumen arsip.

    Parameter:
    - query: wajib
    - limit: jumlah hasil
    - category_id: filter kategori opsional
    - year: filter tahun opsional
    """

    try:
        results = semantic_search(
            db=db,
            query_text=query,
            limit=limit,
            category_id=category_id,
            year=year,
            include_private=current_user.role == ADMIN,
        )

        return {
            "status": "success",
            "message": "Semantic search completed successfully",
            "data": results,
            "meta": {
                "query": query,
                "limit": limit,
                "total_results": len(results),
                "method": "distilbert_pgvector",
                "category_id": category_id,
                "year": year,
            },
        }

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )

    except Exception as error:
        raise HTTPException(
            status_code=500,
            detail=f"Semantic search failed: {str(error)}",
        )
