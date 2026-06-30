"use client";

import React, { useState, useEffect } from "react";
import { useAppStore } from "@/store/useAppStore";
import { useTasks, Task } from "@/hooks/useTasks";

export default function Home() {
  const { currentTask, setCurrentTask, logs, addLog } = useAppStore();
  const { tasks, isLoading, isError, refresh } = useTasks();
  const [newLogText, setNewLogText] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleAddTaskLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (newLogText.trim()) {
      addLog(newLogText.trim());
      setNewLogText("");
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="border-b border-slate-800 pb-6">
          <h1 className="text-3xl font-bold tracking-tight text-indigo-400">Next.js Agentic Dev Container</h1>
          <p className="text-slate-400 mt-2">
            Status dashboard for local containerized development integrated with the Antigravity CLI.
          </p>
        </header>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Left Column: Task Watcher Status */}
          <section className="bg-slate-900 border border-slate-800 rounded-lg p-6 space-y-4">
            <h2 className="text-xl font-semibold text-slate-200">Task Tracker (SWR)</h2>
            {isLoading ? (
              <p className="text-slate-500">Loading tasks...</p>
            ) : isError ? (
              <p className="text-red-400">Failed to load tasks.</p>
            ) : (
              <ul className="space-y-3">
                {tasks.map((task: Task) => (
                  <li 
                    key={task.id} 
                    onClick={() => {
                      setCurrentTask(task.title);
                      addLog(`Selected task: ${task.title}`);
                    }}
                    className={`p-3 rounded border transition cursor-pointer flex items-center justify-between ${
                      currentTask === task.title 
                        ? "bg-indigo-950/40 border-indigo-500 text-indigo-200" 
                        : "bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700"
                    }`}
                  >
                    <span>{task.title}</span>
                    <span className={`text-xs px-2 py-1 rounded font-mono ${
                      task.status === 'completed' 
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" 
                        : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    }`}>
                      {task.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <button 
              onClick={() => refresh()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 rounded text-sm font-medium transition"
            >
              Refresh Tasks
            </button>
          </section>

          {/* Right Column: App Store Logs */}
          <section className="bg-slate-900 border border-slate-800 rounded-lg p-6 flex flex-col h-[350px]">
            <h2 className="text-xl font-semibold text-slate-200 mb-4">State Logs (Zustand)</h2>
            <div className="flex-1 overflow-y-auto bg-slate-950 border border-slate-800 rounded p-4 font-mono text-xs text-indigo-300 space-y-2 mb-4">
              {logs.map((log, idx) => (
                <div key={idx} className="border-b border-slate-900 pb-1">
                  <span className="text-slate-600">[{mounted ? new Date().toLocaleTimeString() : ""}]</span> {log}
                </div>
              ))}
              {currentTask && (
                <div className="text-amber-400 font-semibold pt-1">
                  Active Task Context: {currentTask}
                </div>
              )}
            </div>
            
            <form onSubmit={handleAddTaskLog} className="flex gap-2">
              <input
                type="text"
                placeholder="Log event..."
                value={newLogText}
                onChange={(e) => setNewLogText(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <button 
                type="submit"
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-900 border border-slate-700 rounded text-sm transition"
              >
                Log
              </button>
            </form>
          </section>
        </div>

        {/* Footer info about Docker Env */}
        <footer className="bg-slate-900 border border-slate-800 rounded-lg p-6 space-y-3">
          <h3 className="text-lg font-medium text-slate-200">Docker Environment Status</h3>
          <div className="grid grid-cols-2 gap-4 text-sm font-mono">
            <div>
              <span className="text-slate-500">Base Image:</span> <span className="text-indigo-400">node:20-bookworm</span>
            </div>
            <div>
              <span className="text-slate-500">Container User:</span> <span className="text-indigo-400">node (UID 1000)</span>
            </div>
            <div>
              <span className="text-slate-500">Volume Mapped Workspace:</span> <span className="text-indigo-400">/app</span>
            </div>
            <div>
              <span className="text-slate-500">AGY CLI:</span> <span className="text-indigo-400">/usr/local/bin/agy</span>
            </div>
          </div>
        </footer>

      </div>
    </main>
  );
}
