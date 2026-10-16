#include <stdio.h>
#include <stdlib.h>
#include <time.h>
#include <string.h>
#include <math.h>

#define MAX_TASKS 50
#define P_MAX 15.0       
#define GAMMA 0.5        
#define EWMA_MU 0.7      

typedef struct {
    char pid[20];
    int arrival;             
    int burst;               
    int remaining;           
    int base_priority;
    double current_priority;
    int wait_time;           
    int completion_time;     
    int first_run_time;      
    double estimated_burst;  
} Task;

void reset_tasks(Task src[], Task dest[], int n) {
    for (int i = 0; i < n; i++) {
        dest[i] = src[i];
        dest[i].remaining = src[i].burst;
        dest[i].wait_time = 0;
        dest[i].completion_time = 0;
        dest[i].first_run_time = -1;
        dest[i].current_priority = (double)src[i].base_priority;
        dest[i].estimated_burst = (double)src[i].burst;
    }
}

int generate_baseline_workload(Task tasks[]) {
    
    snprintf(tasks[0].pid, sizeof(tasks[0].pid), "Victim_Batch");
    tasks[0].arrival = 0;       
    tasks[0].burst = 50;        
    tasks[0].base_priority = 1;

    
    for (int i = 1; i < 15; i++) {
        snprintf(tasks[i].pid, sizeof(tasks[i].pid), "HighPrio_%d", i);
        tasks[i].arrival = i * 5; 
        tasks[i].burst = 10;      
        tasks[i].base_priority = 8;
    }
    return 15;
}

void export_to_csv(const char *filename, const char *alg_name, Task tasks[], int n, int max_wait, double avg_turn, double avg_resp, int cs, double jains) {
    FILE *fp = fopen(filename, "a");
    if (!fp) return;

    fprintf(fp, "Algorithm,PID,Arrival_ms,Burst_ms,WaitTime_ms,TurnaroundTime_ms,ResponseTime_ms\n");
    for (int i = 0; i < n; i++) {
        int turnaround = tasks[i].completion_time - tasks[i].arrival;
        int response = tasks[i].first_run_time - tasks[i].arrival;
        fprintf(fp, "%s,%s,%d,%d,%d,%d,%d\n", alg_name, tasks[i].pid, tasks[i].arrival, tasks[i].burst, tasks[i].wait_time, turnaround, response);
    }
    fprintf(fp, "SUMMARY,%s,MaxWait_ms:%d,AvgTurnaround_ms:%.2f,AvgResponse_ms:%.2f,ContextSwitches:%d,JainsIndex:%.4f\n\n", 
            alg_name, max_wait, avg_turn, avg_resp, cs, jains);
    fclose(fp);
}

void run_simulation(Task input_tasks[], int n, int scheduler_type, double alpha_0, double linear_k, int verbose) {
    Task tasks[MAX_TASKS];
    reset_tasks(input_tasks, tasks, n);

    int time_ms = 0;
    int completed = 0;
    int context_switches = 0;
    int prev_task_index = -1;

    const char *names[] = {
        "Strict Priority", 
        "Standard Linear Aging", 
        "Baseline Proposed Ratio Aging", 
        "Multi-Novelty Adaptive Engine"
    };

    if (verbose) printf("\n=== EXECUTION TRACE (ms): %s ===\n", names[scheduler_type]);

    while (completed < n) {
        int ready_count = 0;
        for (int i = 0; i < n; i++) {
            if (tasks[i].arrival <= time_ms && tasks[i].remaining > 0) {
                ready_count++;
            }
        }

        int best_idx = -1;
        double max_prio = -1e9;

        
        for (int i = 0; i < n; i++) {
            if (tasks[i].arrival <= time_ms && tasks[i].remaining > 0) {
                if (scheduler_type == 0) {
                    
                    tasks[i].current_priority = (double)tasks[i].base_priority;
                } else if (scheduler_type == 1) {
                    
                    tasks[i].current_priority = tasks[i].base_priority + (linear_k * tasks[i].wait_time);
                } else if (scheduler_type == 2) {
                    
                    tasks[i].current_priority = tasks[i].base_priority + (alpha_0 * ((double)tasks[i].wait_time / tasks[i].burst));
                } else if (scheduler_type == 3) {
                    
                    double alpha_adaptive = alpha_0 * (1.0 + GAMMA * ((double)ready_count / n));
                    int denom_burst = tasks[i].remaining > 0 ? tasks[i].remaining : 1;
                    double raw_ratio = (double)tasks[i].wait_time / denom_burst;
                    
                    
                    double dynamic_boost = (P_MAX - tasks[i].base_priority) * (1.0 - exp(-0.08 * alpha_adaptive * raw_ratio));
                    tasks[i].current_priority = tasks[i].base_priority + dynamic_boost;
                }

                if (best_idx == -1 || tasks[i].current_priority > max_prio ||
                   (tasks[i].current_priority == max_prio && tasks[i].arrival < tasks[best_idx].arrival)) {
                    max_prio = tasks[i].current_priority;
                    best_idx = i;
                }
            }
        }

        if (best_idx == -1) {
            time_ms++;
            continue;
        }

        if (tasks[best_idx].first_run_time == -1) {
            tasks[best_idx].first_run_time = time_ms;
        }

        if (prev_task_index != -1 && prev_task_index != best_idx) {
            context_switches++;
        }
        prev_task_index = best_idx;

        if (verbose && time_ms % 10 == 0) {
            printf("[Time %3d ms] Dispatched: %-12s | Effective Priority: %6.2f\n", 
                   time_ms, tasks[best_idx].pid, tasks[best_idx].current_priority);
        }

        tasks[best_idx].remaining--;

        
        tasks[best_idx].estimated_burst = (EWMA_MU * tasks[best_idx].remaining) + ((1.0 - EWMA_MU) * tasks[best_idx].estimated_burst);

        for (int i = 0; i < n; i++) {
            if (i != best_idx && tasks[i].arrival <= time_ms && tasks[i].remaining > 0) {
                tasks[i].wait_time++;
            }
        }

        time_ms++;

        if (tasks[best_idx].remaining == 0) {
            tasks[best_idx].completion_time = time_ms;
            completed++;
        }
    }

    int max_wait = 0;
    double sum_turnaround = 0.0, sum_response = 0.0, sum_wait = 0.0, sum_wait_sq = 0.0;

    for (int i = 0; i < n; i++) {
        int turnaround = tasks[i].completion_time - tasks[i].arrival;
        int response = tasks[i].first_run_time - tasks[i].arrival;

        if (tasks[i].wait_time > max_wait) max_wait = tasks[i].wait_time;
        sum_turnaround += turnaround;
        sum_response += response;
        sum_wait += tasks[i].wait_time;
        sum_wait_sq += ((double)tasks[i].wait_time * tasks[i].wait_time);
    }

    double avg_turnaround = sum_turnaround / n;
    double avg_response = sum_response / n;
    double jains_index = (sum_wait_sq > 0) ? (sum_wait * sum_wait) / (n * sum_wait_sq) : 1.0;

    printf("\nAlgorithm: %s\n", names[scheduler_type]);
    printf("--------------------------------------------------\n");
    printf("Max Wait Time (Starvation) : %d ms\n", max_wait);
    printf("Avg Turnaround Time        : %.2f ms\n", avg_turnaround);
    printf("Avg Response Time          : %.2f ms\n", avg_response);
    printf("Total Context Switches     : %d\n", context_switches);
    printf("Jain's Fairness Index      : %.4f\n", jains_index);

    export_to_csv("simulation_results.csv", names[scheduler_type], tasks, n, max_wait, avg_turnaround, avg_response, context_switches, jains_index);
}

int main() {
    Task workload[MAX_TASKS];
    int n = generate_baseline_workload(workload);

    FILE *fp = fopen("simulation_results.csv", "w");
    if (fp) fclose(fp);

    printf("==================================================\n");
    printf(" CPU SCHEDULING SIMULATION ENGINE (C BACKEND)\n");
    printf("==================================================\n");

    run_simulation(workload, n, 0, 3.0, 0.2, 0); 
    run_simulation(workload, n, 1, 3.0, 0.2, 0); 
    run_simulation(workload, n, 2, 3.0, 0.2, 0); 
    run_simulation(workload, n, 3, 3.0, 0.2, 1); 

    printf("\n[SUCCESS] Simulation results exported to 'simulation_results.csv'\n");
    return 0;
}