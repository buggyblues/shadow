import type { TravelDataStore } from '../db/database.js'
import type { AutomationTask } from '../types.js'

export class AutomationDao {
  constructor(private readonly db: TravelDataStore) {}

  listTasks(tripId: string) {
    return this.db.read((state) =>
      state.automationTasks
        .filter((task) => task.tripId === tripId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    )
  }

  createTask(task: AutomationTask) {
    return this.db.write((state) => {
      state.automationTasks.push(task)
      return task
    })
  }

  updateTask(taskId: string, updater: (task: AutomationTask) => AutomationTask) {
    return this.db.write((state) => {
      const index = state.automationTasks.findIndex((task) => task.id === taskId)
      if (index < 0) return null
      const current = state.automationTasks[index]
      if (!current) return null
      const next = updater(current)
      state.automationTasks[index] = next
      return next
    })
  }
}
