# CPU Scheduling Simulation

This project compares strict priority scheduling, linear aging, burst-proportional aging, and an adaptive aging method. It includes a C simulation engine and a browser dashboard.

## Run the C simulation

```sh
gcc -O2 c_engine.c -lm -o c_engine
./c_engine
```

The program writes `simulation_results.csv` in the current directory.

## Run the dashboard

From this folder, start a local server:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000` in a browser. The charts use Chart.js from a CDN, so an internet connection is needed for chart rendering.

## Files

- `c_engine.c`: simulation implementation
- `index.html`, `styles.css`, `script.js`: browser dashboard
- `simulation_results.csv`: sample simulation output
