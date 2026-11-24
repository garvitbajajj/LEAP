"""Pydantic models for contract C3. Extra fields are allowed so the server can evolve."""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class Loose(BaseModel):
    model_config = ConfigDict(extra="allow", populate_by_name=True)


class Mastery(Loose):
    skill: str
    score: float = 0.1
    confidence: float = 0.2


class KnownSkill(Loose):
    skill: str
    level: int = 1


class Profile(Loose):
    """Contract C5, plus goalSkills resolved by the server."""
    userId: str
    goals: list[str] = []
    goalSkills: list[str] = []
    knownSkills: list[KnownSkill] = []
    mastery: list[Mastery] = []
    difficultyLevel: Literal["beginner", "intermediate", "advanced"] = "beginner"
    preferredFormat: str = "mixed"
    interactionCount: int = 0


class Candidate(Loose):
    """Contract C4."""
    id: str = Field(alias="_id")
    title: str
    description: str = ""
    type: str = "course"
    skills: list[str]
    prerequisites: list[str] = []
    difficulty: int = 1
    durationMins: float = 15
    popularity: float = 0.0


class HistoryEntry(Loose):
    itemId: str
    weight: float


class RecommendRequest(Loose):
    userId: str
    profile: Profile
    candidateItemIds: list[str] = []
    candidateItems: list[Candidate]
    history: list[HistoryEntry] = []
    completedItemIds: list[str] = []
    context: dict = {}
    limit: int = Field(12, ge=1, le=100)


class Factor(BaseModel):
    factor: str
    contribution: float


class RankedItem(BaseModel):
    itemId: str
    score: float
    rank: int
    factors: list[Factor]
    reason: str


class RecommendResponse(BaseModel):
    modelVersion: str
    strategy: Literal["hybrid", "cold_start"]
    items: list[RankedItem]


class EmbedRequest(BaseModel):
    texts: list[str] = Field(..., min_length=1, max_length=100)
