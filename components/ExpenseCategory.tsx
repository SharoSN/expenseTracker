import React, { useState, useMemo, useCallback } from "react";
import { View } from "react-native";
import { Dropdown } from "react-native-element-dropdown";
import { expenseCategories } from "@/constants/data";
import { TransactionType } from "@/types";

type ExpenseCategoryProps = {
  transaction: TransactionType;
  setTransaction: React.Dispatch<React.SetStateAction<TransactionType>>;
};

const ExpenseCategory = ({
  transaction,
  setTransaction,
}: ExpenseCategoryProps) => {
  const [isFocus, setIsFocus] = useState(false);

  const dropdownData = useMemo(() => Object.values(expenseCategories), []);

  const onFocus = useCallback(() => setIsFocus(true), []);
  const onBlur = useCallback(() => setIsFocus(false), []);
  const onChange = useCallback(
    (item: { value: string }) => {
      console.log("Selected categoy:", item.value);
      setTransaction({ ...transaction, category: item.value });
      setIsFocus(false);
    },
    [transaction, setTransaction]
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

  const placeholderStyle = useMemo(() => ({ fontSize: 16, color: "#666" }), []);
  const selectedTextStyle = useMemo(
    () => ({ fontSize: 16, color: "#111827" }),
    []
  );
  const inputSearchStyle = useMemo(() => ({ height: 40, fontSize: 16 }), []);
  const iconStyle = useMemo(() => ({ width: 20, height: 20 }), []);

  return (
    <View style={{ marginTop: 16 }}>
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
        placeholder={!isFocus ? "Select expense category" : "..."}
        searchPlaceholder="Search categories..."
        value={transaction.category || null}
        onFocus={onFocus}
        onBlur={onBlur}
        onChange={onChange}
      />
    </View>
  );
};

export default ExpenseCategory;
