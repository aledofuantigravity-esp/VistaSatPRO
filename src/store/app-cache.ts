import { create } from 'zustand';
import type {
  Attachment,
  Customer,
  PartCatalogItem,
  Profile,
  Task,
  TaskComment,
  TaskHistoryItem,
} from '@/types/database';

export interface CachedTaskDetail {
  task: Task;
  history: TaskHistoryItem[];
  attachments: Attachment[];
  comments: TaskComment[];
  loadedAt: number;
}

interface AppCacheState {
  tasks: Task[];
  tasksIncludeDeleted: boolean;
  tasksViewerKey: string | null;
  tasksLoadedAt: number | null;

  customers: Customer[];
  customersLoadedAt: number | null;

  customerCounts: Record<string, { total: number; active: number }>;
  customerCountsLoadedAt: number | null;

  profiles: Profile[];
  profilesLoadedAt: number | null;

  partsCatalog: PartCatalogItem[];
  partsLoadedAt: number | null;

  taskDetails: Record<string, CachedTaskDetail>;

  setTasks: (tasks: Task[], viewerKey: string, includeDeleted: boolean) => void;
  patchTaskOptimistic: (taskId: string, patch: Partial<Task>) => void;
  invalidateTasks: () => void;

  setCustomers: (customers: Customer[]) => void;
  setCustomerCounts: (counts: Record<string, { total: number; active: number }>) => void;

  setProfiles: (profiles: Profile[]) => void;
  upsertProfile: (profile: Profile) => void;

  setPartsCatalog: (parts: PartCatalogItem[]) => void;
  invalidatePartsCatalog: () => void;

  setTaskDetail: (
    taskId: string,
    detail: Omit<CachedTaskDetail, 'loadedAt'>
  ) => void;
  invalidateTaskDetail: (taskId: string) => void;

  resetAll: () => void;
}

export const useAppCache = create<AppCacheState>((set) => ({
  tasks: [],
  tasksIncludeDeleted: false,
  tasksViewerKey: null,
  tasksLoadedAt: null,

  customers: [],
  customersLoadedAt: null,

  customerCounts: {},
  customerCountsLoadedAt: null,

  profiles: [],
  profilesLoadedAt: null,

  partsCatalog: [],
  partsLoadedAt: null,

  taskDetails: {},

  setTasks: (tasks, viewerKey, includeDeleted) =>
    set({
      tasks,
      tasksViewerKey: viewerKey,
      tasksIncludeDeleted: includeDeleted,
      tasksLoadedAt: Date.now(),
    }),

  patchTaskOptimistic: (taskId, patch) =>
    set((state) => {
      const nextTasks = state.tasks.map((t) =>
        t.id === taskId ? { ...t, ...patch } : t
      );
      const existingDetail = state.taskDetails[taskId];
      const nextDetails = existingDetail
        ? {
            ...state.taskDetails,
            [taskId]: {
              ...existingDetail,
              task: { ...existingDetail.task, ...patch },
            },
          }
        : state.taskDetails;

      return {
        tasks: nextTasks,
        taskDetails: nextDetails,
      };
    }),

  invalidateTasks: () =>
    set({
      tasksLoadedAt: null,
      customerCountsLoadedAt: null,
    }),

  setCustomers: (customers) =>
    set({
      customers,
      customersLoadedAt: Date.now(),
    }),

  setCustomerCounts: (counts) =>
    set({
      customerCounts: counts,
      customerCountsLoadedAt: Date.now(),
    }),

  setProfiles: (profiles) =>
    set({
      profiles,
      profilesLoadedAt: Date.now(),
    }),

  upsertProfile: (profile) =>
    set((state) => {
      const exists = state.profiles.some((p) => p.id === profile.id);
      const nextProfiles = exists
        ? state.profiles.map((p) => (p.id === profile.id ? profile : p))
        : [...state.profiles, profile];
      return {
        profiles: nextProfiles,
        profilesLoadedAt: Date.now(),
      };
    }),

  setPartsCatalog: (parts) =>
    set({
      partsCatalog: parts,
      partsLoadedAt: Date.now(),
    }),

  invalidatePartsCatalog: () =>
    set({
      partsLoadedAt: null,
    }),

  setTaskDetail: (taskId, detail) =>
    set((state) => ({
      taskDetails: {
        ...state.taskDetails,
        [taskId]: {
          ...detail,
          loadedAt: Date.now(),
        },
      },
    })),

  invalidateTaskDetail: (taskId) =>
    set((state) => {
      if (!state.taskDetails[taskId]) return state;
      const next = { ...state.taskDetails };
      delete next[taskId];
      return { taskDetails: next };
    }),

  resetAll: () =>
    set({
      tasks: [],
      tasksIncludeDeleted: false,
      tasksViewerKey: null,
      tasksLoadedAt: null,
      customers: [],
      customersLoadedAt: null,
      customerCounts: {},
      customerCountsLoadedAt: null,
      profiles: [],
      profilesLoadedAt: null,
      partsCatalog: [],
      partsLoadedAt: null,
      taskDetails: {},
    }),
}));
