"""Orchestrator: drives all agent activity.

Split into focused modules for readability; public API remains:
- AgentCallbacks
- handle_player_message
- handle_eject
"""

from .core import AgentCallbacks, handle_eject, handle_player_message

__all__ = ["AgentCallbacks", "handle_player_message", "handle_eject"]
