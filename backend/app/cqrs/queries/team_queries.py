from dataclasses import dataclass

@dataclass
class GetHierarchyQuery:
    user_id: int
    role: str

