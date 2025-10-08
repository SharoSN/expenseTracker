import React, { useState } from "react";
import { View } from "react-native";
import { Dropdown } from "react-native-element-dropdown";
import { transactionTypes } from "@/constants/data";
import { TransactionType } from "@/types";

type DropdownComponentProps = {
  transaction: TransactionType;
  setTransaction: React.Dispatch<React.SetStateAction<TransactionType>>;
};

const DropdownComponent = ({
  transaction,
  setTransaction
}: DropdownComponentProps) => {
  const [isFocus, setIsFocus] = useState(false);

  return (
    <View style={{ marginTop: 16 }}>
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
          borderRadius: 8,
          backgroundColor: "#fff",
          marginTop: 4,
          elevation: 4,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.1,
          shadowRadius: 2
        }}
        placeholderStyle={{ fontSize: 16, color: "#9CA3AF" }}
        selectedTextStyle={{ fontSize: 16, color: "#111827" }}
        inputSearchStyle={{ height: 40, fontSize: 16 }}
        iconStyle={{ width: 20, height: 20 }}
        data={transactionTypes}
        search
        maxHeight={300}
        labelField="label"
        valueField="value"
        placeholder={!isFocus ? "Select transaction type" : "..."}
        searchPlaceholder="Search..."
        value={transaction.type}
        onFocus={() => setIsFocus(true)}
        onBlur={() => setIsFocus(false)}
        onChange={(item) => {
          console.log("DropdownComponent: selected type =", item.value);
          setTransaction({ ...transaction, type: item.value, category: "" }); // reset category on type change
          setIsFocus(false);
        }}
      />
    </View>
  );
};

export default DropdownComponent;
