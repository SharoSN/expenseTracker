import React, { useState } from "react";
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
  onSelectWallet
}: WalletDropdownComponentProps) => {
  const [isFocus, setIsFocus] = useState(false);

  const dropdownData = wallets.map((wallet) => ({
    label: `${wallet.name} ($${wallet.amount})`,
    value: wallet.$id // assuming $id is the unique identifier
  }));

  return (
    <View className="mt-4">
      <Dropdown
        style={{
          height: 50,
          borderWidth: 1,
          borderColor: "#555555",
          borderRadius: 8,
          paddingHorizontal: 12,
          backgroundColor: "#fff"
        }}
        containerStyle={{
          borderColor: "#666666",
          borderRadius: 8,
          backgroundColor: "#fff",
          marginTop: 4,
          elevation: 4,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.1,
          shadowRadius: 2
        }}
        placeholderStyle={{ fontSize: 16, color: "#666666" }}
        selectedTextStyle={{ fontSize: 16, color: "#111827" }}
        inputSearchStyle={{ height: 40, fontSize: 16 }}
        iconStyle={{ width: 20, height: 20 }}
        data={dropdownData}
        search
        maxHeight={300}
        labelField="label"
        valueField="value"
        placeholder={!isFocus ? "Select wallet" : "..."}
        value={selectedWalletId || null}
        searchPlaceholder="Select wallets..."
        onFocus={() => setIsFocus(true)}
        onBlur={() => setIsFocus(false)}
        onChange={(item) => {
          onSelectWallet(item.value);
          setIsFocus(false);
        }}
      />
    </View>
  );
};

export default WalletDropdownComponent;
