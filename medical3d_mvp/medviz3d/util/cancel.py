"""Shared cancellation exception for cooperative worker cancellation."""


class UserCancelled(Exception):
    """Raised when the user cancels a long-running background task."""
