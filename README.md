# Traffic Jam Physics Lab

A standalone browser simulation of phantom traffic jams on a closed-loop road.
It uses an intelligent-driver car-following model, so congestion waves emerge
from vehicle density, reaction time, braking behavior, and disturbances.

## Run

Open `index.html` directly in a browser, or serve the folder locally:

```bash
python3 -m http.server 4173
```

Then visit `http://127.0.0.1:4173/index.html`.

## Controls

- Vehicles, road length, and target speed set the density and flow regime.
- Reaction time, acceleration, braking, and minimum gap shape driver behavior.
- Driver variation and disturbance make stop-and-go waves easier to trigger.
- Velocity trails, congestion heat, wave echoes, and sensor gates can be toggled.
