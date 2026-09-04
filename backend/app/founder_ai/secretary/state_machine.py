CONVERSATION_STATES = ("exploring", "clarifying", "converging", "consensus", "goal_ready", "goal_confirmed", "planning", "approved", "executing", "completed")

ALLOWED_TRANSITIONS = {
    "exploring": {"clarifying", "converging"}, "clarifying": {"converging", "consensus"},
    "converging": {"consensus", "goal_ready"}, "consensus": {"goal_ready"},
    "goal_ready": {"goal_confirmed", "clarifying"}, "goal_confirmed": {"planning"},
    "planning": {"approved"}, "approved": {"executing"}, "executing": {"completed", "approved"},
    "completed": set(),
}


def advance_discussion(current: str, message_count: int, has_candidate: bool) -> str:
    if has_candidate and message_count >= 2:
        return "goal_ready"
    if message_count >= 4:
        return "consensus"
    if message_count >= 3:
        return "converging"
    if message_count >= 2:
        return "clarifying"
    return current if current in CONVERSATION_STATES else "exploring"
