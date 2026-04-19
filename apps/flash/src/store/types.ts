import type {
  Card,
  Deck,
  Material,
  OutlineItem,
  Pipeline,
  PipelineItem,
  Project,
  ResearchAngle,
  ResearchSession,
  SkillDef,
  TaskArtifact,
  TaskRecord,
  ThemePreset,
  TodoItem,
  UserSettings,
  ViewMode,
} from '../types'

export type Action =
  | { type: 'SET_PROJECT'; project: Project }
  | { type: 'SET_STATUS'; status: Project['status'] }
  | { type: 'SET_TITLE'; title: string }
  // Materials
  | { type: 'ADD_MATERIALS'; materials: Material[] }
  | { type: 'UPDATE_MATERIAL'; id: string; updates: Partial<Material> }
  | { type: 'REMOVE_MATERIAL'; id: string }
  // Cards
  | { type: 'ADD_CARD'; card: Card }
  | { type: 'ADD_CARDS'; cards: Card[] }
  | { type: 'UPDATE_CARD'; id: string; updates: Partial<Card> }
  | { type: 'REMOVE_CARD'; id: string }
  | { type: 'STREAM_CARD'; card: Card }
  | { type: 'LINK_CARDS'; cardId: string; targetId: string }
  | { type: 'UNLINK_CARDS'; cardId: string; targetId: string }
  | { type: 'BIND_CARD_TO_MATERIAL'; cardId: string; materialId: string }
  | { type: 'SET_CARD_RATING'; cardId: string; rating: number }
  | { type: 'ASSIGN_CARD_TO_DECK'; cardId: string; deckId: string }
  | { type: 'UNASSIGN_CARD_FROM_DECK'; cardId: string; deckId: string }
  // Multi-Deck
  | { type: 'ADD_DECK'; deck: Deck }
  | { type: 'UPDATE_DECK'; deckId: string; updates: Partial<Deck> }
  | { type: 'REMOVE_DECK'; deckId: string }
  | { type: 'SET_ACTIVE_DECK'; deckId: string | null }
  // Deck Outline
  | { type: 'SET_OUTLINE'; deckId: string; outline: OutlineItem[] }
  | { type: 'UPDATE_OUTLINE_ITEM'; deckId: string; id: string; updates: Partial<OutlineItem> }
  | { type: 'STREAM_OUTLINE_ITEM'; deckId: string; item: OutlineItem }
  | { type: 'REMOVE_OUTLINE_ITEM'; deckId: string; id: string }
  | { type: 'REORDER_OUTLINE'; deckId: string; fromIndex: number; toIndex: number }
  | { type: 'LINK_CARD_TO_OUTLINE'; deckId: string; outlineId: string; cardId: string }
  | { type: 'UNLINK_CARD_FROM_OUTLINE'; deckId: string; outlineId: string; cardId: string }
  // Deck Theme
  | { type: 'SET_DECK_THEME'; deckId: string; theme: ThemePreset }
  | { type: 'SET_SESSION_KEY'; sessionKey: string }
  // TODO
  | { type: 'ADD_TODO'; todo: TodoItem }
  | { type: 'UPDATE_TODO'; id: string; updates: Partial<TodoItem> }
  | { type: 'REMOVE_TODO'; id: string }
  | { type: 'TOGGLE_TODO'; id: string }
  | { type: 'COMPLETE_TODO'; id: string; completionNote?: string }
  | { type: 'MOVE_CARD_TO_TODO'; cardId: string }
  // Task Center
  | { type: 'ADD_TASK'; task: TaskRecord }
  | { type: 'UPDATE_TASK'; id: string; updates: Partial<TaskRecord> }
  | { type: 'ADD_TASK_LOG'; taskId: string; message: string }
  | { type: 'ADD_TASK_ARTIFACT'; taskId: string; artifact: TaskArtifact }
  | { type: 'COMPLETE_TASK'; taskId: string; artifacts?: TaskArtifact[] }
  | { type: 'FAIL_TASK'; taskId: string; error: string }
  // Research
  | { type: 'ADD_RESEARCH_SESSION'; session: ResearchSession }
  | {
      type: 'UPDATE_RESEARCH_ANGLE'
      sessionId: string
      angleId: string
      updates: Partial<ResearchAngle>
    }
  | { type: 'ADD_RESEARCH_ANGLE_LOG'; sessionId: string; angleId: string; message: string }
  | { type: 'COMPLETE_RESEARCH'; sessionId: string }
  | { type: 'FAIL_RESEARCH'; sessionId: string; error: string }
  // Skills
  | { type: 'SET_SKILLS'; skills: SkillDef[] }
  | { type: 'UPDATE_SKILL'; skillId: string; updates: Partial<SkillDef> }
  | { type: 'INSTALL_SKILL'; skill: SkillDef }
  // Pipeline
  | { type: 'ADD_PIPELINE'; pipeline: Pipeline }
  | { type: 'UPDATE_PIPELINE'; pipelineId: string; updates: Partial<Pipeline> }
  | { type: 'ADVANCE_PIPELINE'; pipelineId: string }
  | { type: 'COMPLETE_PIPELINE'; pipelineId: string }
  | { type: 'FAIL_PIPELINE'; pipelineId: string; error: string }
  // Settings
  | { type: 'SET_USER_SETTINGS'; settings: Partial<UserSettings> }
  // Pipeline Items
  | { type: 'ADD_PIPELINE_ITEM'; item: PipelineItem }
  | { type: 'UPDATE_PIPELINE_ITEM'; id: string; updates: Partial<PipelineItem> }
  | { type: 'REMOVE_PIPELINE_ITEM'; id: string }
  // View Mode
  | { type: 'SET_VIEW_MODE'; mode: ViewMode }
  // Card to Requirement
  | { type: 'CARD_TO_REQUIREMENT_START'; cardId: string }
  | { type: 'CARD_TO_REQUIREMENT_DONE'; cardId: string; todoId: string }
  // Logs
  | { type: 'ADD_LOG'; message: string }
  | { type: 'CLEAR_LOGS' }

export interface AppState {
  project: Project
  logs: string[]
  pipelines: Pipeline[]
  userSettings: UserSettings
  pipelineItems: PipelineItem[]
  viewMode: ViewMode
}
