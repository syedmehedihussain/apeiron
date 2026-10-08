import { create } from 'zustand';

interface UiState {
  magnetOpen: boolean;
  /** Text to send to Magnet when the panel opens (from the Home prompt). */
  magnetDraft: string | null;
  openMagnet(draft?: string): void;
  closeMagnet(): void;
}

export const useUi = create<UiState>((set) => ({
  magnetOpen: false,
  magnetDraft: null,
  openMagnet: (draft) => set({ magnetOpen: true, magnetDraft: draft ?? null }),
  closeMagnet: () => set({ magnetOpen: false, magnetDraft: null }),
}));
