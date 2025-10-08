import { Tabs } from "expo-router";
import {
  Image,
  ImageSourcePropType,
  Text,
  View,
  TouchableOpacity
} from "react-native";
import icons from "@/constants/icons";
import { BlurView } from "expo-blur";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";

const TabIcon = ({
  focused,
  icon,
  title
}: {
  focused: boolean;
  icon: ImageSourcePropType;
  title: string;
}) => (
  <View className="flex flex-col items-center justify-center">
    <Image
      source={icon}
      tintColor={focused ? "#0061FF" : "#666876"}
      resizeMode="contain"
      className="w-6 h-6"
    />
    <Text
      className={`text-xs mt-1 ${
        focused
          ? "text-primary-300 font-rubik-medium"
          : "text-black-200 font-rubik"
      }`}
    >
      {title}
    </Text>
  </View>
);

const CustomTabBar = (props: BottomTabBarProps) => {
  const { state, descriptors, navigation } = props;

  return (
    <BlurView
      tint="dark"
      intensity={10}
      style={{
        position: "absolute",
        bottom: 20,
        left: 20,
        right: 20,
        height: 65,
        borderRadius: 25,
        overflow: "hidden",
        flexDirection: "row",
        justifyContent: "space-around",
        alignItems: "center",
        shadowColor: "#000",
        shadowOpacity: 0.15,
        shadowRadius: 10,
        elevation: 10
      }}
    >
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const { options } = descriptors[route.key];
        const icon = options.tabBarIcon;

        const onPress = () => {
          if (!focused) {
            navigation.navigate(route.name);
          }
        };

        return (
          <TouchableOpacity
            key={route.key}
            onPress={onPress}
            style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          >
            {icon &&
              icon({
                focused,
                color: focused ? "#0061FF" : "#666876",
                size: 24
              })}
          </TouchableOpacity>
        );
      })}
    </BlurView>
  );
};

const TabsLayout = () => {
  return (
    <Tabs
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        tabBarShowLabel: false,
        headerShown: false,
        tabBarStyle: { display: "none" } // Hide default tab bar
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon={icons.home} title="Home" />
          )
        }}
      />
      <Tabs.Screen
        name="statistics"
        options={{
          title: "Statistics",
          tabBarIcon: ({ focused }) => (
            <TabIcon
              focused={focused}
              icon={icons.statistics}
              title="Statistics"
            />
          )
        }}
      />
      <Tabs.Screen
        name="velora"
        options={{
          title: "Velora",
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon={icons.AI} title="Velora" />
          )
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: "Wallet",
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon={icons.wallet} title="Wallet" />
          )
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} icon={icons.person} title="Profile" />
          )
        }}
      />
    </Tabs>
  );
};

export default TabsLayout;
