import React, { useState, useMemo, useCallback } from "react";
import { Text, View } from "react-native";
import { Dropdown } from "react-native-element-dropdown";
import { Wallet } from "@/types";

interface WalletDropdownComponentProps {
  wallets: Wallet[];
  selectedWalletId: string;
  onSelectWallet: (walletId: string) => void;
}

const WalletDropdownComponent = ({
  wallets,
  selectedWalletId,
  onSelectWallet,
}: WalletDropdownComponentProps) => {
  const [isFocus, setIsFocus] = useState(false);

  const dropdownData = useMemo(
    () =>
      wallets.map((wallet) => ({
        label: `${wallet.name} ($${wallet.amount})`,
        value: wallet.$id,
      })),
    [wallets]
  );

  const onFocus = useCallback(() => setIsFocus(true), []);
  const onBlur = useCallback(() => setIsFocus(false), []);
  const onChange = useCallback(
    (item: { value: string }) => {
      onSelectWallet(item.value);
      setIsFocus(false);
    },
    [onSelectWallet]
  );

  const dropdownStyle = useMemo(
    () => ({
      height: 50,
      borderWidth: 1,
      borderColor: "#555555",
      borderRadius: 8,
      paddingHorizontal: 12,
      backgroundColor: "#fff",
    }),
    []
  );

  const containerStyle = useMemo(
    () => ({
      borderColor: "#666666",
      borderRadius: 8,
      backgroundColor: "#fff",
      marginTop: 4,
      elevation: 4,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
    }),
    []
  );

  const placeholderStyle = useMemo(
    () => ({ fontSize: 16, color: "#666666" }),
    []
  );
  const selectedTextStyle = useMemo(
    () => ({ fontSize: 16, color: "#111827" }),
    []
  );
  const inputSearchStyle = useMemo(() => ({ height: 40, fontSize: 16 }), []);
  const iconStyle = useMemo(() => ({ width: 20, height: 20 }), []);

  // prevent dropdown errors when no wallets exist
  if (wallets.length === 0) return null;

  return (
    <View className="mt-4">
      <Dropdown
        style={dropdownStyle}
        containerStyle={containerStyle}
        placeholderStyle={placeholderStyle}
        selectedTextStyle={selectedTextStyle}
        inputSearchStyle={inputSearchStyle}
        iconStyle={iconStyle}
        data={dropdownData}
        search
        maxHeight={300}
        labelField="label"
        valueField="value"
        placeholder={!isFocus ? "Select wallet" : "..."}
        value={selectedWalletId || undefined}
        searchPlaceholder="Select wallets..."
        onFocus={onFocus}
        onBlur={onBlur}
        onChange={onChange}
      />
    </View>
  );
};

export default WalletDropdownComponent;

