import { View, Text, ScrollView } from 'react-native';

const ChatInterface = ({ messages }) => {
  return (
    <View className="flex-1 p-4">
      <ScrollView
        className="flex-1 space-y-4 p-4"
        showsVerticalScrollIndicator={false}
      >
        {messages.map((msg) => (
          <View
            key={msg.id}
            className={`flex-row my-2 items-center ${msg.role === "user" ? "justify-end" : "justify-start"
              }`}
          >
            {/* Bot Avatar */}
            {msg.role === "assistant" && (
              <View className="w-8 h-8 bg-gray-200 rounded-full items-center justify-center mr-2">
                <Text>🤖</Text>
              </View>
            )}

            {/* Message Bubble */}
            <View
              className={`p-3 rounded-2xl max-w-[75%] ${msg.role === "user"
                ? "bg-gray-900"
                : "bg-white"
                }`}
            >
              <Text
                className={
                  msg.role === "user" ? "text-white" : "text-black"
                }
              >
                {msg.content}
              </Text>
            </View>
          </View>
        ))}
      </ScrollView>
    </View>
  );
};

export default ChatInterface;

