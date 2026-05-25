"""Predefined per-agent alibis.

We keep alibis deterministic by traitor:
- one fixed set per possible traitor
- the traitor's alibi has exactly one subtle flaw
"""

ALIBI_SETS: dict[str, dict[str, str]] = {
    # Daisy is the traitor (her alibi has the flaw)
    "daisy": {
        "daisy": (
            "I was in Greenhouse B doing the pH calibration on the hydroponics at 14:30. "
            "I ducked out to Storage Ring C for a replacement probe because the kit was missing one, and then went straight back. "
            "It couldn't have been more than a couple minutes."
        ),
        "nova": (
            "I was in Engineering Bay 3 swapping coolant filters at 14:30. "
            "I logged the part serials in the maintenance terminal and pinged Ops when the pressure stabilized."
        ),
        "flint": (
            "I was on Deck 4 in the auxiliary conduit run at 14:30, replacing a scorched breaker and reseating the junction. "
            "The power draw graph will show the spike and the drop right when I finished."
        ),
    },
    # Nova is the traitor (their alibi has the flaw)
    "nova": {
        "daisy": (
            "I was in Greenhouse B pruning the tomato racks and flushing the nutrient line at 14:30. "
            "The greenhouse door log should show my badge, and Flint joked at me over comms when the pump squealed."
        ),
        "nova": (
            "I was in Engineering Bay 3 replacing coolant filters at 14:30. "
            "I signed the maintenance log around 14:15, or maybe it was closer to 14:45, the station clock in that bay lags sometimes. "
            "Either way I was there the whole time."
        ),
        "flint": (
            "I was on Deck 4 tracing a dead short at 14:30 and rerouting power through the auxiliary junction. "
            "You can check the breaker panel logs, I tripped and reset it twice before it held."
        ),
    },
    # Flint is the traitor (his alibi has the flaw)
    "flint": {
        "daisy": (
            "I was in Greenhouse B restocking nutrient cartridges at 14:30 and running a quick leaf scan on the basil trays. "
            "Nova asked me to confirm the pump reading over comms right before the alarm."
        ),
        "nova": (
            "I was in Engineering Bay 3 at 14:30 finishing a coolant bleed and sealing the filter housing. "
            "The bay camera and the maintenance log will back that up."
        ),
        "flint": (
            "I was on Deck 4 rewiring the auxiliary conduit at 14:30, heading to the junction box by the corridor. "
            "I had to cut through the passage by Airlock 2 to grab a crimp tool I left in a wall cabinet, then I went right back."
        ),
    },
}


async def generate_alibis(traitor: str) -> dict[str, str]:
    """Return predefined alibis for the current game.

    The result is deterministic by traitor to ensure the traitor always gets the
    intentionally flawed alibi.
    """

    traitor = (traitor or "").lower().strip()
    if traitor not in ALIBI_SETS:
        # Should never happen, but keep the server from crashing on bad state.
        traitor = "daisy"
    return dict(ALIBI_SETS[traitor])
