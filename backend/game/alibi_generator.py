"""Predefined per-agent alibis.

We keep alibis deterministic by traitor:
- one fixed set per possible traitor
- the traitor's alibi has exactly one subtle flaw
"""

ALIBI_SETS: dict[str, dict[str, str]] = {
    # DAISY IS THE TRAITOR
    # Hidden contradiction:
    # Daisy claims she grabbed a replacement pH probe from
    # Storage Ring C, but Nova indirectly establishes that
    # hydroponic calibration probes are controlled equipment
    # kept only in Lab Storage under engineering authorization.
    "daisy": {
        "daisy": (
            "At 14:30 I was in Greenhouse B recalibrating the hydroponic pH regulators after the tomato beds started drifting acidic again. "
            "The calibration kit was missing its probe, so I went to Storage Ring C to grab a replacement and came straight back. "
            "I was only gone a couple of minutes. "
            "When I returned, the nutrient pumps were still cycling normally and the greenhouse warning alarm hadn’t triggered yet."
        ),
        "nova": (
            "At 14:30 I was in Engineering Bay 3 replacing coolant filters on the secondary reactor loop. "
            "Ops asked us earlier this week to stop leaving sensitive calibration equipment in general storage after someone misplaced a hydroponics probe, "
            "so all serialized tools are locked in Lab Storage now. "
            "I stayed in Engineering the whole shift because the coolant system had to remain depressurized during the repair."
        ),
        "flint": (
            "At 14:30 I was on Deck 4 repairing a scorched breaker junction in the auxiliary conduit corridor. "
            "There was a brief spike in the power draw when I reseated the connection, then the grid stabilized a few seconds later. "
            "Engineering logs should show the fluctuation."
        ),
    },
    # NOVA IS THE TRAITOR
    # Hidden contradiction:
    # Nova claims uncertainty about the maintenance log time,
    # but Daisy indirectly establishes that all maintenance
    # entries are automatically timestamped by the station AI.
    "nova": {
        "daisy": (
            "At 14:30 I was in Greenhouse B pruning the tomato racks and flushing sediment from the nutrient lines. "
            "Maintenance finally fixed the station timestamp sync last week, so the greenhouse logs actually match central station time for once. "
            "Flint joked over comms when one of the circulation pumps squealed loud enough to echo through the vents."
        ),
        "nova": (
            "At 14:30 I was in Engineering Bay 3 replacing coolant filters on the reactor loop. "
            "I remember signing the maintenance log at around 14:15… or maybe closer to 14:45. "
            "I wasn’t really paying attention to the clock because I was focused on stabilizing the pressure levels. "
            "But I stayed in Engineering the whole time."
        ),
        "flint": (
            "At 14:30 I was on Deck 4 tracing a dead short through the auxiliary junctions. "
            "I had to trip and reset the breaker panel twice before the rerouted circuit finally held stable. "
            "The breaker logs should confirm both resets."
        ),
    },
    # FLINT IS THE TRAITOR
    # Hidden contradiction:
    # Flint claims he used the Airlock 2 corridor,
    # but Nova casually establishes that Airlock 2
    # was sealed for exterior maintenance during the shift.
    "flint": {
        "daisy": (
            "At 14:30 I was in Greenhouse B restocking nutrient cartridges and running a fungal scan on the basil trays. "
            "Nova called over comms asking me to confirm the irrigation pump pressure shortly before the emergency alarm sounded."
        ),
        "nova": (
            "At 14:30 I was in Engineering Bay 3 completing a coolant bleed and resealing the filter housing on the secondary loop. "
            "Ops had Airlock 2 sealed for exterior maintenance during the pressure test, so the bay was quieter than usual without foot traffic through that corridor. "
            "The maintenance logs and bay camera should both confirm I stayed there the entire time."
        ),
        "flint": (
            "At 14:30 I was on Deck 4 rewiring the auxiliary conduit near the junction corridor. "
            "I realized I’d left my crimp tool behind, so I cut through the passage near Airlock 2 to grab it from a wall cabinet before returning to finish the repair. "
            "I was gone less than five minutes."
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
