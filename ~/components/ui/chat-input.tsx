import type React from "react";
import {
  View,
  TextInput as RNTextInput,
  KeyboardAvoidingView,
  Keyboard,
  ScrollView,
  Pressable,
} from "react-native";
import { ArrowUp } from "lucide-react-native";
import Animated, {
  useAnimatedStyle,
  useAnimatedKeyboard,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { forwardRef, useEffect } from "react";

type Props = {
  input: string;
  onChangeText: (text: string) => void;
  onSubmit: () => void;
  scrollViewRef: React.RefObject<ScrollView>;
  focusOnMount?: boolean;
};

export const ChatInput = forwardRef<RNTextInput, Props>(
  (
    { input, onChangeText, onSubmit, scrollViewRef, focusOnMount = false },
    ref,
  ) => {
    const { bottom } = useSafeAreaInsets();
    const keyboard = useAnimatedKeyboard();

    useEffect(() => {
      if (focusOnMount) {
        (ref as React.RefObject<RNTextInput>).current?.focus();
      }
    }, [focusOnMount]);

    useEffect(() => {
      const showSubscription = Keyboard.addListener("keyboardDidShow", () => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      });

      const focusSubscription = Keyboard.addListener("keyboardWillShow", () => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      });

      return () => {
        showSubscription.remove();
        focusSubscription.remove();
      };
    }, [scrollViewRef]);

    const animatedStyles = useAnimatedStyle(() => ({
      paddingBottom: withSpring(keyboard.height.value - bottom, {
        damping: 20,
        stiffness: 200,
      }),
    }));

    return (
      <KeyboardAvoidingView>
        <Animated.View style={animatedStyles}>
          <View className="flex-row items-end gap-2 px-6">
            <RNTextInput
              ref={ref}
              placeholder="Message"
              value={input}
              onChangeText={onChangeText}
              multiline
              className="flex-1 bg-gray-100 dark:bg-gray-200 rounded-2xl px-4 py-3 text-base text-black dark:text-black placeholder-gray-400"
              placeholderTextColor="#D1D5DB"
            />

            {/* NativeWind styled Send Button */}
            <Pressable
              onPress={() => {
                onSubmit();
                Keyboard.dismiss();
              }}
            >
              <View className="border bg-black-1 rounded-full p-2">
                <ArrowUp size={24} color="#fff" />
              </View>
            </Pressable>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    );
  },
);
