import { create } from "zustand";

export const useCommerceStore = create((set) => ({
  company: "Wokbook",
  period: "Today",
  setPeriod: (period) => set({ period }),

  session: null,
  setSession: (session) => set({ session }),
  checkingSession: true,
  setCheckingSession: (checkingSession) => set({ checkingSession }),

  // Navigation and permissions both come from the server now (GET
  // /api/apps/nav) — built from the apps this workspace has installed,
  // intersected with what this person's role actually allows.
  navigation: null,
  setNavigation: (navigation) => set({ navigation }),
  navPermissions: [],
  setNavPermissions: (navPermissions) => set({ navPermissions }),

  dashboardData: null,
  setDashboardData: (dashboardData) => set({ dashboardData }),
  isLoadingDashboard: true,
  setIsLoadingDashboard: (isLoadingDashboard) => set({ isLoadingDashboard }),

  connectedChannels: [],
  setConnectedChannels: (val) =>
    set((state) => ({
      connectedChannels: typeof val === "function"
        ? (Array.isArray(val(state.connectedChannels)) ? val(state.connectedChannels) : [])
        : (Array.isArray(val) ? val : []),
    })),
  channelsError: "",
  setChannelsError: (channelsError) => set({ channelsError }),
  isLoadingChannels: true,
  setIsLoadingChannels: (isLoadingChannels) => set({ isLoadingChannels }),
}));
