from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field


class RenameColumnOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation: Literal["rename_column"]
    columnId: str
    title: str


class CreateCardOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation: Literal["create_card"]
    columnId: str
    title: str
    details: str = ""


class EditCardOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation: Literal["edit_card"]
    cardId: str
    title: str
    details: str | None = None


class DeleteCardOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation: Literal["delete_card"]
    cardId: str


class MoveCardOperation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation: Literal["move_card"]
    cardId: str
    columnId: str
    position: int = Field(ge=0)


BoardOperation = Annotated[
    RenameColumnOperation
    | CreateCardOperation
    | EditCardOperation
    | DeleteCardOperation
    | MoveCardOperation,
    Field(discriminator="operation"),
]


class StructuredAiResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: Literal[1]
    response: str
    operations: list[BoardOperation] = Field(default_factory=list)
