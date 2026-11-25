from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.domain import User
from app.models.schemas import DashboardMetricsResponse
from app.cqrs.queries.dashboard_queries import GetDashboardStatsQuery
from app.cqrs.handlers.query_handlers import QueryHandlers

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])

@router.get("/stats", response_model=DashboardMetricsResponse)
def get_dashboard_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    query = GetDashboardStatsQuery(user_id=current_user.id, role=current_user.role)
    stats = QueryHandlers.handle_get_dashboard_stats(query, db)
    return stats

