// utils/walletIconHelper.ts or lib/walletIconHelper.ts
import { walletIcons } from "@/constants/data";

/**
 * Helper function to get the correct icon source for a wallet
 * Handles predefined icons stored as "icon-0", "icon-1", etc.
 */
export const getWalletIconSource = (imageIdentifier: string | null | undefined) => {
  // Handle null/undefined - return first icon as default
  if (!imageIdentifier) {
    return walletIcons[0]?.icon;
  }

  // If it's a predefined icon identifier (e.g., "icon-0")
  if (imageIdentifier.startsWith('icon-')) {
    const iconIndex = parseInt(imageIdentifier.replace('icon-', ''));
    if (!isNaN(iconIndex) && walletIcons[iconIndex]) {
      return walletIcons[iconIndex].icon;
    }
  }

  // Fallback to first icon if something goes wrong
  return walletIcons[0]?.icon;
};
