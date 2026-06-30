import { NextResponse } from 'next/server';

export async function GET() {
  const tasks = [
    { id: "1", title: "Milestone 1: Init Docker & Next.js", status: "completed" },
    { id: "2", title: "Milestone 2: Task Watcher Integration", status: "completed" },
    { id: "3", title: "Milestone 3: Persistence Config", status: "completed" },
  ];
  return NextResponse.json(tasks);
}
