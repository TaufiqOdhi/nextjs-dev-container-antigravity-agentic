import useSWR from 'swr'

const fetcher = (url: string) => fetch(url).then((res) => res.json())

export interface Task {
  id: string;
  title: string;
  status: 'completed' | 'pending' | 'running';
}

export function useTasks() {
  const { data, error, isLoading, mutate } = useSWR<Task[]>('/api/tasks', fetcher, {
    fallbackData: [
      { id: "1", title: "Milestone 1: Init Docker & Next.js", status: "completed" },
      { id: "2", title: "Milestone 2: Task Watcher Integration", status: "pending" },
      { id: "3", title: "Milestone 3: Persistence Config", status: "pending" },
    ]
  })

  return {
    tasks: data || [],
    isLoading,
    isError: error,
    refresh: mutate
  }
}
