import { useRouter } from "expo-router";
import { TouchableOpacity, Image } from "react-native";
import icons from "@/constants/icons"; // assuming you have a back icon here

const BackButton = () => {
  const router = useRouter();

  return (
    <TouchableOpacity onPress={() => router.back()} className="flex w-8">
      <Image source={icons.backarrow} className="size-12 flex" />
    </TouchableOpacity>
  );
};

export default BackButton;
