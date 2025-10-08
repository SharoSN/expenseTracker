import { View, Text } from "react-native";
import DropdownComponent from "./DropdownComponent";
import ExpenseCategory from "./ExpenseCategory";
import { TransactionType } from "@/types";

type TransactionFormProps = {
  transaction: TransactionType;
  setTransaction: React.Dispatch<React.SetStateAction<TransactionType>>;
};

const TransactionForm = ({
  transaction,
  setTransaction,
}: TransactionFormProps) => {
  return (
    <View>
      <View className="mt-8 flex flex-col">
        <Text className="text-lg font-medium text-gray-700">Type</Text>
        <DropdownComponent
          transaction={transaction}
          setTransaction={setTransaction}
        />

        {transaction.type === "expense" && (
          <View className="mt-8">
            <Text className="text-lg font-medium text-gray-700">
              Expense Category
            </Text>
            <ExpenseCategory
              transaction={transaction}
              setTransaction={setTransaction}
            />
          </View>
        )}
      </View>
    </View>
  );
};

export default TransactionForm;
