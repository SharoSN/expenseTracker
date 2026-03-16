import { useEffect, useRef } from "react";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false
  })
});

export function usePushNotifications(
  sendMessage: (data: any) => void,
  userId: string | null
) {
  const notificationListener = useRef<Notifications.Subscription>();
  const responseListener = useRef<Notifications.Subscription>();

  useEffect(() => {
    if (!userId) return;

    registerForPushNotificationsAsync().then((token) => {
      if (token) {
        sendMessage({ type: "register_push_token", pushToken: token });
        console.log("📱 Push token registered:", token);
      }
    });

    notificationListener.current =
      Notifications.addNotificationReceivedListener((notification) => {
        console.log("🔔 Notification received:", notification);
      });

    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data;
        console.log("👆 Notification tapped:", data);
        // Navigate to budgets screen if needed:
        // if (data.type === "budget_alert") router.push("/budgets")
      });

    return () => {
      if (notificationListener.current)
        Notifications.removeNotificationSubscription(
          notificationListener.current
        );
      if (responseListener.current)
        Notifications.removeNotificationSubscription(responseListener.current);
    };
  }, [userId, sendMessage]);
}

async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log("⚠️  Push notifications only work on physical devices");
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("❌ Push notification permission denied");
    return null;
  }

  const tokenData = await Notifications.getExpoPushTokenAsync({
    projectId: "7db25f7b-4103-4546-a636-cb4e9a8c56f2"
  });

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("budget-alerts", {
      name: "Budget Alerts",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF4D6D",
      sound: "default"
    });
  }

  return tokenData.data;
}
