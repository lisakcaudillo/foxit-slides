from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Dict, Literal

AgentRole = Literal["decision_support", "extraction", "action"]


class Tool(ABC):
    """Base interface for agent tools.

    Attributes
    ----------
    role : AgentRole
        Classification per EU AI Act framing:
        - ``extraction``: reads and structures data, no judgment calls
        - ``decision_support``: produces recommendations for human review
        - ``action``: performs side-effects that require human approval gate
    """

    name: str
    description: str
    role: AgentRole = "extraction"  # safe default — override in subclass

    @abstractmethod
    def run(self, input: Dict[str, Any], context: Dict[str, Any]) -> Dict[str, Any]:
        raise NotImplementedError()
