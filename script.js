class Task {
    constructor(pid, arrival, burst, base_priority) {
        this.pid = pid;
        this.arrival = arrival;             
        this.burst = burst;                 
        this.remaining = burst;             
        this.base_priority = base_priority;
        this.current_priority = base_priority;
        this.wait_time = 0;                 
        this.completion_time = 0;           
        this.first_run_time = -1;           
        this.estimated_burst = burst;
    }
}

function getBaselineWorkload() {
    let tasks = [];
    tasks.push(new Task("Victim_Batch", 0, 50, 1)); 
    for (let i = 1; i < 15; i++) {
        tasks.push(new Task(`HighPrio_${i}`, i * 5, 10, 8)); 
    }
    return tasks;
}

function getRandomWorkload() {
    let tasks = [];
    tasks.push(new Task("Victim_Batch", 0, 50, 1));
    for (let i = 1; i < 15; i++) {
        let arrival = Math.floor(Math.random() * 12) * 4;
        let burst = Math.floor(Math.random() * 8) + 3;
        let priority = Math.floor(Math.random() * 4) + 6;
        tasks.push(new Task(`Task_${i}`, arrival, burst, priority));
    }
    return tasks;
}

function simulate(inputTasks, schedulerType, alpha = 3.0, linearK = 0.2) {
    let tasks = JSON.parse(JSON.stringify(inputTasks)).map(t => new Task(t.pid, t.arrival, t.burst, t.base_priority));
    let time_ms = 0;
    let completed = 0;
    let n = tasks.length;
    let contextSwitches = 0;
    let prevPid = null;
    let timeline = [];

    const P_MAX = 15.0;
    const GAMMA = 0.5;
    const EWMA_MU = 0.7;

    while (completed < n) {
        let readyQueue = tasks.filter(t => t.arrival <= time_ms && t.remaining > 0);

        if (readyQueue.length === 0) {
            timeline.push({ time_ms, pid: "IDLE" });
            time_ms++;
            continue;
        }

        readyQueue.forEach(t => {
            if (schedulerType === 'strict') {
                t.current_priority = t.base_priority;
            } else if (schedulerType === 'linear') {
                t.current_priority = t.base_priority + (linearK * t.wait_time);
            } else if (schedulerType === 'proposed') {
                
                t.current_priority = t.base_priority + (alpha * (t.wait_time / t.burst));
            } else if (schedulerType === 'adaptive') {
                
                let alphaAdaptive = alpha * (1.0 + GAMMA * (readyQueue.length / n));
                let denomBurst = t.remaining > 0 ? t.remaining : 1;
                let rawRatio = t.wait_time / denomBurst;
                let dynamicBoost = (P_MAX - t.base_priority) * (1.0 - Math.exp(-0.08 * alphaAdaptive * rawRatio));
                t.current_priority = t.base_priority + dynamicBoost;
            }
        });

        readyQueue.sort((a, b) => b.current_priority - a.current_priority || a.arrival - b.arrival);
        let currentTask = readyQueue[0];

        timeline.push({ time_ms, pid: currentTask.pid });

        if (currentTask.first_run_time === -1) {
            currentTask.first_run_time = time_ms;
        }

        if (prevPid !== null && prevPid !== currentTask.pid) {
            contextSwitches++;
        }
        prevPid = currentTask.pid;

        currentTask.remaining--;
        currentTask.estimated_burst = (EWMA_MU * currentTask.remaining) + ((1.0 - EWMA_MU) * currentTask.estimated_burst);

        readyQueue.slice(1).forEach(t => t.wait_time++);
        time_ms++;

        if (currentTask.remaining === 0) {
            currentTask.completion_time = time_ms;
            completed++;
        }
    }

    let maxWait = Math.max(...tasks.map(t => t.wait_time));
    let avgTurnaround = tasks.reduce((sum, t) => sum + (t.completion_time - t.arrival), 0) / n;
    let avgResponse = tasks.reduce((sum, t) => sum + (t.first_run_time - t.arrival), 0) / n;

    let sumWait = tasks.reduce((sum, t) => sum + t.wait_time, 0);
    let sumWaitSq = tasks.reduce((sum, t) => sum + (t.wait_time * t.wait_time), 0);
    let jainsIndex = sumWaitSq > 0 ? (sumWait * sumWait) / (n * sumWaitSq) : 1.0;

    return { maxWait, avgTurnaround, avgResponse, contextSwitches, jainsIndex, timeline, tasks };
}

let comparisonChartInstance = null;
let alphaChartInstance = null;
let lastSelectedResult = null;

function renderGanttTimeline(timeline) {
    const ganttContainer = document.getElementById("ganttTimeline");
    ganttContainer.innerHTML = "";

    if (timeline.length === 0) return;

    let blocks = [];
    let curr = { pid: timeline[0].pid, duration: 1 };
    for (let i = 1; i < timeline.length; i++) {
        if (timeline[i].pid === curr.pid) {
            curr.duration++;
        } else {
            blocks.push(curr);
            curr = { pid: timeline[i].pid, duration: 1 };
        }
    }
    blocks.push(curr);

    const colors = ["#2563eb", "#16a34a", "#d97706", "#7c3aed", "#db2777", "#0891b2", "#475569"];
    let pidColorMap = {};
    let colorIdx = 0;

    blocks.forEach(b => {
        if (!pidColorMap[b.pid] && b.pid !== "IDLE") {
            pidColorMap[b.pid] = colors[colorIdx % colors.length];
            colorIdx++;
        }

        const div = document.createElement("div");
        div.className = "gantt-block";
        div.style.backgroundColor = b.pid === "IDLE" ? "#cbd5e1" : pidColorMap[b.pid];
        div.style.minWidth = `${Math.max(28, b.duration * 2)}px`;
        div.innerText = b.pid === "Victim_Batch" ? "Victim" : b.pid.replace("HighPrio_", "H");
        div.title = `Task: ${b.pid} (Duration: ${b.duration} ms)`;
        ganttContainer.appendChild(div);
    });
}

function exportCSVData() {
    if (!lastSelectedResult) return;
    let csvContent = "data:text/csv;charset=utf-8,PID,WaitTime_ms,TurnaroundTime_ms,ResponseTime_ms\n";
    lastSelectedResult.tasks.forEach(t => {
        let turnaround = t.completion_time - t.arrival;
        let response = t.first_run_time - t.arrival;
        csvContent += `${t.pid},${t.wait_time},${turnaround},${response}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "scheduler_simulation_metrics_ms.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function updateDashboard() {
    const workloadType = document.getElementById("workloadSelect").value;
    const engineMode = document.getElementById("engineModeSelect").value;
    const alpha = parseFloat(document.getElementById("alphaInput").value) || 3.0;
    const linearK = parseFloat(document.getElementById("linearKInput").value) || 0.2;

    const workload = workloadType === "baseline" ? getBaselineWorkload() : getRandomWorkload();

    const strictRes = simulate(workload, "strict", alpha, linearK);
    const linearRes = simulate(workload, "linear", alpha, linearK);
    const proposedRes = simulate(workload, "proposed", alpha, linearK);
    const adaptiveRes = simulate(workload, "adaptive", alpha, linearK);

    const activeRes = engineMode === "proposed" ? proposedRes : adaptiveRes;
    lastSelectedResult = activeRes;

    
    document.getElementById("strictWaitVal").innerText = `${strictRes.maxWait} ms`;
    document.getElementById("linearTurnVal").innerText = `${linearRes.avgTurnaround.toFixed(1)} ms`;
    document.getElementById("proposedWaitVal").innerText = `${activeRes.maxWait} ms`;
    document.getElementById("proposedJainVal").innerText = activeRes.jainsIndex.toFixed(3);

    document.getElementById("ganttTitle").innerText = engineMode === "proposed" ? 
        "Baseline Proposed Burst-Ratio Execution Flow (ms)" : "Multi-Novelty Adaptive Engine Execution Flow (ms)";

    renderGanttTimeline(activeRes.timeline);

    
    const tbody = document.querySelector("#resultsTable tbody");
    tbody.innerHTML = `
        <tr>
            <td>Strict Priority</td>
            <td>${strictRes.maxWait} ms</td>
            <td>${strictRes.avgTurnaround.toFixed(2)} ms</td>
            <td>${strictRes.avgResponse.toFixed(2)} ms</td>
            <td>${strictRes.contextSwitches}</td>
            <td>${strictRes.jainsIndex.toFixed(4)}</td>
        </tr>
        <tr>
            <td>Standard Linear Aging</td>
            <td>${linearRes.maxWait} ms</td>
            <td>${linearRes.avgTurnaround.toFixed(2)} ms</td>
            <td>${linearRes.avgResponse.toFixed(2)} ms</td>
            <td>${linearRes.contextSwitches}</td>
            <td>${linearRes.jainsIndex.toFixed(4)}</td>
        </tr>
        <tr>
            <td>Baseline Proposed Ratio Aging</td>
            <td>${proposedRes.maxWait} ms</td>
            <td>${proposedRes.avgTurnaround.toFixed(2)} ms</td>
            <td>${proposedRes.avgResponse.toFixed(2)} ms</td>
            <td>${proposedRes.contextSwitches}</td>
            <td>${proposedRes.jainsIndex.toFixed(4)}</td>
        </tr>
        <tr class="highlight-row">
            <td>Multi-Novelty Adaptive Engine</td>
            <td>${adaptiveRes.maxWait} ms</td>
            <td>${adaptiveRes.avgTurnaround.toFixed(2)} ms</td>
            <td>${adaptiveRes.avgResponse.toFixed(2)} ms</td>
            <td>${adaptiveRes.contextSwitches}</td>
            <td>${adaptiveRes.jainsIndex.toFixed(4)}</td>
        </tr>
    `;

    
    const compCtx = document.getElementById('comparisonChart').getContext('2d');
    if (comparisonChartInstance) comparisonChartInstance.destroy();

    comparisonChartInstance = new Chart(compCtx, {
        type: 'bar',
        data: {
            labels: ['Strict Priority', 'Linear Aging', 'Baseline Proposed', 'Multi-Novelty Adaptive'],
            datasets: [
                { label: 'Max Wait Time (ms - Lower = Better)', data: [strictRes.maxWait, linearRes.maxWait, proposedRes.maxWait, adaptiveRes.maxWait], backgroundColor: '#dc2626' },
                { label: 'Avg Turnaround (ms - Lower = Better)', data: [strictRes.avgTurnaround, linearRes.avgTurnaround, proposedRes.avgTurnaround, adaptiveRes.avgTurnaround], backgroundColor: '#2563eb' }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } },
            scales: { y: { beginAtZero: true, title: { display: true, text: 'Time (ms)' } } }
        }
    });

    
    const alphas = [0.5, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 8.0, 10.0];
    const jainScores = alphas.map(a => simulate(workload, engineMode, a, linearK).jainsIndex);

    const alphaCtx = document.getElementById('alphaChart').getContext('2d');
    if (alphaChartInstance) alphaChartInstance.destroy();

    alphaChartInstance = new Chart(alphaCtx, {
        type: 'line',
        data: {
            labels: alphas,
            datasets: [{
                label: `Jain's Fairness Index vs Alpha (${engineMode === 'proposed' ? 'Baseline' : 'Adaptive'})`,
                data: jainScores,
                borderColor: '#16a34a',
                backgroundColor: 'rgba(22, 163, 74, 0.05)',
                fill: true,
                tension: 0.2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: 'bottom' } },
            scales: { y: { min: 0.0, max: 1.0, title: { display: true, text: "Jain's Fairness Index (0.0 to 1.0)" } } }
        }
    });
}

document.getElementById("runBtn").addEventListener("click", updateDashboard);
document.getElementById("exportBtn").addEventListener("click", exportCSVData);
document.getElementById("engineModeSelect").addEventListener("change", updateDashboard);
window.addEventListener("DOMContentLoaded", updateDashboard);