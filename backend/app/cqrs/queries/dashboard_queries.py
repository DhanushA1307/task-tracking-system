from dataclasses import dataclass

@dataclass
class GetDashboardStatsQuery:
    user_id: int
    role: str

