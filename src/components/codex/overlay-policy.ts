export type OverlayDismissalPolicyInput = {
  approvalOpen: boolean;
  inputOpen: boolean;
  sidebarOpen: boolean;
  settingsOpen: boolean;
};

export type OverlayDismissalPolicy = {
  closeInput: boolean;
  closeSidebar: boolean;
  closeSettings: boolean;
};

export function resolveOverlayDismissals({
  approvalOpen,
  inputOpen,
  sidebarOpen,
  settingsOpen,
}: OverlayDismissalPolicyInput): OverlayDismissalPolicy {
  const modalOwnsFocus = approvalOpen || inputOpen || settingsOpen;
  return {
    closeInput: approvalOpen && inputOpen,
    closeSidebar: sidebarOpen && modalOwnsFocus,
    closeSettings: settingsOpen && inputOpen,
  };
}
